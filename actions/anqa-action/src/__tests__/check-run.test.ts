// actions/anqa-action/src/__tests__/check-run.test.ts
import { describe, it, expect } from "vitest";
import { resolveCheckConclusion } from "../check-run.js";

describe("resolveCheckConclusion", () => {
  it("returns success when all tests pass", () => {
    const result = resolveCheckConclusion({ passed: 3, healed: 0, failed: 0, skipped: 0, isDryRun: false, reason: undefined });
    expect(result.conclusion).toBe("success");
    expect(result.summary).toContain("All 3 tests passed");
  });

  it("returns neutral when tests were healed", () => {
    const result = resolveCheckConclusion({ passed: 2, healed: 1, failed: 0, skipped: 0, isDryRun: false, reason: undefined });
    expect(result.conclusion).toBe("neutral");
    expect(result.summary).toContain("1 tests healed");
  });

  it("returns failure when tests failed", () => {
    const result = resolveCheckConclusion({ passed: 1, healed: 0, failed: 2, skipped: 0, isDryRun: false, reason: undefined });
    expect(result.conclusion).toBe("failure");
    expect(result.summary).toContain("2 tests failed");
  });

  it("returns success for dry run", () => {
    const result = resolveCheckConclusion({ passed: 0, healed: 0, failed: 0, skipped: 0, isDryRun: true, reason: undefined });
    expect(result.conclusion).toBe("success");
    expect(result.summary).toContain("Dry run");
  });

  it("returns neutral for skip reason", () => {
    const result = resolveCheckConclusion({ passed: 0, healed: 0, failed: 0, skipped: 0, isDryRun: false, reason: "No recent audit found" });
    expect(result.conclusion).toBe("neutral");
    expect(result.summary).toContain("Skipped");
  });

  it("returns success for no affected flows", () => {
    const result = resolveCheckConclusion({ passed: 0, healed: 0, failed: 0, skipped: 0, isDryRun: false, reason: undefined });
    expect(result.conclusion).toBe("success");
    expect(result.summary).toContain("No affected flows");
  });
});
