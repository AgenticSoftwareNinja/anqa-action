// actions/anqa-action/src/__tests__/pr-comment.test.ts
import { describe, it, expect } from "vitest";
import { buildPRComment, buildDryRunComment } from "../pr-comment.js";
import type { PRAnalysisTestResult, PRAnalysisMappingStats } from "../types.js";

describe("buildPRComment", () => {
  const baseTests: PRAnalysisTestResult[] = [
    { flow_id: "login", flow_name: "User login", confidence: "definite", file_path: "tests/anqa/login-flow.spec.ts", status: "passed", heal_attempts: 0 },
    { flow_id: "settings", flow_name: "Settings", confidence: "definite", file_path: "tests/anqa/settings-flow.spec.ts", status: "healed", heal_attempts: 2, healed_diff: "- old\n+ new" },
  ];
  const baseStats: PRAnalysisMappingStats = { heuristic_matches: 2, llm_escalations: 0, unanalyzed_files: 0, index_hit_rate: 100 };

  it("includes the comment marker", () => {
    const comment = buildPRComment({ tests: baseTests, stats: baseStats, totalFlows: 10, timingMs: { mapping: 100, execution: 5000, healing: 3000 }, estimatedCostUsd: 0.12, dashboardUrl: "https://anqa.dev/runs/1", targetWarning: undefined });
    expect(comment).toContain("<!-- anqa-pr-analysis -->");
  });

  it("shows one-line verdict with counts", () => {
    const comment = buildPRComment({ tests: baseTests, stats: baseStats, totalFlows: 10, timingMs: { mapping: 100, execution: 5000, healing: 3000 }, estimatedCostUsd: 0.12, dashboardUrl: "https://anqa.dev/runs/1", targetWarning: undefined });
    expect(comment).toContain("1 passed");
    expect(comment).toContain("1 healed");
    expect(comment).toContain("0 failed");
  });

  it("includes healed diff in collapsible section", () => {
    const comment = buildPRComment({ tests: baseTests, stats: baseStats, totalFlows: 10, timingMs: { mapping: 100, execution: 5000, healing: 3000 }, estimatedCostUsd: 0.12, dashboardUrl: "https://anqa.dev/runs/1", targetWarning: undefined });
    expect(comment).toContain("Healed tests");
    expect(comment).toContain("- old");
    expect(comment).toContain("+ new");
  });

  it("includes target URL warning when present", () => {
    const comment = buildPRComment({ tests: baseTests, stats: baseStats, totalFlows: 10, timingMs: { mapping: 100, execution: 5000, healing: 3000 }, estimatedCostUsd: 0.12, dashboardUrl: "https://anqa.dev/runs/1", targetWarning: "Running against production URL" });
    expect(comment).toContain("production URL");
  });
});

describe("buildDryRunComment", () => {
  it("includes dry run marker and no-tests-executed note", () => {
    const comment = buildDryRunComment({
      affectedFlows: [{ flow_id: "login", flow_name: "Login", confidence: "definite", test_file: "tests/anqa/login.spec.ts", matched_files: ["src/auth.ts"] }],
      stats: { heuristic_matches: 1, llm_escalations: 0, unanalyzed_files: 0, index_hit_rate: 100 },
      estimatedCostUsd: 0.05,
      estimatedTimeSeconds: 30,
      dashboardSettingsUrl: "https://anqa.dev/settings",
    });
    expect(comment).toContain("<!-- anqa-pr-analysis -->");
    expect(comment).toContain("dry run");
    expect(comment).toContain("No tests executed");
    expect(comment).toContain("dashboard settings");
  });
});
