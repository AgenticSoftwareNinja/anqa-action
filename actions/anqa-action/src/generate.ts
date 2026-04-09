import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  AgentTask,
  AuditReport,
} from "@agentic-nqa/core";
import {
  deriveAppName,
  toErrorMessage,
  createGitHubPRClient,
} from "@agentic-nqa/core";
import { GeneratorAgent } from "@agentic-nqa/generator";
import type {
  GenerateOptions,
  GeneratePayload,
  GenerateTestResult,
  GenerateSummary,
} from "./types.js";
import { selectFlows, auditToTestPlan } from "./audit-to-testplan.js";
import { normalizeError } from "./error-normalizer.js";
import { buildBranchName, buildPRBody } from "./pr-builder.js";
import { buildAgentContext, buildTargetApp } from "./agent-helpers.js";

// ---------------------------------------------------------------------------
// Helpers (exported for testing)
// ---------------------------------------------------------------------------

/**
 * Fetch the latest audit data for a project from the ANQA API.
 */
export async function fetchAuditData(
  apiBaseUrl: string,
  apiKey: string,
  projectId: string,
): Promise<AuditReport> {
  const response = await fetch(
    `${apiBaseUrl}/api/action/audit?project_id=${encodeURIComponent(projectId)}`,
    {
      headers: { "X-ANQA-Key": apiKey },
      signal: AbortSignal.timeout(30_000),
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch audit data: HTTP ${response.status}`);
  }

  const data = (await response.json()) as { audit: AuditReport };
  return data.audit;
}

/**
 * Quick auth probe — HEAD request against the target URL.
 * Throws on 401/403 so the pipeline fails fast.
 */
export async function probeAuth(targetUrl: string): Promise<void> {
  const response = await fetch(targetUrl, {
    method: "HEAD",
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Auth probe failed: HTTP ${response.status} — target requires authentication`,
    );
  }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function runGenerate(options: GenerateOptions): Promise<GeneratePayload> {
  const {
    repoPath,
    targetUrl,
    anthropicApiKey,
    projectId,
    authConfig,
    githubToken,
    githubRepository,
    maxFlows,
    auditData: providedAudit,
    apiBaseUrl,
    apiKey,
  } = options;

  const startTime = Date.now();
  const [owner, repo] = githubRepository.split("/");
  const appName = deriveAppName(targetUrl);

  // ── Step 1: Fetch audit data ──────────────────────────────────────────
  console.log("[anqa:generate] Fetching audit data...");
  const audit = providedAudit ?? (await fetchAuditData(apiBaseUrl, apiKey, projectId));

  // ── Step 2: Auth probe ────────────────────────────────────────────────
  console.log("[anqa:generate] Probing auth...");
  await probeAuth(targetUrl);

  // ── Step 3: Select flows ──────────────────────────────────────────────
  console.log("[anqa:generate] Selecting flows...");
  const selectedGaps = selectFlows(audit.gaps, maxFlows);

  if (selectedGaps.length === 0) {
    console.log("[anqa:generate] No gaps to generate tests for — skipping.");
    return {
      github_action_run_id: process.env.GITHUB_RUN_ID || "",
      mode: "generate",
      trigger: "auto",
      pr_url: null,
      pr_number: null,
      summary: {
        flows_attempted: 0,
        tests_generated: 0,
        tests_passing: 0,
        tests_failed: 0,
        total_heal_attempts: 0,
        generation_time_ms: Date.now() - startTime,
        estimated_token_cost_usd: 0,
      },
      tests: [],
    };
  }

  console.log(`[anqa:generate] Selected ${selectedGaps.length} flows`);

  // ── Step 4: Convert to TestPlan ───────────────────────────────────────
  const testPlan = auditToTestPlan(selectedGaps, audit.proposedTests, appName);

  // ── Step 5: Initialize GeneratorAgent ─────────────────────────────────
  console.log("[anqa:generate] Initializing generator agent...");
  const targetApp = buildTargetApp(appName, targetUrl, projectId, authConfig, repoPath);
  const storageStatePath =
    authConfig?.method === "setup_file" && authConfig.path
      ? join(repoPath, authConfig.path)
      : undefined;
  const ctx = buildAgentContext(anthropicApiKey, storageStatePath);

  const generator = new GeneratorAgent();
  await generator.init(ctx);

  // ── Step 6: Plan + Execute ────────────────────────────────────────────
  const task: AgentTask = {
    id: `generate-${projectId}-${Date.now()}`,
    type: "generate",
    targetApp,
    input: { testPlan, outputDir: repoPath },
  };

  console.log("[anqa:generate] Planning...");
  const plan = await generator.plan(task);

  console.log(`[anqa:generate] Executing ${plan.steps.length} steps...`);
  const result = await generator.execute(plan);

  // ── Step 7: Map artifacts → GenerateTestResult[] ──────────────────────
  const tests: GenerateTestResult[] = result.artifacts.map((artifact) => {
    const meta = (artifact.metadata ?? {}) as Record<string, unknown>;
    const flowName = (meta.flow as string) ?? "unknown";
    const passed = (meta.passed as boolean) ?? false;
    const healAttempts = (meta.healAttempts as number) ?? 0;
    const error = meta.error as string | undefined;

    // Find the matching gap for priority info
    const gap = selectedGaps.find(
      (g) => g.flowName === flowName || g.flowId === flowName,
    );

    return {
      flow_id: gap?.flowId ?? flowName,
      flow_name: flowName,
      priority: gap?.priority ?? "medium",
      file_path: artifact.path,
      status: passed ? "passing" : "failed",
      heal_attempts: healAttempts,
      error: error,
      normalized_error: error ? normalizeError(error).code : undefined,
    };
  });

  // Include flows that errored out (from agent errors, not artifacts)
  if (result.errors) {
    for (const err of result.errors) {
      const stepId = (err.context?.step as string) ?? "";
      // Avoid duplicates — only add if not already in artifacts
      const alreadyPresent = tests.some((t) => t.flow_id === stepId);
      if (!alreadyPresent) {
        tests.push({
          flow_id: stepId,
          flow_name: stepId,
          priority: "medium",
          file_path: "",
          status: "failed",
          heal_attempts: 0,
          error: err.message,
          normalized_error: normalizeError(err.message).code,
        });
      }
    }
  }

  const passingTests = tests.filter((t) => t.status === "passing");
  const failedTests = tests.filter((t) => t.status === "failed");

  // ── Step 8: Create PR for passing tests ───────────────────────────────
  let prUrl: string | null = null;
  let prNumber: number | null = null;

  if (passingTests.length > 0) {
    console.log(`[anqa:generate] Creating PR with ${passingTests.length} passing tests...`);
    const ghClient = createGitHubPRClient({ token: githubToken });
    const branchName = buildBranchName();

    try {
      // Create branch
      await ghClient.createBranch({
        owner,
        repo,
        baseBranch: "main",
        newBranch: branchName,
      });

      // Read test files from disk and prepare for commit
      const files: Array<{ path: string; content: string }> = [];
      for (const test of passingTests) {
        try {
          const content = await readFile(test.file_path, "utf-8");
          // Extract filename from the local path and place in tests/anqa/
          const fileName = test.file_path.split("/").pop() ?? "test.spec.ts";
          files.push({
            path: `tests/anqa/${fileName}`,
            content,
          });
        } catch {
          console.warn(`[anqa:generate] Could not read test file: ${test.file_path}`);
        }
      }

      if (files.length > 0) {
        // Commit files
        await ghClient.commitFiles({
          owner,
          repo,
          branch: branchName,
          message: `test(anqa): add ${files.length} generated Playwright tests`,
          files,
        });

        // Build PR body
        const coverageBefore = audit.coverageMap.summary.coveragePercent;
        const coverageAfter = Math.min(
          100,
          coverageBefore +
            (passingTests.length / audit.coverageMap.summary.totalFlows) * 100,
        );

        const body = buildPRBody({
          tests,
          targetUrl,
          coverageBefore,
          coverageAfter: Math.round(coverageAfter),
          estimatedCost: 0, // Token cost tracking is a future enhancement
          failedCount: failedTests.length,
        });

        // Create PR
        const pr = await ghClient.createPR({
          owner,
          repo,
          head: branchName,
          base: "main",
          title: `test(anqa): add ${files.length} generated Playwright tests`,
          body,
        });

        prUrl = pr.url;
        prNumber = pr.number;
        console.log(`[anqa:generate] PR created: ${prUrl}`);
      } else {
        // No files readable — clean up the orphan branch
        await ghClient.deleteBranch({ owner, repo, branch: branchName });
      }
    } catch (prError) {
      // Orphan branch cleanup on partial failure
      console.error(`[anqa:generate] PR creation failed: ${toErrorMessage(prError)}`);
      try {
        await ghClient.deleteBranch({ owner, repo, branch: branchName });
      } catch {
        // Best-effort cleanup
      }
    }
  } else {
    console.log("[anqa:generate] No passing tests — skipping PR creation.");
  }

  // ── Step 9: Build summary + return payload ────────────────────────────
  const totalHealAttempts = tests.reduce((sum, t) => sum + t.heal_attempts, 0);

  const summary: GenerateSummary = {
    flows_attempted: selectedGaps.length,
    tests_generated: tests.length,
    tests_passing: passingTests.length,
    tests_failed: failedTests.length,
    total_heal_attempts: totalHealAttempts,
    generation_time_ms: Date.now() - startTime,
    estimated_token_cost_usd: 0, // Future enhancement
  };

  return {
    github_action_run_id: process.env.GITHUB_RUN_ID || "",
    mode: "generate",
    trigger: "auto",
    pr_url: prUrl,
    pr_number: prNumber,
    summary,
    tests,
  };
}
