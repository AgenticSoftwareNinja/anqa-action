import type { ProjectConfig } from "./types.js";
export declare function verifyApiKey(apiBaseUrl: string, apiKey: string): Promise<ProjectConfig>;
export declare function checkSiteReachability(url: string): Promise<{
    reachable: boolean;
    error?: string;
}>;
//# sourceMappingURL=validate.d.ts.map