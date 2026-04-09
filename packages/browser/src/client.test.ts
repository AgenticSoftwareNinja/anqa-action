import { describe, it, expect } from "vitest";
import { createBrowserClient } from "./client.js";

describe("createBrowserClient", () => {
  it("returns a BrowserClient with setStorageState method", () => {
    const client = createBrowserClient({ logger: undefined });
    expect(typeof client.setStorageState).toBe("function");
  });
});
