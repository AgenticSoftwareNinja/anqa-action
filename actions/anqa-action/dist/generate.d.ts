import type { AuditReport } from "@agentic-nqa/core";
import type { GenerateOptions, GeneratePayload } from "./types.js";
/**
 * Fetch the latest audit data for a project from the ANQA API.
 */
export declare function fetchAuditData(apiBaseUrl: string, apiKey: string, projectId: string): Promise<AuditReport>;
/**
 * Quick auth probe — HEAD request against the target URL.
 * Throws on 401/403 so the pipeline fails fast.
 */
export declare function probeAuth(targetUrl: string): Promise<void>;
export declare function runGenerate(options: GenerateOptions): Promise<GeneratePayload>;
//# sourceMappingURL=generate.d.ts.map