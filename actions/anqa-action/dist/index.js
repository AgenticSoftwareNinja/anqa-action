import { readFileSync } from "node:fs";
import { verifyApiKey, checkSiteReachability } from "./validate.js";
import { postStatus, postAuditResults, postGenerateResults, postPRAnalysisResults, postNightlyResults, acquireLock } from "./webhook.js";
import { runAudit } from "./audit.js";
import { runGenerate } from "./generate.js";
import { runNightly } from "./nightly.js";
import { Octokit } from "@octokit/rest";
import { runPRAnalysis, fetchAuditDataExtended, postOrUpdatePRComment } from "./pr-analysis.js";
import { resolveCheckConclusion, createCheckRun } from "./check-run.js";
function parsePRContext() {
    const defaults = { prNumber: 0, prUrl: "", prBaseBranch: "", prHeadBranch: "", prHeadSha: "", prIsFork: false, prIsDraft: false };
    const eventPath = process.env.GITHUB_EVENT_PATH;
    if (!eventPath)
        return defaults;
    try {
        const event = JSON.parse(readFileSync(eventPath, "utf-8"));
        const pr = event.pull_request;
        if (!pr)
            return defaults;
        return {
            prNumber: pr.number ?? 0,
            prUrl: pr.html_url ?? "",
            prBaseBranch: pr.base?.ref ?? "",
            prHeadBranch: pr.head?.ref ?? "",
            prHeadSha: pr.head?.sha ?? "",
            prIsFork: pr.head?.repo?.full_name !== pr.base?.repo?.full_name,
            prIsDraft: pr.draft ?? false,
        };
    }
    catch {
        return defaults;
    }
}
function readConfig() {
    const required = (name) => {
        const value = process.env[name];
        if (!value)
            throw new Error(`Missing required env var: ${name}`);
        return value;
    };
    return {
        mode: (process.env.INPUT_MODE || "audit"),
        anqaApiKey: required("INPUT_API_KEY"),
        anthropicApiKey: required("INPUT_ANTHROPIC_KEY"),
        targetUrl: required("INPUT_TARGET_URL"),
        apiBaseUrl: process.env.INPUT_API_BASE_URL || "https://dashboard-theta-five-98.vercel.app",
        githubToken: required("GITHUB_TOKEN"),
        githubRepository: required("GITHUB_REPOSITORY"),
        githubRunId: required("GITHUB_RUN_ID"),
        dryRun: process.env.INPUT_DRY_RUN === "true",
        eventName: process.env.GITHUB_EVENT_NAME ?? "",
        // PR context parsed from GitHub event payload JSON
        ...parsePRContext(),
    };
}
async function main() {
    const config = readConfig();
    const autoGenerate = process.env.INPUT_AUTO_GENERATE === "true";
    const maxFlows = parseInt(process.env.INPUT_MAX_FLOWS || "10", 10);
    const trigger = process.env.GITHUB_EVENT_NAME === "schedule" ? "schedule" : "manual";
    console.log(`[anqa] Starting ${config.mode} action`);
    console.log(`[anqa] Target: ${config.targetUrl}`);
    // Step 1: Verify API key
    console.log("[anqa] Verifying API key...");
    let projectConfig;
    try {
        projectConfig = await verifyApiKey(config.apiBaseUrl, config.anqaApiKey);
    }
    catch (error) {
        console.error(`[anqa] API key verification failed: ${error}`);
        await postStatus(config.apiBaseUrl, config.anqaApiKey, {
            status: "failed",
            github_action_run_id: config.githubRunId,
            mode: config.mode,
            trigger,
            error: "key_invalid",
        }).catch(() => { }); // Best-effort
        process.exit(1);
    }
    // Step 2: Report running status
    await postStatus(config.apiBaseUrl, config.anqaApiKey, {
        status: "running",
        github_action_run_id: config.githubRunId,
        mode: config.mode,
        trigger,
    }).catch((e) => console.warn(`[anqa] Failed to post running status: ${e}`));
    // Step 3: Check site reachability
    console.log(`[anqa] Checking site reachability: ${config.targetUrl}`);
    const siteCheck = await checkSiteReachability(config.targetUrl);
    if (!siteCheck.reachable) {
        console.error(`[anqa] Site unreachable: ${siteCheck.error}`);
        await postStatus(config.apiBaseUrl, config.anqaApiKey, {
            status: "failed",
            github_action_run_id: config.githubRunId,
            mode: config.mode,
            trigger,
            error: `site_unreachable: ${siteCheck.error}`,
        }).catch(() => { });
        process.exit(1);
    }
    // Step 4: Route by mode
    const workspace = process.env.GITHUB_WORKSPACE || "/github/workspace";
    if (config.mode === "generate") {
        const generateResult = await runGenerate({
            repoPath: workspace,
            targetUrl: projectConfig.targetUrl,
            anthropicApiKey: config.anthropicApiKey,
            projectId: projectConfig.projectId,
            authConfig: projectConfig.authConfig,
            githubToken: config.githubToken,
            githubRepository: config.githubRepository,
            maxFlows,
            apiBaseUrl: config.apiBaseUrl,
            apiKey: config.anqaApiKey,
        });
        generateResult.github_action_run_id = config.githubRunId;
        generateResult.trigger = trigger;
        await postGenerateResults(config.apiBaseUrl, config.anqaApiKey, generateResult);
        console.log(`[anqa] Generation complete: ${generateResult.summary.tests_passing}/${generateResult.summary.flows_attempted} tests passing`);
        if (generateResult.pr_url) {
            console.log(`[anqa] PR created: ${generateResult.pr_url}`);
        }
        return;
    }
    // Auto-detect nightly mode from schedule event
    const effectiveMode = config.mode === "audit" && config.eventName === "schedule"
        ? "nightly"
        : config.mode === "audit" && config.eventName === "pull_request"
            ? "pr-analysis"
            : config.mode;
    if (effectiveMode === "nightly") {
        console.log("Mode: Nightly Improvement");
        // Check nightly policy
        const nightlyConfig = projectConfig.nightly;
        if (!nightlyConfig?.enabled) {
            console.log("Nightly improvements disabled for this project. Exiting.");
            process.exit(0);
        }
        // Validate config caps
        const validatedConfig = {
            ...nightlyConfig,
            max_flows: Math.min(nightlyConfig.max_flows, 50),
            max_heal_attempts: Math.min(nightlyConfig.max_heal_attempts, 10),
        };
        // Acquire lock
        const lockResult = await acquireLock(config.apiBaseUrl, config.anqaApiKey, "nightly", config.githubRunId);
        if (!lockResult.acquired) {
            console.log(`Project busy (${lockResult.busy_mode}). Posting skipped status.`);
            // Post skipped status to dashboard
            await postStatus(config.apiBaseUrl, config.anqaApiKey, {
                status: "skipped",
                github_action_run_id: config.githubRunId,
                mode: "nightly",
                trigger,
                error: `lock_contention:${lockResult.busy_mode}`,
            }).catch(() => { });
            // GitHub Actions annotation (visible in Actions UI)
            console.log("::warning::ANQA nightly skipped: another run in progress");
            process.exit(0);
        }
        try {
            const results = await runNightly({
                repoPath: workspace,
                targetUrl: projectConfig.targetUrl,
                anthropicApiKey: config.anthropicApiKey,
                projectId: projectConfig.projectId,
                authConfig: projectConfig.authConfig,
                githubToken: config.githubToken,
                githubRepository: config.githubRepository,
                apiBaseUrl: config.apiBaseUrl,
                apiKey: config.anqaApiKey,
                config: validatedConfig,
            });
            results.github_action_run_id = config.githubRunId;
            await postNightlyResults(config.apiBaseUrl, config.anqaApiKey, results);
            console.log(`[anqa] Nightly complete: ${results.summary.tests_healed} healed, ${results.summary.tests_generated_passing} new tests`);
            if (results.pr_url) {
                console.log(`[anqa] PR created: ${results.pr_url}`);
            }
        }
        catch (error) {
            console.error(`[anqa] Nightly failed: ${error}`);
            process.exitCode = 1;
        }
        finally {
            // Always release lock by updating run status — prevents lock held forever
            // if postNightlyResults or any other step throws.
            await postStatus(config.apiBaseUrl, config.anqaApiKey, {
                status: process.exitCode ? "failed" : "completed",
                github_action_run_id: config.githubRunId,
                mode: "nightly",
                trigger,
                error: process.exitCode ? "pipeline_error" : undefined,
            }).catch((e) => console.error(`[anqa] Failed to release lock: ${e}`));
            if (process.exitCode)
                process.exit(1);
        }
        return;
    }
    if (effectiveMode === "pr-analysis") {
        console.log("Mode: PR Analysis");
        // Check PR analysis policy (before lock — no lock needed for policy exits)
        const prConfig = projectConfig.pr_analysis;
        if (!prConfig?.enabled) {
            console.log("PR analysis is disabled for this project. Exiting.");
            process.exit(0);
        }
        if (prConfig.skip_drafts && config.prIsDraft) {
            console.log("Skipping draft PR. Exiting.");
            process.exit(0);
        }
        if (prConfig.target_branches.length > 0 && !prConfig.target_branches.includes(config.prBaseBranch)) {
            console.log(`PR targets ${config.prBaseBranch}, not in allowed branches. Exiting.`);
            process.exit(0);
        }
        // Acquire lock
        const [owner, repo] = config.githubRepository.split("/");
        const octokit = new Octokit({ auth: config.githubToken });
        const lockResult = await acquireLock(config.apiBaseUrl, config.anqaApiKey, "pr-analysis", config.githubRunId);
        if (!lockResult.acquired) {
            console.log(`Project busy (${lockResult.busy_mode}). Posting comment and exiting.`);
            const { conclusion, summary } = resolveCheckConclusion({
                passed: 0, healed: 0, failed: 0, skipped: 0,
                isDryRun: false,
                reason: "Another ANQA run in progress",
            });
            await postOrUpdatePRComment(octokit, owner, repo, config.prNumber, `<!-- anqa-pr-analysis -->\n## ANQA PR Analysis\n\nAnother ANQA run is in progress for this project. Wait for it to complete or re-push to retry.`);
            await createCheckRun({
                githubToken: config.githubToken, owner, repo,
                headSha: config.prHeadSha, conclusion, summary,
            });
            process.exit(0);
        }
        // Helper to release lock on early exit (mark run as failed)
        const releaseLock = async (reason) => {
            await postPRAnalysisResults(config.apiBaseUrl, config.anqaApiKey, {
                github_action_run_id: config.githubRunId,
                mode: "pr-analysis",
                trigger: "pr",
                pr_url: config.prUrl,
                pr_number: config.prNumber,
                summary: { files_changed: 0, flows_affected: 0, flows_definite: 0, flows_likely: 0, flows_unanalyzed: 0, tests_run: 0, tests_passed: 0, tests_healed: 0, tests_failed: 0, total_heal_attempts: 0, mapping_time_ms: 0, execution_time_ms: 0, healing_time_ms: 0, total_time_ms: 0, estimated_token_cost_usd: 0 },
                tests: [],
                mapping: { heuristic_matches: 0, llm_escalations: 0, unanalyzed_files: 0, index_hit_rate: 0 },
            }).catch(() => { });
        };
        // Fetch audit data
        const auditData = await fetchAuditDataExtended(config.apiBaseUrl, config.anqaApiKey);
        if (!auditData || auditData.last_audit_age_hours > 168) {
            console.log("No recent audit found. Posting comment and exiting.");
            const { conclusion, summary } = resolveCheckConclusion({
                passed: 0, healed: 0, failed: 0, skipped: 0,
                isDryRun: false,
                reason: "No recent audit found",
            });
            await postOrUpdatePRComment(octokit, owner, repo, config.prNumber, `<!-- anqa-pr-analysis -->\n## ANQA PR Analysis\n\nNo recent audit found. Run an audit to enable PR analysis. [Learn more](https://anqa.dev/docs/pr-analysis)`);
            await createCheckRun({
                githubToken: config.githubToken, owner, repo,
                headSha: config.prHeadSha, conclusion, summary,
            });
            await releaseLock("no_recent_audit");
            process.exit(0);
        }
        if (auditData.generated_test_count < (prConfig.min_tests_required ?? 5)) {
            console.log(`Insufficient tests: ${auditData.generated_test_count}. Exiting.`);
            const { conclusion, summary } = resolveCheckConclusion({
                passed: 0, healed: 0, failed: 0, skipped: 0,
                isDryRun: false,
                reason: `Requires ${prConfig.min_tests_required} tests, found ${auditData.generated_test_count}`,
            });
            await postOrUpdatePRComment(octokit, owner, repo, config.prNumber, `<!-- anqa-pr-analysis -->\n## ANQA PR Analysis\n\nPR analysis requires at least ${prConfig.min_tests_required} generated tests (you have ${auditData.generated_test_count}). Generate tests first. [Getting started](https://anqa.dev/docs/generation)`);
            await createCheckRun({
                githubToken: config.githubToken, owner, repo,
                headSha: config.prHeadSha, conclusion, summary,
            });
            await releaseLock("insufficient_tests");
            process.exit(0);
        }
        // Run the pipeline (wrapped in try/catch to release lock on crash)
        try {
            const results = await runPRAnalysis({
                targetUrl: config.targetUrl,
                anthropicApiKey: config.anthropicApiKey,
                projectId: projectConfig.projectId,
                authConfig: projectConfig.authConfig,
                githubToken: config.githubToken,
                githubRepository: config.githubRepository,
                apiBaseUrl: config.apiBaseUrl,
                apiKey: config.anqaApiKey,
                prNumber: config.prNumber,
                prUrl: config.prUrl,
                prBaseBranch: config.prBaseBranch,
                prHeadBranch: config.prHeadBranch,
                prHeadSha: config.prHeadSha,
                prIsFork: config.prIsFork,
                prIsDraft: config.prIsDraft,
                dryRun: config.dryRun,
            }, prConfig, auditData);
            results.github_action_run_id = config.githubRunId;
            await postPRAnalysisResults(config.apiBaseUrl, config.anqaApiKey, results);
            console.log("PR analysis complete.");
        }
        catch (error) {
            console.error(`[anqa] PR analysis failed: ${error}`);
            await postStatus(config.apiBaseUrl, config.anqaApiKey, {
                status: "failed",
                github_action_run_id: config.githubRunId,
                mode: "pr-analysis",
                trigger: "pr",
                error: error instanceof Error ? error.message : String(error),
            }).catch(() => { });
            await releaseLock("pipeline_crash");
            process.exit(1);
        }
        return;
    }
    if (effectiveMode !== "audit") {
        throw new Error(`Unsupported mode: ${effectiveMode}`);
    }
    try {
        console.log("[anqa] Running audit...");
        const repoPath = workspace;
        const report = await runAudit({
            repoPath,
            targetUrl: config.targetUrl,
            anthropicApiKey: config.anthropicApiKey,
            projectId: projectConfig.projectId,
            authConfig: projectConfig.authConfig,
        });
        // Step 5: POST results
        console.log("[anqa] Posting audit results...");
        await postAuditResults(config.apiBaseUrl, config.anqaApiKey, {
            audit: report,
            github_action_run_id: config.githubRunId,
            mode: "audit",
            trigger,
        });
        console.log("[anqa] Audit complete!");
        console.log(`[anqa] Flows discovered: ${report.coverageMap.summary.totalFlows}`);
        console.log(`[anqa] Coverage: ${report.coverageMap.summary.coveragePercent}%`);
        console.log(`[anqa] Critical gaps: ${report.gaps.filter((g) => g.priority === "critical").length}`);
        // Auto-generate after audit if enabled and gaps found
        if (autoGenerate) {
            const criticalHighGaps = report.gaps.filter((g) => g.priority === "critical" || g.priority === "high");
            if (criticalHighGaps.length > 0) {
                console.log(`[anqa] Auto-generate: ${criticalHighGaps.length} critical/high gaps found. Starting generation...`);
                await postStatus(config.apiBaseUrl, config.anqaApiKey, {
                    status: "running",
                    github_action_run_id: config.githubRunId,
                    mode: "generate",
                    trigger: "auto",
                });
                const generateResult = await runGenerate({
                    repoPath: workspace,
                    targetUrl: projectConfig.targetUrl,
                    anthropicApiKey: config.anthropicApiKey,
                    projectId: projectConfig.projectId,
                    authConfig: projectConfig.authConfig,
                    githubToken: config.githubToken,
                    githubRepository: config.githubRepository,
                    maxFlows,
                    auditData: report,
                    apiBaseUrl: config.apiBaseUrl,
                    apiKey: config.anqaApiKey,
                });
                generateResult.github_action_run_id = config.githubRunId;
                generateResult.trigger = "auto";
                await postGenerateResults(config.apiBaseUrl, config.anqaApiKey, generateResult);
                console.log(`[anqa] Auto-generation complete: ${generateResult.summary.tests_passing}/${generateResult.summary.flows_attempted} tests passing`);
                if (generateResult.pr_url) {
                    console.log(`[anqa] PR created: ${generateResult.pr_url}`);
                }
            }
        }
    }
    catch (error) {
        console.error(`[anqa] Audit failed: ${error}`);
        await postStatus(config.apiBaseUrl, config.anqaApiKey, {
            status: "failed",
            github_action_run_id: config.githubRunId,
            mode: config.mode,
            trigger,
            error: error instanceof Error ? error.message : String(error),
        }).catch(() => { });
        process.exit(1);
    }
}
main();
//# sourceMappingURL=index.js.map