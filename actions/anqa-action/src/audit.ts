import type {
  AuditReport,
  AuditGap,
  ProposedTest,
  AgentContext,
  TargetApp,
  TestFlow,
  CoverageMap,
} from "@agentic-nqa/core";
import { createLLMClient, createLogger, createEmptyMetrics } from "@agentic-nqa/core";
import { createBrowserClient } from "@agentic-nqa/browser";
import {
  scanRepository,
  appDiscoverySkill,
  flowAnalysisSkill,
  coverageEvaluatorSkill,
} from "@agentic-nqa/planner";
import type { AuthConfig } from "./types.js";

export interface AuditOptions {
  repoPath: string;
  targetUrl: string;
  anthropicApiKey: string;
  projectId: string;
  authConfig: AuthConfig | null;
}

export async function runAudit(options: AuditOptions): Promise<AuditReport> {
  const { repoPath, targetUrl, anthropicApiKey, projectId, authConfig } = options;
  const logger = createLogger({ component: "audit-action" });
  const llm = createLLMClient(anthropicApiKey);

  // Build agent context
  const storageStatePath =
    authConfig?.method === "setup_file" && authConfig.path
      ? `${repoPath}/${authConfig.path}`
      : undefined;

  const browser = createBrowserClient({ storageStatePath });

  const ctx: AgentContext = {
    llm,
    browser,
    rag: { search: async () => [], ingest: async () => "", delete: async () => {} },
    metrics: { record() {}, snapshot: () => createEmptyMetrics() },
    config: {
      anthropicApiKey,
      supabaseUrl: "",
      supabaseKey: "",
      embeddingProvider: "bedrock",
      awsRegion: "us-east-1",
      modelsConfig: { planner: "claude-sonnet-4-20250514", generator: "claude-sonnet-4-20250514", healer: "claude-sonnet-4-20250514" },
    },
  };

  const targetApp: TargetApp = {
    name: repoPath.split("/").pop() || "app",
    url: targetUrl,
    projectId,
    auth: authConfig?.method === "setup_file"
      ? { type: "storage-state", storageStatePath }
      : authConfig?.method === "credentials"
        ? { type: "basic", credentials: { username: authConfig.username!, password: authConfig.password! } }
        : { type: "none" },
  };

  try {
    // Step 1: Scan repository
    logger.info("Scanning repository...");
    const repoAnalysis = await scanRepository(repoPath);

    // Step 2: Discover pages
    logger.info("Discovering app pages...");
    const pageInventory = await appDiscoverySkill.execute(ctx, {
      targetApp,
      maxDepth: 3,
    });

    // Step 3: Analyze flows
    logger.info("Mapping user flows...");
    const flows = await flowAnalysisSkill.execute(ctx, {
      inventory: pageInventory,
      targetAppName: targetApp.name,
    });

    // Step 4: Evaluate coverage
    logger.info("Evaluating test coverage...");
    const coverageMap = await coverageEvaluatorSkill.execute(ctx, {
      flows,
      existingTests: repoAnalysis.existingTests,
    });

    // Step 5: Derive gaps and proposed tests
    const typedFlows = flows as TestFlow[];
    const typedCoverage = coverageMap as CoverageMap;

    const gaps: AuditGap[] = typedCoverage.flows
      .filter((fc) => fc.status === "uncovered" || fc.status === "partial")
      .map((fc) => ({
        flowId: fc.flowId,
        flowName: fc.flowName,
        priority: fc.priority,
        reason: fc.status === "uncovered" ? "No existing test covers this flow" : "Existing tests only partially cover this flow",
      }));

    const proposedTests: ProposedTest[] = gaps
      .filter((g) => g.priority === "critical" || g.priority === "high")
      .slice(0, 5)
      .map((g) => {
        const flow = typedFlows.find((f) => f.id === g.flowId);
        return {
          flowId: g.flowId,
          flowName: g.flowName,
          priority: g.priority,
          description: flow?.description || `Test for ${g.flowName}`,
          estimatedComplexity: g.priority === "critical" ? "moderate" as const : "simple" as const,
        };
      });

    return {
      projectId,
      repoAnalysis,
      flowInventory: typedFlows,
      coverageMap: typedCoverage,
      gaps,
      proposedTests,
      createdAt: new Date().toISOString(),
    };
  } finally {
    await browser.close();
  }
}
