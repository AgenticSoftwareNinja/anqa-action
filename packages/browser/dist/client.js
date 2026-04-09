import { PlaywrightCliDriver } from "./playwright-cli.js";
import { MCPFallbackDriver } from "./mcp-fallback.js";
/**
 * Unified browser client: tries playwright-cli first, falls back to MCP.
 */
export function createBrowserClient(options = {}) {
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
    async function withFallback(cliFn, mcpFn) {
        if (cliFailures < MAX_CLI_FAILURES) {
            try {
                const result = await cliFn();
                cliFailures = 0; // Reset on success
                return result;
            }
            catch (error) {
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
        navigate(url) {
            return withFallback(() => cliDriver.navigate(url), () => mcpDriver.navigate(url));
        },
        snapshot() {
            return withFallback(() => cliDriver.snapshot(), () => mcpDriver.snapshot());
        },
        async click(selector) {
            await withFallback(() => cliDriver.click(selector), () => mcpDriver.click(selector));
        },
        async fill(selector, value) {
            await withFallback(() => cliDriver.fill(selector, value), () => mcpDriver.fill(selector, value));
        },
        async setStorageState(path) {
            if (cliFailures < MAX_CLI_FAILURES) {
                await cliDriver.setStorageState(path);
            }
            else {
                await mcpDriver.setStorageState(path);
            }
        },
        async close() {
            if (cliFailures < MAX_CLI_FAILURES) {
                await cliDriver.close();
            }
            else {
                await mcpDriver.close();
            }
        },
    };
}
//# sourceMappingURL=client.js.map