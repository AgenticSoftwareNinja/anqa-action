import { describe, it, expect } from "vitest";
import { normalizeError } from "../error-normalizer.js";

describe("normalizeError", () => {
  it("normalizes element not found errors", () => {
    const result = normalizeError("locator.click: Element is not visible");
    expect(result.code).toBe("element_not_found");
    expect(result.guidance).toContain("UI element");
  });

  it("normalizes connection refused errors", () => {
    const result = normalizeError("net::ERR_CONNECTION_REFUSED");
    expect(result.code).toBe("site_unreachable");
    expect(result.guidance).toContain("target URL");
  });

  it("normalizes auth errors", () => {
    const result = normalizeError("HTTP 401 Unauthorized");
    expect(result.code).toBe("auth_failed");
    expect(result.guidance).toContain("auth configuration");
  });

  it("normalizes timeout errors", () => {
    const result = normalizeError("Timeout 30000ms exceeded");
    expect(result.code).toBe("timeout");
    expect(result.guidance).toContain("performance");
  });

  it("normalizes anthropic rate limit errors", () => {
    const result = normalizeError("anthropic API rate_limit_error");
    expect(result.code).toBe("llm_rate_limit");
    expect(result.guidance).toContain("rate limits");
  });

  it("normalizes anthropic invalid key errors", () => {
    const result = normalizeError("anthropic invalid_api_key");
    expect(result.code).toBe("llm_auth_failed");
    expect(result.guidance).toContain("ANTHROPIC_API_KEY");
  });

  it("returns unknown for unrecognized errors", () => {
    const result = normalizeError("something weird happened");
    expect(result.code).toBe("unknown");
    expect(result.guidance).toContain("Check the full error");
  });

  it("normalizes run in progress (409 conflict)", () => {
    const result = normalizeError("409 Conflict");
    expect(result.code).toBe("run_in_progress");
    expect(result.guidance).toContain("Another ANQA run");
  });

  it("normalizes no audit found", () => {
    const result = normalizeError("404 No audit found");
    expect(result.code).toBe("no_audit");
    expect(result.guidance).toContain("Run an audit first");
  });

  it("normalizes stale audit", () => {
    const result = normalizeError("stale_audit: 10 days old");
    expect(result.code).toBe("stale_audit");
    expect(result.guidance).toContain("stale");
  });

  it("normalizes insufficient tests", () => {
    const result = normalizeError("insufficient_tests: 2 of 5 required");
    expect(result.code).toBe("insufficient_tests");
    expect(result.guidance).toContain("generated tests");
  });

  it("normalizes mapping timeout", () => {
    const result = normalizeError("mapping_timeout: exceeded 90s");
    expect(result.code).toBe("mapping_timeout");
    expect(result.guidance).toContain("partial");
  });

  it("normalizes execution timeout", () => {
    const result = normalizeError("execution_timeout: exceeded 5min");
    expect(result.code).toBe("execution_timeout");
    expect(result.guidance).toContain("budget exceeded");
  });

  it("normalizes push to branch failure", () => {
    const result = normalizeError("push_failed: branch protection");
    expect(result.code).toBe("push_failed");
    expect(result.guidance).toContain("PR comment");
  });

  it("normalizes fork PR push attempt", () => {
    const result = normalizeError("fork_pr: cannot push to fork");
    expect(result.code).toBe("fork_pr");
    expect(result.guidance).toContain("fork");
  });
});
