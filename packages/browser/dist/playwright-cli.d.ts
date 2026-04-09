import type { BrowserSnapshot } from "@agentic-nqa/core";
import type { Logger } from "@agentic-nqa/core";
export interface PlaywrightCliOptions {
    bin?: string;
    sessionName?: string;
    headless?: boolean;
    logger?: Logger;
}
export declare class PlaywrightCliDriver {
    private readonly bin;
    private readonly session;
    private readonly logger?;
    private initialized;
    private storageStatePath?;
    constructor(options?: PlaywrightCliOptions);
    private exec;
    setStorageState(path: string): Promise<void>;
    launch(): Promise<void>;
    navigate(url: string): Promise<BrowserSnapshot>;
    snapshot(): Promise<BrowserSnapshot>;
    click(selector: string): Promise<void>;
    fill(selector: string, value: string): Promise<void>;
    screenshot(path: string): Promise<void>;
    close(): Promise<void>;
    private ensureInitialized;
    private parseSnapshot;
}
//# sourceMappingURL=playwright-cli.d.ts.map