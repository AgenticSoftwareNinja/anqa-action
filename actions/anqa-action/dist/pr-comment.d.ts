import type { PRAnalysisTestResult, PRAnalysisMappingStats, AffectedFlow } from "./types.js";
interface BuildPRCommentOptions {
    tests: PRAnalysisTestResult[];
    stats: PRAnalysisMappingStats;
    totalFlows: number;
    timingMs: {
        mapping: number;
        execution: number;
        healing: number;
    };
    estimatedCostUsd: number;
    dashboardUrl: string;
    targetWarning: string | undefined;
}
interface BuildDryRunOptions {
    affectedFlows: AffectedFlow[];
    stats: PRAnalysisMappingStats;
    estimatedCostUsd: number;
    estimatedTimeSeconds: number;
    dashboardSettingsUrl: string;
}
export declare function buildPRComment(options: BuildPRCommentOptions): string;
export declare function buildDryRunComment(options: BuildDryRunOptions): string;
export {};
//# sourceMappingURL=pr-comment.d.ts.map