import type { BrowserSnapshot } from "@agentic-nqa/core";
import type { Logger } from "@agentic-nqa/core";
export interface MCPFallbackOptions {
    logger?: Logger;
}
/**
 * Fallback browser driver using @playwright/mcp.
 * Used when playwright-cli is unavailable or fails.
 */
export declare class MCPFallbackDriver {
    private client;
    private readonly logger?;
    constructor(options?: MCPFallbackOptions);
    launch(): Promise<void>;
    navigate(url: string): Promise<BrowserSnapshot>;
    snapshot(): Promise<BrowserSnapshot>;
    click(selector: string): Promise<void>;
    fill(selector: string, value: string): Promise<void>;
    setStorageState(_path: string): Promise<void>;
    close(): Promise<void>;
}
//# sourceMappingURL=mcp-fallback.d.ts.map