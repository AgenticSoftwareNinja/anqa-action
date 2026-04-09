import type { StatusPayload, AuditPayload, GeneratePayload, PRAnalysisPayload, NightlyPayload, LockResult } from "./types.js";
export declare function postStatus(apiBaseUrl: string, apiKey: string, payload: StatusPayload): Promise<void>;
export declare function postAuditResults(apiBaseUrl: string, apiKey: string, payload: AuditPayload): Promise<void>;
export declare function postGenerateResults(apiBaseUrl: string, apiKey: string, payload: GeneratePayload): Promise<void>;
export declare function postPRAnalysisResults(apiBaseUrl: string, apiKey: string, payload: PRAnalysisPayload): Promise<void>;
export declare function postNightlyResults(apiBaseUrl: string, apiKey: string, payload: NightlyPayload): Promise<void>;
export declare function acquireLock(apiBaseUrl: string, apiKey: string, mode: string, githubActionRunId: string): Promise<LockResult>;
//# sourceMappingURL=webhook.d.ts.map