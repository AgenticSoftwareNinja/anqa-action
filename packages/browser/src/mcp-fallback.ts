import type { BrowserSnapshot, SnapshotElement } from "@agentic-nqa/core";
import type { Logger } from "@agentic-nqa/core";

export interface MCPFallbackOptions {
  logger?: Logger;
}

/**
 * Fallback browser driver using @playwright/mcp.
 * Used when playwright-cli is unavailable or fails.
 */
export class MCPFallbackDriver {
  private client: unknown = null;
  private readonly logger?: Logger;

  constructor(options: MCPFallbackOptions = {}) {
    this.logger = options.logger;
  }

  async launch(): Promise<void> {
    // Dynamic import to avoid requiring MCP when playwright-cli works
    const { createMCPClient } = await import("./mcp-loader.js");
    this.client = await createMCPClient();
    this.logger?.info("MCP fallback browser launched");
  }

  async navigate(url: string): Promise<BrowserSnapshot> {
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

  async snapshot(): Promise<BrowserSnapshot> {
    return {
      url: "",
      title: "",
      content: "",
      elements: [],
      timestamp: Date.now(),
    };
  }

  async click(selector: string): Promise<void> {
    this.logger?.debug("MCP click", { selector });
  }

  async fill(selector: string, value: string): Promise<void> {
    this.logger?.debug("MCP fill", { selector, value });
  }

  async setStorageState(_path: string): Promise<void> {
    this.logger?.warn("storageState not supported in MCP fallback driver");
  }

  async close(): Promise<void> {
    this.client = null;
    this.logger?.info("MCP fallback browser closed");
  }
}
