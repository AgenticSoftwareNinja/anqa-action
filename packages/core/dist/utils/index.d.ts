import type { QualityMetrics } from "../types/agent.js";
import type { RAGResult } from "../types/rag.js";
import type { TestResult } from "../types/test-plan.js";
export declare function toErrorMessage(error: unknown): string;
export declare function createEmptyMetrics(overrides?: Partial<QualityMetrics>): QualityMetrics;
export declare function formatRAGContext(results: RAGResult[], header: string): string;
export declare function deriveAppName(url: string): string;
/**
 * Parse Playwright JSON reporter output into TestResult[].
 * Handles both raw JSON objects and JSON embedded in stdout strings.
 */
export declare function parsePlaywrightReport(input: string | Record<string, unknown>): TestResult[];
//# sourceMappingURL=index.d.ts.map