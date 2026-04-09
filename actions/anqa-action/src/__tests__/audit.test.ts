import { describe, it, expect, vi } from "vitest";
import { runAudit } from "../audit.js";
import type { RepoAnalysis, CoverageMap, TestFlow, AuditReport } from "@agentic-nqa/core";

// Mock all engine imports
vi.mock("@agentic-nqa/planner", () => ({
  scanRepository: vi.fn(),
  appDiscoverySkill: {
    name: "app-discovery",
    description: "",
    execute: vi.fn(),
  },
  flowAnalysisSkill: {
    name: "flow-analysis",
    description: "",
    execute: vi.fn(),
  },
  coverageEvaluatorSkill: {
    name: "coverage-evaluator",
    description: "",
    execute: vi.fn(),
  },
}));

vi.mock("@agentic-nqa/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@agentic-nqa/core")>();
  return {
    ...actual,
    createLLMClient: vi.fn(() => ({})),
    createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn(), child: vi.fn() })),
  };
});

vi.mock("@agentic-nqa/browser", () => ({
  createBrowserClient: vi.fn(() => ({
    navigate: vi.fn(),
    snapshot: vi.fn(),
    close: vi.fn(),
    setStorageState: vi.fn(),
  })),
}));

import { scanRepository, appDiscoverySkill, flowAnalysisSkill, coverageEvaluatorSkill } from "@agentic-nqa/planner";

describe("runAudit", () => {
  it("orchestrates scan → discover → analyze → evaluate → report", async () => {
    const mockRepoAnalysis: RepoAnalysis = {
      framework: { name: "next", version: "14.0.0", language: "typescript", hasPlaywright: true, hasCypress: false },
      existingTests: [{ path: "tests/login.spec.ts", type: "e2e", framework: "playwright", descriptions: ["login test"] }],
      ciConfig: { hasGitHubActions: true, workflowFiles: [".github/workflows/ci.yml"], hasTestStep: true, hasDeployStep: false },
      aiSetup: { hasClaude: false, hasCopilot: false, hasCursor: false, configFiles: [] },
      analyzedAt: new Date().toISOString(),
    };

    const mockPages = {
      pages: [{ url: "https://app.test.com", title: "Home", snapshot: {} as any, links: [], forms: [], interactiveElements: 5 }],
      navigationGraph: new Map(),
    };

    const mockFlows: TestFlow[] = [
      { id: "f1", name: "User Login", description: "Login flow", priority: "critical", steps: [], assertions: [] },
      { id: "f2", name: "View Dashboard", description: "Dashboard view", priority: "medium", steps: [], assertions: [] },
    ];

    const mockCoverage: CoverageMap = {
      flows: [
        { flowId: "f1", flowName: "User Login", priority: "critical", status: "covered", matchedTests: ["tests/login.spec.ts"], confidence: 0.9 },
        { flowId: "f2", flowName: "View Dashboard", priority: "medium", status: "uncovered", matchedTests: [], confidence: 0.1 },
      ],
      summary: { totalFlows: 2, coveredFlows: 1, partialFlows: 0, uncoveredFlows: 1, coveragePercent: 50 },
      evaluatedAt: new Date().toISOString(),
    };

    vi.mocked(scanRepository).mockResolvedValue(mockRepoAnalysis);
    vi.mocked(appDiscoverySkill.execute).mockResolvedValue(mockPages);
    vi.mocked(flowAnalysisSkill.execute).mockResolvedValue(mockFlows);
    vi.mocked(coverageEvaluatorSkill.execute).mockResolvedValue(mockCoverage);

    const report = await runAudit({
      repoPath: "/workspace",
      targetUrl: "https://app.test.com",
      anthropicApiKey: "sk-ant-test",
      projectId: "proj-123",
      authConfig: null,
    });

    expect(scanRepository).toHaveBeenCalledWith("/workspace");
    expect(appDiscoverySkill.execute).toHaveBeenCalled();
    expect(flowAnalysisSkill.execute).toHaveBeenCalled();
    expect(coverageEvaluatorSkill.execute).toHaveBeenCalled();

    expect(report.repoAnalysis).toEqual(mockRepoAnalysis);
    expect(report.flowInventory).toEqual(mockFlows);
    expect(report.coverageMap).toEqual(mockCoverage);
    expect(report.gaps).toHaveLength(1);
    expect(report.gaps[0].flowName).toBe("View Dashboard");
    expect(report.projectId).toBe("proj-123");
  });
});
