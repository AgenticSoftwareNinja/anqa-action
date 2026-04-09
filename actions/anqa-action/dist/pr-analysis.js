// actions/anqa-action/src/pr-analysis.ts
import { Octokit } from "@octokit/rest";
import { mapDiffToFlows } from "./diff-mapper.js";
import { resolveTargetUrl } from "./target-resolver.js";
import { buildPRComment, buildDryRunComment } from "./pr-comment.js";
import { resolveCheckConclusion, createCheckRun } from "./check-run.js";
import { normalizeError } from "./error-normalizer.js";
import { createGitHubPRClient } from "@agentic-nqa/core";
import { buildTestEnv } from "./agent-helpers.js";
const EXECUTION_BUDGET_MS = 5 * 60 * 1000;
const PER_TEST_TIMEOUT_MS = 60_000;
const PER_TEST_HEAL_BUDGET_MS = 2 * 60 * 1000;
export async function fetchAuditDataExtended(apiBaseUrl, apiKey) {
    const response = await fetch(`${apiBaseUrl}/api/action/audit`, {
        headers: { "X-ANQA-Key": apiKey },
    });
    if (response.status === 404)
        return null;
    if (!response.ok)
        throw new Error(`Audit fetch failed: ${response.status}`);
    return response.json();
}
export async function runPRAnalysis(options, config, auditData) {
    const startTime = Date.now();
    const octokit = new Octokit({ auth: options.githubToken });
    const [owner, repo] = options.githubRepository.split("/");
    // Step 3: Fetch PR diff
    const { data: files } = await octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: options.prNumber,
    });
    const changedFiles = files.map((f) => ({
        filename: f.filename,
        patch: f.patch ?? "",
    }));
    // Step 5: Resolve target URL
    const targetResult = await resolveTargetUrl({
        inputTargetUrl: options.targetUrl,
        projectTargetUrl: options.targetUrl,
        githubToken: options.githubToken,
        owner,
        repo,
        headSha: options.prHeadSha,
    });
    // Step 6-7: Map diff to flows
    const mappingResult = await mapDiffToFlows({
        changedFiles,
        fileToFlowIndex: auditData.file_to_flow_index,
        flowInventory: auditData.flow_inventory,
        dryRun: options.dryRun,
        anthropicApiKey: options.anthropicApiKey,
    });
    // Step 8: Dry-run exit
    if (options.dryRun) {
        const dryRunComment = buildDryRunComment({
            affectedFlows: mappingResult.affectedFlows,
            stats: mappingResult.stats,
            estimatedCostUsd: mappingResult.affectedFlows.length * 0.02,
            estimatedTimeSeconds: mappingResult.affectedFlows.length * 15,
            dashboardSettingsUrl: `${options.apiBaseUrl}/projects/${options.projectId}/settings`,
        });
        await postOrUpdatePRComment(octokit, owner, repo, options.prNumber, dryRunComment);
        const checkResult = resolveCheckConclusion({
            passed: 0, healed: 0, failed: 0, skipped: 0,
            isDryRun: true,
            reason: undefined,
        });
        await createCheckRun({
            githubToken: options.githubToken,
            owner, repo,
            headSha: options.prHeadSha,
            conclusion: checkResult.conclusion,
            summary: checkResult.summary,
        });
        return buildPayload(options, [], mappingResult.stats, changedFiles.length, startTime);
    }
    // Step 9: Locate test files for affected flows
    const flowsWithTests = mappingResult.affectedFlows.filter((f) => f.test_file);
    // Step 10-11: Run tests + heal failures (wrapped in try/finally for lock release)
    const testResults = [];
    const healedFileContents = new Map(); // full file content for direct push
    const executionStart = Date.now();
    let healingTimeMs = 0;
    try {
        for (const flow of flowsWithTests) {
            if (Date.now() - executionStart > EXECUTION_BUDGET_MS) {
                testResults.push({
                    flow_id: flow.flow_id,
                    flow_name: flow.flow_name,
                    confidence: flow.confidence,
                    file_path: flow.test_file,
                    status: "skipped",
                    heal_attempts: 0,
                    normalized_error: "execution_timeout",
                });
                continue;
            }
            // Run the test via Playwright CLI
            const testResult = await runSingleTest(flow, targetResult.url, PER_TEST_TIMEOUT_MS);
            if (testResult.passed) {
                testResults.push({
                    flow_id: flow.flow_id,
                    flow_name: flow.flow_name,
                    confidence: flow.confidence,
                    file_path: flow.test_file,
                    status: "passed",
                    heal_attempts: 0,
                });
            }
            else {
                // Heal the failure via HealerAgent
                const healStart = Date.now();
                const healResult = await healTest(flow, testResult.error, changedFiles, options, PER_TEST_HEAL_BUDGET_MS);
                healingTimeMs += Date.now() - healStart;
                if (healResult.healed && healResult.fullContent) {
                    healedFileContents.set(flow.test_file, healResult.fullContent);
                }
                testResults.push({
                    flow_id: flow.flow_id,
                    flow_name: flow.flow_name,
                    confidence: flow.confidence,
                    file_path: flow.test_file,
                    status: healResult.healed ? "healed" : "failed",
                    heal_attempts: healResult.attempts,
                    error: testResult.error,
                    normalized_error: normalizeError(testResult.error).code,
                    healed_diff: healResult.diff,
                });
            }
        }
    }
    catch (pipelineError) {
        // On crash, results endpoint will set status to 'failed', releasing the lock
        console.error("Pipeline error:", pipelineError);
    }
    const executionTimeMs = Date.now() - executionStart;
    // Step 13: Deliver results
    const passed = testResults.filter((t) => t.status === "passed").length;
    const healed = testResults.filter((t) => t.status === "healed").length;
    const failed = testResults.filter((t) => t.status === "failed").length;
    const skipped = testResults.filter((t) => t.status === "skipped").length;
    // Optional: push healed tests to PR branch (uses FULL file content, not diffs)
    if (config.auto_commit_heals && healed > 0 && !options.prIsFork) {
        try {
            const prClient = createGitHubPRClient({ token: options.githubToken });
            const filesToPush = Array.from(healedFileContents.entries()).map(([path, content]) => ({ path, content }));
            await prClient.pushToExistingBranch({
                owner,
                repo,
                branch: options.prHeadBranch,
                files: filesToPush,
                message: `fix(tests): heal ${healed} tests affected by PR changes`,
            });
        }
        catch {
            // Fall back to comment-with-diffs (already in testResults)
        }
    }
    // PR comment
    const comment = buildPRComment({
        tests: testResults,
        stats: mappingResult.stats,
        totalFlows: auditData.flow_inventory.length,
        timingMs: {
            mapping: mappingResult.mappingTimeMs,
            execution: executionTimeMs - healingTimeMs,
            healing: healingTimeMs,
        },
        estimatedCostUsd: estimateTokenCost(mappingResult.stats, testResults),
        dashboardUrl: `${options.apiBaseUrl}/projects/${options.projectId}/runs`,
        targetWarning: targetResult.warning,
    });
    await postOrUpdatePRComment(octokit, owner, repo, options.prNumber, comment);
    // Check Run
    const checkResult = resolveCheckConclusion({
        passed, healed, failed, skipped,
        isDryRun: false,
        reason: undefined,
    });
    await createCheckRun({
        githubToken: options.githubToken,
        owner, repo,
        headSha: options.prHeadSha,
        conclusion: checkResult.conclusion,
        summary: checkResult.summary,
        detailsText: comment,
    });
    return buildPayload(options, testResults, mappingResult.stats, changedFiles.length, startTime, {
        mapping: mappingResult.mappingTimeMs,
        execution: executionTimeMs - healingTimeMs,
        healing: healingTimeMs,
    });
}
// --- Private helpers ---
export async function postOrUpdatePRComment(octokit, owner, repo, prNumber, body) {
    const MARKER = "<!-- anqa-pr-analysis -->";
    const { data: comments } = await octokit.issues.listComments({
        owner,
        repo,
        issue_number: prNumber,
        per_page: 100,
    });
    const existing = comments.find((c) => c.body?.includes(MARKER));
    if (existing) {
        await octokit.issues.updateComment({ owner, repo, comment_id: existing.id, body });
    }
    else {
        await octokit.issues.createComment({ owner, repo, issue_number: prNumber, body });
    }
}
async function runSingleTest(flow, targetUrl, timeoutMs) {
    const { execFileSync } = await import("child_process");
    try {
        execFileSync("npx", ["playwright", "test", flow.test_file, "--reporter=json"], {
            timeout: timeoutMs,
            env: buildTestEnv(targetUrl),
            stdio: ["pipe", "pipe", "pipe"],
        });
        return { passed: true, error: "" };
    }
    catch (err) {
        const stderr = err.stderr?.toString() ?? "";
        const stdout = err.stdout?.toString() ?? "";
        const error = stderr || stdout || err.message || "Test failed";
        return { passed: false, error };
    }
}
async function healTest(flow, error, changedFiles, options, budgetMs) {
    const { HealerAgent } = await import("@agentic-nqa/healer");
    const { readFileSync, writeFileSync } = await import("fs");
    const { execFileSync } = await import("child_process");
    const originalContent = readFileSync(flow.test_file, "utf-8");
    const prDiffContext = changedFiles
        .map((f) => `--- ${f.filename} ---\n${f.patch}`)
        .join("\n\n");
    const deadline = Date.now() + budgetMs;
    let attempts = 0;
    const MAX_RETRIES = 3;
    while (attempts < MAX_RETRIES && Date.now() < deadline) {
        attempts++;
        try {
            const healer = new HealerAgent();
            await healer.init({
                anthropicApiKey: options.anthropicApiKey,
                targetUrl: options.targetUrl,
                authConfig: options.authConfig,
            });
            const plan = await healer.plan({
                id: `heal-${flow.flow_id}`,
                input: {
                    failedTests: [{
                            testFile: flow.test_file,
                            error,
                            passed: false,
                        }],
                    context: `PR diff that caused the failure:\n${prDiffContext}`,
                },
            });
            const result = await healer.execute(plan);
            // The healer writes healed content directly to the test file.
            // Re-read the file to check if it changed.
            const currentContent = readFileSync(flow.test_file, "utf-8");
            if (currentContent !== originalContent) {
                // Verify the healed test actually passes before reporting as healed
                try {
                    execFileSync("npx", ["playwright", "test", flow.test_file, "--reporter=json"], {
                        timeout: 60_000,
                        env: buildTestEnv(options.targetUrl),
                        stdio: ["pipe", "pipe", "pipe"],
                    });
                }
                catch {
                    // Healed but still fails — revert and retry
                    writeFileSync(flow.test_file, originalContent);
                    continue;
                }
                const diff = computeDiff(originalContent, currentContent);
                return {
                    healed: true,
                    attempts,
                    diff,
                    fullContent: currentContent,
                };
            }
        }
        catch {
            // Retry
        }
    }
    // Ensure original content is restored on all failure paths
    writeFileSync(flow.test_file, originalContent);
    return { healed: false, attempts, diff: undefined, fullContent: undefined };
}
function computeDiff(original, healed) {
    const origLines = original.split("\n");
    const healLines = healed.split("\n");
    const diffLines = [];
    const maxLen = Math.max(origLines.length, healLines.length);
    for (let i = 0; i < maxLen; i++) {
        const orig = origLines[i];
        const heal = healLines[i];
        if (orig !== heal) {
            if (orig !== undefined)
                diffLines.push(`- ${orig}`);
            if (heal !== undefined)
                diffLines.push(`+ ${heal}`);
        }
    }
    return diffLines.join("\n");
}
function estimateTokenCost(stats, tests) {
    const mappingCost = stats.llm_escalations * 0.005;
    const healingCost = tests.filter((t) => t.heal_attempts > 0).length * 0.02;
    return mappingCost + healingCost;
}
function buildPayload(options, tests, stats, filesChanged, startTime, timingMs = { mapping: 0, execution: 0, healing: 0 }) {
    const passed = tests.filter((t) => t.status === "passed").length;
    const healed = tests.filter((t) => t.status === "healed").length;
    const failed = tests.filter((t) => t.status === "failed").length;
    return {
        github_action_run_id: "",
        mode: "pr-analysis",
        trigger: "pr",
        pr_url: options.prUrl,
        pr_number: options.prNumber,
        summary: {
            files_changed: filesChanged,
            flows_affected: tests.length,
            flows_definite: tests.filter((t) => t.confidence === "definite").length,
            flows_likely: tests.filter((t) => t.confidence === "likely").length,
            flows_unanalyzed: stats.unanalyzed_files,
            tests_run: tests.length,
            tests_passed: passed,
            tests_healed: healed,
            tests_failed: failed,
            total_heal_attempts: tests.reduce((sum, t) => sum + t.heal_attempts, 0),
            mapping_time_ms: timingMs.mapping,
            execution_time_ms: timingMs.execution,
            healing_time_ms: timingMs.healing,
            total_time_ms: Date.now() - startTime,
            estimated_token_cost_usd: estimateTokenCost(stats, tests),
        },
        tests,
        mapping: stats,
    };
}
//# sourceMappingURL=pr-analysis.js.map