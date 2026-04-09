// actions/anqa-action/src/nightly.ts
import { readFile, writeFile, rename, unlink } from "node:fs/promises";
import { join, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { deriveAppName, toErrorMessage, createGitHubPRClient, } from "@agentic-nqa/core";
import { GeneratorAgent } from "@agentic-nqa/generator";
import { HealerAgent } from "@agentic-nqa/healer";
import { PlannerAgent } from "@agentic-nqa/planner";
import { fetchAuditDataExtended } from "./pr-analysis.js";
import { normalizeError } from "./error-normalizer.js";
import { auditToTestPlan } from "./audit-to-testplan.js";
import { runPhaseWithBudget, diffFlowInventory, shouldSkipNightly, buildNightlyBranchName, } from "./nightly-utils.js";
import { buildAgentContext, buildTargetApp, buildTestEnv } from "./agent-helpers.js";
// Re-export utilities for convenience
export { runPhaseWithBudget, diffFlowInventory, shouldSkipNightly, buildNightlyBranchName } from "./nightly-utils.js";
// ─── Constants ────────────────────────────────────────
const DEFAULT_HEAL_BUDGET_MS = 10 * 60_000; // 10 min per phase
const DEFAULT_CRAWL_BUDGET_MS = 5 * 60_000; // 5 min
const DEFAULT_GEN_BUDGET_MS = 10 * 60_000; // 10 min
const PER_TEST_HEAL_BUDGET_MS = 2 * 60_000; // 2 min per test
const PER_TEST_TIMEOUT_MS = 60_000;
// ─── Safe Healing (temp file + atomic rename) ─────────
/**
 * Heal a single test file safely: writes to a temp file, only renames on
 * success, restores original on failure/timeout.
 */
export async function healTestSafe(testFilePath, error, options, budgetMs) {
    const original = await readFile(testFilePath, "utf-8");
    const tempPath = testFilePath + ".anqa-heal-tmp";
    const flowName = testFilePath.split("/").pop()?.replace(".spec.ts", "") ?? "unknown";
    await writeFile(tempPath, original);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), budgetMs);
    let attempts = 0;
    let healed = false;
    const maxRetries = options.config.max_heal_attempts;
    try {
        while (attempts < maxRetries) {
            attempts++;
            try {
                const healer = new HealerAgent();
                await healer.init({
                    anthropicApiKey: options.anthropicApiKey,
                    targetUrl: options.targetUrl,
                    authConfig: options.authConfig,
                });
                const plan = await healer.plan({
                    id: `nightly-heal-${flowName}-${attempts}`,
                    input: {
                        failedTests: [{ testFile: tempPath, error, passed: false }],
                        context: "Nightly maintenance run — heal this test to match current app state.",
                    },
                });
                await healer.execute(plan);
                // Check if healer changed the temp file
                const healedContent = await readFile(tempPath, "utf-8");
                if (healedContent !== original) {
                    // Verify the healed test passes
                    try {
                        execFileSync("npx", ["playwright", "test", tempPath, "--reporter=json"], {
                            timeout: PER_TEST_TIMEOUT_MS,
                            env: buildTestEnv(options.targetUrl),
                            stdio: ["pipe", "pipe", "pipe"],
                        });
                    }
                    catch {
                        // Healed but still fails — reset temp and retry
                        await writeFile(tempPath, original);
                        continue;
                    }
                    // Atomic rename on success
                    healed = true;
                    clearTimeout(timeout);
                    await rename(tempPath, testFilePath);
                    return {
                        flow_id: flowName,
                        flow_name: flowName,
                        file_path: testFilePath,
                        status: "healed",
                        attempts,
                    };
                }
            }
            catch (err) {
                if (err.name === "AbortError")
                    break;
                // Retry on other errors
            }
        }
    }
    finally {
        clearTimeout(timeout);
        if (!healed) {
            // Restore original on failure/timeout
            await writeFile(testFilePath, original);
        }
        await unlink(tempPath).catch(() => { });
    }
    return {
        flow_id: flowName,
        flow_name: flowName,
        file_path: testFilePath,
        status: "failed",
        attempts,
        error,
        normalized_error: normalizeError(error).code,
    };
}
// ─── Main Pipeline ────────────────────────────────────
export async function runNightly(options) {
    const startTime = Date.now();
    const { repoPath, targetUrl, anthropicApiKey, projectId, authConfig, githubToken, githubRepository, apiBaseUrl, apiKey, config: nightlyConfig, } = options;
    const [owner, repo] = githubRepository.split("/");
    const appName = deriveAppName(targetUrl);
    const trigger = (process.env.GITHUB_EVENT_NAME === "schedule" ? "schedule" : "manual");
    // Enforce overall pipeline budget from config
    const overallBudgetMs = nightlyConfig.timeout_minutes * 60_000;
    const pipelineDeadline = startTime + overallBudgetMs;
    const remainingBudget = () => Math.max(0, pipelineDeadline - Date.now());
    const healedTests = [];
    const newTests = [];
    let healingTimeMs = 0;
    let crawlTimeMs = 0;
    let generationTimeMs = 0;
    // ── Smart skip: no commits in 24h → skip ────────────────────────────
    if (trigger === "schedule" && shouldSkipNightly(repoPath)) {
        console.log("[anqa:nightly] No commits in last 24h. Skipping nightly run.");
        const summary = {
            tests_run: 0, tests_passed: 0, tests_healed: 0, tests_failed: 0,
            tests_generated: 0, tests_generated_passing: 0,
            flows_discovered: 0, flows_new: 0,
            total_heal_attempts: 0,
            healing_time_ms: 0, crawl_time_ms: 0, generation_time_ms: 0,
            total_time_ms: Date.now() - startTime,
            estimated_token_cost_usd: 0,
            skipped_reason: "no_commits",
        };
        return {
            github_action_run_id: process.env.GITHUB_RUN_ID || "",
            mode: "nightly", trigger,
            pr_url: null, pr_number: null,
            summary, healed_tests: [], new_tests: [],
        };
    }
    // ── Phase 1: Run existing tests → collect failures ──────────────────
    console.log("[anqa:nightly] Phase 1: Running existing tests...");
    const testFiles = await discoverTestFiles(repoPath);
    const failedTests = [];
    let testsRun = 0;
    let testsPassed = 0;
    for (const testFile of testFiles) {
        testsRun++;
        try {
            execFileSync("npx", ["playwright", "test", testFile, "--reporter=json"], {
                timeout: PER_TEST_TIMEOUT_MS,
                env: buildTestEnv(targetUrl),
                cwd: repoPath,
                stdio: ["pipe", "pipe", "pipe"],
            });
            testsPassed++;
        }
        catch (err) {
            const stderr = err.stderr?.toString() ?? "";
            const stdout = err.stdout?.toString() ?? "";
            const error = stderr || stdout || err.message || "Test failed";
            failedTests.push({ file: testFile, error });
        }
    }
    console.log(`[anqa:nightly] Phase 1 complete: ${testsPassed}/${testsRun} passed, ${failedTests.length} failed`);
    // ── Phase 2: Heal failures ──────────────────────────────────────────
    if (failedTests.length > 0) {
        console.log(`[anqa:nightly] Phase 2: Healing ${failedTests.length} failed tests...`);
        const healStart = Date.now();
        const healResults = await runPhaseWithBudget("healing", Math.min(DEFAULT_HEAL_BUDGET_MS, remainingBudget()), async (signal) => {
            const results = [];
            for (const { file, error } of failedTests) {
                if (signal.aborted)
                    break;
                const result = await healTestSafe(file, error, options, PER_TEST_HEAL_BUDGET_MS);
                results.push(result);
            }
            return results;
        }, []);
        healedTests.push(...healResults);
        healingTimeMs = Date.now() - healStart;
        console.log(`[anqa:nightly] Phase 2 complete: ${healResults.filter((r) => r.status === "healed").length} healed`);
    }
    // ── Phase 3: Re-crawl app → diff against stored inventory ───────────
    let newFlows = [];
    if (remainingBudget() === 0) {
        console.log("[anqa:nightly] Overall budget exhausted. Skipping phases 3-4.");
    }
    else {
        console.log("[anqa:nightly] Phase 3: Re-crawling app for new flows...");
        const crawlStart = Date.now();
        const auditData = await fetchAuditDataExtended(apiBaseUrl, apiKey);
        // Guard: no audit data or stale audit
        if (!auditData || auditData.last_audit_age_hours > 168) {
            console.log("[anqa:nightly] No recent audit data. Skipping re-crawl + generation.");
        }
        else if (!auditData.flow_inventory?.length) {
            // Guard: no flow inventory for diffing
            console.log("[anqa:nightly] No flow inventory. Skipping re-crawl + generation.");
        }
        else {
            const crawlResult = await runPhaseWithBudget("crawl", Math.min(DEFAULT_CRAWL_BUDGET_MS, remainingBudget()), async (signal) => {
                const storageStatePath = authConfig?.method === "setup_file" && authConfig.path
                    ? join(repoPath, authConfig.path)
                    : undefined;
                const ctx = buildAgentContext(anthropicApiKey, storageStatePath);
                const planner = new PlannerAgent();
                await planner.init(ctx);
                const targetApp = buildTargetApp(appName, targetUrl, projectId, authConfig, repoPath);
                const task = {
                    id: `nightly-crawl-${projectId}-${Date.now()}`,
                    type: "plan",
                    targetApp,
                    input: { url: targetUrl },
                };
                const plan = await planner.plan(task);
                const result = await planner.execute(plan);
                // Extract discovered flows from planner result
                const discoveredFlows = (result.artifacts ?? []).map((a) => ({
                    id: a.metadata?.flow_id ?? a.path,
                    name: a.metadata?.flow_name ?? a.path,
                    description: a.metadata?.description ?? "",
                    priority: a.metadata?.priority ?? "medium",
                    test_file: null,
                }));
                return discoveredFlows;
            }, []);
            crawlTimeMs = Date.now() - crawlStart;
            if (crawlResult.length > 0) {
                newFlows = diffFlowInventory(crawlResult, auditData.flow_inventory);
                console.log(`[anqa:nightly] Phase 3 complete: ${crawlResult.length} flows discovered, ${newFlows.length} new`);
            }
            else {
                console.log("[anqa:nightly] Phase 3 complete: no flows discovered from crawl");
            }
        }
        // ── Phase 4: Generate tests for new/changed flows ───────────────────
        if (newFlows.length > 0 && remainingBudget() > 0) {
            const maxFlows = Math.min(newFlows.length, nightlyConfig.max_flows);
            const flowsToGenerate = newFlows.slice(0, maxFlows);
            console.log(`[anqa:nightly] Phase 4: Generating tests for ${flowsToGenerate.length} new flows...`);
            const genStart = Date.now();
            const genResults = await runPhaseWithBudget("generation", Math.min(DEFAULT_GEN_BUDGET_MS, remainingBudget()), async (signal) => {
                const storageStatePath = authConfig?.method === "setup_file" && authConfig.path
                    ? join(repoPath, authConfig.path)
                    : undefined;
                const ctx = buildAgentContext(anthropicApiKey, storageStatePath);
                const generator = new GeneratorAgent();
                await generator.init(ctx);
                const targetApp = buildTargetApp(appName, targetUrl, projectId, authConfig, repoPath);
                const gaps = flowsToGenerate.map((f) => ({
                    flowId: f.id,
                    flowName: f.name,
                    priority: f.priority,
                    reason: `New flow discovered: ${f.description}`,
                }));
                const testPlan = auditToTestPlan(gaps, [], appName);
                const task = {
                    id: `nightly-gen-${projectId}-${Date.now()}`,
                    type: "generate",
                    targetApp,
                    input: { testPlan, outputDir: repoPath },
                };
                const plan = await generator.plan(task);
                const result = await generator.execute(plan);
                return result.artifacts.map((artifact) => {
                    const meta = (artifact.metadata ?? {});
                    const flowName = meta.flow ?? "unknown";
                    const passed = meta.passed ?? false;
                    const healAttempts = meta.healAttempts ?? 0;
                    const error = meta.error;
                    const matchedFlow = flowsToGenerate.find((f) => f.name === flowName || f.id === flowName);
                    return {
                        flow_id: matchedFlow?.id ?? flowName,
                        flow_name: flowName,
                        file_path: artifact.path,
                        priority: matchedFlow?.priority ?? "medium",
                        status: passed ? "passing" : "failed",
                        heal_attempts: healAttempts,
                        error,
                        normalized_error: error ? normalizeError(error).code : undefined,
                    };
                });
            }, []);
            newTests.push(...genResults);
            generationTimeMs = Date.now() - genStart;
            console.log(`[anqa:nightly] Phase 4 complete: ${genResults.filter((t) => t.status === "passing").length} passing, ${genResults.filter((t) => t.status === "failed").length} failed`);
        }
        else if (newFlows.length === 0) {
            console.log("[anqa:nightly] Phase 4: No new flows — skipping generation.");
        }
        else {
            console.log("[anqa:nightly] Phase 4: Budget exhausted — skipping generation.");
        }
    }
    // ── Phase 5: Create PR with all changes ─────────────────────────────
    let prUrl = null;
    let prNumber = null;
    const healedCount = healedTests.filter((t) => t.status === "healed").length;
    const passingNewTests = newTests.filter((t) => t.status === "passing");
    if (healedCount > 0 || passingNewTests.length > 0) {
        console.log("[anqa:nightly] Phase 5: Creating PR...");
        const ghClient = createGitHubPRClient({ token: githubToken });
        const branchName = buildNightlyBranchName();
        try {
            await ghClient.createBranch({ owner, repo, baseBranch: "main", newBranch: branchName });
            const files = [];
            // Add healed test files (use relative paths for git commits)
            for (const heal of healedTests.filter((t) => t.status === "healed")) {
                try {
                    const content = await readFile(heal.file_path, "utf-8");
                    const relPath = relative(repoPath, heal.file_path);
                    files.push({ path: relPath, content });
                }
                catch {
                    console.warn(`[anqa:nightly] Could not read healed file: ${heal.file_path}`);
                }
            }
            // Add new passing test files
            for (const test of passingNewTests) {
                try {
                    const content = await readFile(test.file_path, "utf-8");
                    const fileName = test.file_path.split("/").pop() ?? "test.spec.ts";
                    files.push({ path: `tests/anqa/${fileName}`, content });
                }
                catch {
                    console.warn(`[anqa:nightly] Could not read new test file: ${test.file_path}`);
                }
            }
            if (files.length > 0) {
                const commitParts = [];
                if (healedCount > 0)
                    commitParts.push(`heal ${healedCount} tests`);
                if (passingNewTests.length > 0)
                    commitParts.push(`add ${passingNewTests.length} new tests`);
                await ghClient.commitFiles({
                    owner, repo,
                    branch: branchName,
                    message: `test(anqa): nightly — ${commitParts.join(", ")}`,
                    files,
                });
                const body = buildNightlyPRBody(healedTests, newTests, targetUrl);
                const pr = await ghClient.createPR({
                    owner, repo,
                    head: branchName,
                    base: "main",
                    title: `test(anqa): nightly improvements — ${commitParts.join(", ")}`,
                    body,
                });
                prUrl = pr.url;
                prNumber = pr.number;
                console.log(`[anqa:nightly] PR created: ${prUrl}`);
            }
            else {
                await ghClient.deleteBranch({ owner, repo, branch: branchName });
            }
        }
        catch (prError) {
            console.error(`[anqa:nightly] PR creation failed: ${toErrorMessage(prError)}`);
            try {
                await ghClient.deleteBranch({ owner, repo, branch: branchName });
            }
            catch {
                // Best-effort cleanup
            }
        }
    }
    else {
        console.log("[anqa:nightly] Phase 5: No improvements to commit — skipping PR.");
    }
    // ── Autoresearch hook point (no-op, extensible) ─────────────────────
    if (nightlyConfig.learning_enabled) {
        console.log("[anqa:nightly] Autoresearch hook: learning_enabled=true (no-op placeholder)");
        // Future: write heal patterns, error patterns, flow discovery stats to RAG
    }
    // ── Build summary + return payload ──────────────────────────────────
    const summary = {
        tests_run: testsRun,
        tests_passed: testsPassed,
        tests_healed: healedTests.filter((t) => t.status === "healed").length,
        tests_failed: healedTests.filter((t) => t.status === "failed").length,
        tests_generated: newTests.length,
        tests_generated_passing: passingNewTests.length,
        flows_discovered: newFlows.length + (auditData?.flow_inventory?.length ?? 0),
        flows_new: newFlows.length,
        total_heal_attempts: healedTests.reduce((sum, t) => sum + t.attempts, 0),
        healing_time_ms: healingTimeMs,
        crawl_time_ms: crawlTimeMs,
        generation_time_ms: generationTimeMs,
        total_time_ms: Date.now() - startTime,
        estimated_token_cost_usd: estimateNightlyCost(healedTests, newTests),
    };
    return {
        github_action_run_id: process.env.GITHUB_RUN_ID || "",
        mode: "nightly",
        trigger,
        pr_url: prUrl,
        pr_number: prNumber,
        summary,
        healed_tests: healedTests,
        new_tests: newTests,
    };
}
// ─── Helpers ──────────────────────────────────────────
async function discoverTestFiles(repoPath) {
    const { readdirSync, statSync } = await import("node:fs");
    const { join: joinPath } = await import("node:path");
    const testDir = joinPath(repoPath, "tests", "anqa");
    try {
        statSync(testDir);
    }
    catch {
        return []; // tests/anqa/ doesn't exist yet
    }
    const files = [];
    function walk(dir) {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const fullPath = joinPath(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
            }
            else if (entry.name.endsWith(".spec.ts")) {
                files.push(fullPath);
            }
        }
    }
    walk(testDir);
    return files;
}
function estimateNightlyCost(healed, generated) {
    const healCost = healed.length * 0.03; // ~$0.03 per heal attempt
    const genCost = generated.length * 0.50; // ~$0.50 per generation
    return healCost + genCost;
}
function buildNightlyPRBody(healedTests, newTests, targetUrl) {
    const healed = healedTests.filter((t) => t.status === "healed");
    const passing = newTests.filter((t) => t.status === "passing");
    const failed = newTests.filter((t) => t.status === "failed");
    let body = `## Agentic Ninja QA — Nightly Improvements\n\nAutomated nightly maintenance run against \`${targetUrl}\`.\n\n`;
    if (healed.length > 0) {
        body += `### Healed Tests (${healed.length})\n\n`;
        body += `| Test | Attempts |\n|------|----------|\n`;
        body += healed.map((t) => `| ${t.flow_name} | ${t.attempts} |`).join("\n");
        body += "\n\n";
    }
    if (passing.length > 0) {
        body += `### New Tests (${passing.length})\n\n`;
        body += `| Flow | Priority | Status |\n|------|----------|--------|\n`;
        body += passing.map((t) => `| ${t.flow_name} | ${t.priority} | passing |`).join("\n");
        body += "\n\n";
    }
    if (failed.length > 0) {
        body += `> ${failed.length} additional flows attempted but excluded due to test failures.\n\n`;
    }
    body += `### How to run\n\`\`\`bash\nnpx playwright test tests/anqa/\n\`\`\`\n\n`;
    body += `---\nGenerated by [Agentic Ninja QA](https://anqa.dev) nightly pipeline`;
    return body;
}
//# sourceMappingURL=nightly.js.map