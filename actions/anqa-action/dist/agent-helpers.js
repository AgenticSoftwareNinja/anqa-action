// actions/anqa-action/src/agent-helpers.ts
// Shared helpers extracted from generate.ts, nightly.ts, and pr-analysis.ts.
import { join } from "node:path";
import { createLLMClient, createEmptyMetrics } from "@agentic-nqa/core";
import { createBrowserClient } from "@agentic-nqa/browser";
/**
 * Build an AgentContext for LLM-based agents (generator, healer, planner).
 */
export function buildAgentContext(anthropicApiKey, storageStatePath) {
    return {
        llm: createLLMClient(anthropicApiKey),
        browser: createBrowserClient({ storageStatePath }),
        rag: { search: async () => [], ingest: async () => "", delete: async () => { } },
        metrics: { record() { }, snapshot: () => createEmptyMetrics() },
        config: {
            anthropicApiKey,
            supabaseUrl: "",
            supabaseKey: "",
            embeddingProvider: "bedrock",
            awsRegion: "us-east-1",
            modelsConfig: {
                planner: "claude-sonnet-4-20250514",
                generator: "claude-sonnet-4-20250514",
                healer: "claude-sonnet-4-20250514",
            },
        },
    };
}
/**
 * Build a TargetApp descriptor from project config.
 */
export function buildTargetApp(appName, targetUrl, projectId, authConfig, repoPath) {
    const storageStatePath = authConfig?.method === "setup_file" && authConfig.path
        ? join(repoPath, authConfig.path)
        : undefined;
    return {
        name: appName,
        url: targetUrl,
        projectId,
        auth: authConfig?.method === "setup_file"
            ? { type: "storage-state", storageStatePath }
            : authConfig?.method === "credentials"
                ? { type: "basic", credentials: { username: authConfig.username, password: authConfig.password } }
                : { type: "none" },
    };
}
/**
 * Build a sanitized env for running LLM-generated test code.
 * Strips sensitive env var prefixes and sets BASE_URL.
 */
export function buildTestEnv(targetUrl) {
    const SENSITIVE_PREFIXES = ["INPUT_", "ANTHROPIC_", "GITHUB_TOKEN", "ANQA_", "AWS_", "SUPABASE_"];
    const sanitized = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined && !SENSITIVE_PREFIXES.some((p) => key.startsWith(p))) {
            sanitized[key] = value;
        }
    }
    sanitized.BASE_URL = targetUrl;
    return sanitized;
}
//# sourceMappingURL=agent-helpers.js.map