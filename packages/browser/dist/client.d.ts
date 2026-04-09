import type { BrowserClient, Logger } from "@agentic-nqa/core";
export interface BrowserClientOptions {
    playwrightCliBin?: string;
    sessionName?: string;
    useMcpFallback?: boolean;
    storageStatePath?: string;
    logger?: Logger;
}
/**
 * Unified browser client: tries playwright-cli first, falls back to MCP.
 */
export declare function createBrowserClient(options?: BrowserClientOptions): BrowserClient;
//# sourceMappingURL=client.d.ts.map