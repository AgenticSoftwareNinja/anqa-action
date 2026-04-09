import type { AuditReport } from "@agentic-nqa/core";
import type { AuthConfig } from "./types.js";
export interface AuditOptions {
    repoPath: string;
    targetUrl: string;
    anthropicApiKey: string;
    projectId: string;
    authConfig: AuthConfig | null;
}
export declare function runAudit(options: AuditOptions): Promise<AuditReport>;
//# sourceMappingURL=audit.d.ts.map