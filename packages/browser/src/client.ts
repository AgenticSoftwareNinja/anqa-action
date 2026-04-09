import type {
  BrowserClient,
  BrowserSnapshot,
  Logger,
} from "@agentic-nqa/core";
import { PlaywrightCliDriver } from "./playwright-cli.js";
import { MCPFallbackDriver } from "./mcp-fallback.js";

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
export function createBrowserClient(
  options: BrowserClientOptions = {},
): BrowserClient {
  const logger = options.logger;
  const cliDriver = new PlaywrightCliDriver({
    bin: options.playwrightCliBin,
    sessionName: options.sessionName,
    logger,
  });
  const mcpDriver = new MCPFallbackDriver({ logger });

  if (options.storageStatePath) {
    // Will be applied when the driver launches
    cliDriver.setStorageState(options.storageStatePath);
  }

  let cliFailures = 0;
  const MAX_CLI_FAILURES = 3;

  async function withFallback<T>(
    cliFn: () => Promise<T>,
    mcpFn: () => Promise<T>,
  ): Promise<T> {
    if (cliFailures < MAX_CLI_FAILURES) {
      try {
        const result = await cliFn();
        cliFailures = 0; // Reset on success
        return result;
      } catch (error) {
        cliFailures++;
        logger?.warn("playwright-cli failed", {
          error: String(error),
          failures: cliFailures,
          permanent: cliFailures >= MAX_CLI_FAILURES,
        });
        await mcpDriver.launch();
        return mcpFn();
      }
    }
    return mcpFn();
  }

  return {
    navigate(url: string): Promise<BrowserSnapshot> {
      return withFallback(
        () => cliDriver.navigate(url),
        () => mcpDriver.navigate(url),
      );
    },

    snapshot(): Promise<BrowserSnapshot> {
      return withFallback(
        () => cliDriver.snapshot(),
        () => mcpDriver.snapshot(),
      );
    },

    async click(selector: string): Promise<void> {
      await withFallback(
        () => cliDriver.click(selector),
        () => mcpDriver.click(selector),
      );
    },

    async fill(selector: string, value: string): Promise<void> {
      await withFallback(
        () => cliDriver.fill(selector, value),
        () => mcpDriver.fill(selector, value),
      );
    },

    async setStorageState(path: string): Promise<void> {
      if (cliFailures < MAX_CLI_FAILURES) {
        await cliDriver.setStorageState(path);
      } else {
        await mcpDriver.setStorageState(path);
      }
    },

    async close(): Promise<void> {
      if (cliFailures < MAX_CLI_FAILURES) {
        await cliDriver.close();
      } else {
        await mcpDriver.close();
      }
    },
  };
}
