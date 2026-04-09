import { createLLMClient, createLogger, createEmptyMetrics } from "@agentic-nqa/core";
import { createBrowserClient } from "@agentic-nqa/browser";
import { scanRepository, appDiscoverySkill, flowAnalysisSkill, coverageEvaluatorSkill, } from "@agentic-nqa/planner";
export async function runAudit(options) {
    const { repoPath, targetUrl, anthropicApiKey, projectId, authConfig } = options;
    const logger = createLogger({ component: "audit-action" });
    const llm = createLLMClient(anthropicApiKey);
    // Build agent context
    const storageStatePath = authConfig?.method === "setup_file" && authConfig.path
        ? `${repoPath}/${authConfig.path}`
        : undefined;
    const browser = createBrowserClient({ storageStatePath });
    const ctx = {
        llm,
        browser,
        rag: { search: async () => [], ingest: async () => "", delete: async () => { } },
        metrics: { record() { }, snapshot: () => createEmptyMetrics() },
        config: {
            anthropicApiKey,
            supabaseUrl: "",
            supabaseKey: "",
            embeddingProvider: "bedrock",
            awsRegion: "us-east-1",
            modelsConfig: { planner: "claude-sonnet-4-20250514", generator: "claude-sonnet-4-20250514", healer: "claude-sonnet-4-20250514" },
        },
    };
    const targetApp = {
        name: repoPath.split("/").pop() || "app",
        url: targetUrl,
        projectId,
        auth: authConfig?.method === "setup_file"
            ? { type: "storage-state", storageStatePath }
            : authConfig?.method === "credentials"
                ? { type: "basic", credentials: { username: authConfig.username, password: authConfig.password } }
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
        const typedFlows = flows;
        const typedCoverage = coverageMap;
        const gaps = typedCoverage.flows
            .filter((fc) => fc.status === "uncovered" || fc.status === "partial")
            .map((fc) => ({
            flowId: fc.flowId,
            flowName: fc.flowName,
            priority: fc.priority,
            reason: fc.status === "uncovered" ? "No existing test covers this flow" : "Existing tests only partially cover this flow",
        }));
        const proposedTests = gaps
            .filter((g) => g.priority === "critical" || g.priority === "high")
            .slice(0, 5)
            .map((g) => {
            const flow = typedFlows.find((f) => f.id === g.flowId);
            return {
                flowId: g.flowId,
                flowName: g.flowName,
                priority: g.priority,
                description: flow?.description || `Test for ${g.flowName}`,
                estimatedComplexity: g.priority === "critical" ? "moderate" : "simple",
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
    }
    finally {
        await browser.close();
    }
}
//# sourceMappingURL=audit.js.map