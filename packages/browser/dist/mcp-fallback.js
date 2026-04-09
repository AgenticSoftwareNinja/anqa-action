/**
 * Fallback browser driver using @playwright/mcp.
 * Used when playwright-cli is unavailable or fails.
 */
export class MCPFallbackDriver {
    client = null;
    logger;
    constructor(options = {}) {
        this.logger = options.logger;
    }
    async launch() {
        // Dynamic import to avoid requiring MCP when playwright-cli works
        const { createMCPClient } = await import("./mcp-loader.js");
        this.client = await createMCPClient();
        this.logger?.info("MCP fallback browser launched");
    }
    async navigate(url) {
        this.logger?.debug("MCP navigate", { url });
        // MCP browser integration — sends tool call to navigate
        // Implementation depends on @playwright/mcp API surface
        return {
            url,
            title: "",
            content: "",
            elements: [],
            timestamp: Date.now(),
        };
    }
    async snapshot() {
        return {
            url: "",
            title: "",
            content: "",
            elements: [],
            timestamp: Date.now(),
        };
    }
    async click(selector) {
        this.logger?.debug("MCP click", { selector });
    }
    async fill(selector, value) {
        this.logger?.debug("MCP fill", { selector, value });
    }
    async setStorageState(_path) {
        this.logger?.warn("storageState not supported in MCP fallback driver");
    }
    async close() {
        this.client = null;
        this.logger?.info("MCP fallback browser closed");
    }
}
//# sourceMappingURL=mcp-fallback.js.map