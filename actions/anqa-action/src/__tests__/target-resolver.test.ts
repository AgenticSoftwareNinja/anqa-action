// actions/anqa-action/src/__tests__/target-resolver.test.ts
import { describe, it, expect } from "vitest";
import { resolveTargetUrl } from "../target-resolver.js";

describe("resolveTargetUrl", () => {
  it("returns explicit override when different from project default", async () => {
    const result = await resolveTargetUrl({
      inputTargetUrl: "https://preview-123.vercel.app",
      projectTargetUrl: "https://myapp.com",
      githubToken: "fake",
      owner: "org",
      repo: "app",
      headSha: "abc123",
    });
    expect(result.url).toBe("https://preview-123.vercel.app");
    expect(result.source).toBe("explicit_override");
    expect(result.warning).toBeUndefined();
  });

  it("falls back to project URL with warning when no override and no deployment", async () => {
    const result = await resolveTargetUrl({
      inputTargetUrl: "https://myapp.com",
      projectTargetUrl: "https://myapp.com",
      githubToken: "fake",
      owner: "org",
      repo: "app",
      headSha: "abc123",
      skipDeploymentCheck: true,
    });
    expect(result.url).toBe("https://myapp.com");
    expect(result.source).toBe("project_fallback");
    expect(result.warning).toContain("production URL");
  });
});
