import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyApiKey, checkSiteReachability } from "../validate.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("verifyApiKey", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns project config on valid key", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        project_id: "proj-123",
        target_url: "https://app.example.com",
        auth_config: null,
      }),
    });

    const result = await verifyApiKey("https://api.example.com", "anqa_valid");
    expect(result).toEqual({
      projectId: "proj-123",
      targetUrl: "https://app.example.com",
      authConfig: null,
      pr_analysis: null,
    });
  });

  it("throws on invalid key (401)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    });

    await expect(
      verifyApiKey("https://api.example.com", "anqa_invalid"),
    ).rejects.toThrow("Invalid API key");
  });

  it("throws on server error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    });

    await expect(
      verifyApiKey("https://api.example.com", "anqa_key"),
    ).rejects.toThrow("API key verification failed");
  });
});

describe("checkSiteReachability", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true for reachable site", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });
    const result = await checkSiteReachability("https://app.example.com");
    expect(result).toEqual({ reachable: true });
  });

  it("returns false with message for unreachable site", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await checkSiteReachability("https://unreachable.example.com");
    expect(result).toEqual({
      reachable: false,
      error: expect.stringContaining("ECONNREFUSED"),
    });
  });

  it("returns false for non-2xx response", async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503, statusText: "Service Unavailable" });
    const result = await checkSiteReachability("https://down.example.com");
    expect(result).toEqual({
      reachable: false,
      error: "HTTP 503: Service Unavailable",
    });
  });
});
