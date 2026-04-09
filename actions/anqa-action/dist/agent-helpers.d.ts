import type { AgentContext, TargetApp } from "@agentic-nqa/core";
import type { AuthConfig } from "./types.js";
/**
 * Build an AgentContext for LLM-based agents (generator, healer, planner).
 */
export declare function buildAgentContext(anthropicApiKey: string, storageStatePath: string | undefined): AgentContext;
/**
 * Build a TargetApp descriptor from project config.
 */
export declare function buildTargetApp(appName: string, targetUrl: string, projectId: string, authConfig: AuthConfig | null, repoPath: string): TargetApp;
/**
 * Build a sanitized env for running LLM-generated test code.
 * Strips sensitive env var prefixes and sets BASE_URL.
 */
export declare function buildTestEnv(targetUrl: string): NodeJS.ProcessEnv;
//# sourceMappingURL=agent-helpers.d.ts.map