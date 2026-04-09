/**
 * Lazy loader for @playwright/mcp to avoid import errors when not installed.
 */
export async function createMCPClient(): Promise<unknown> {
  try {
    const mcp = await import("@playwright/mcp");
    // @playwright/mcp API — initialize client
    // Exact API depends on the version installed
    return mcp;
  } catch (error) {
    throw new Error(
      "Failed to load @playwright/mcp. Install it with: pnpm add @playwright/mcp",
    );
  }
}
