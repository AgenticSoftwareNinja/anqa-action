import type { AffectedFlow, FlowInventoryItem, PRAnalysisMappingStats } from "./types.js";
interface ChangedFile {
    filename: string;
    patch: string;
}
interface HeuristicResult {
    matched: Array<{
        filename: string;
        flow_ids: string[];
    }>;
    uncertain: ChangedFile[];
}
interface MapDiffOptions {
    changedFiles: ChangedFile[];
    fileToFlowIndex: Record<string, string[]> | null;
    flowInventory: FlowInventoryItem[];
    dryRun: boolean;
    anthropicApiKey: string;
}
interface MapDiffResult {
    affectedFlows: AffectedFlow[];
    stats: PRAnalysisMappingStats;
    mappingTimeMs: number;
}
export declare function truncateDiff(patch: string, maxLines: number): string;
export declare function heuristicMatch(changedFiles: ChangedFile[], index: Record<string, string[]>): HeuristicResult;
export declare function mapDiffToFlows(options: MapDiffOptions): Promise<MapDiffResult>;
export {};
//# sourceMappingURL=diff-mapper.d.ts.map