import { Octokit } from "@octokit/rest";
import type { PRAnalysisOptions, PRAnalysisPayload, PRAnalysisConfig, AuditDataExtended } from "./types.js";
export declare function fetchAuditDataExtended(apiBaseUrl: string, apiKey: string): Promise<AuditDataExtended | null>;
export declare function runPRAnalysis(options: PRAnalysisOptions, config: PRAnalysisConfig, auditData: AuditDataExtended): Promise<PRAnalysisPayload>;
export declare function postOrUpdatePRComment(octokit: Octokit, owner: string, repo: string, prNumber: number, body: string): Promise<void>;
//# sourceMappingURL=pr-analysis.d.ts.map