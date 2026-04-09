import { describe, it, expect } from "vitest";
import { buildPRBody, buildBranchName } from "../pr-builder.js";

describe("buildBranchName", () => {
  it("creates a timestamped branch name", () => {
    const name = buildBranchName();
    expect(name).toMatch(/^anqa\/generate-\d{8}-\d{6}$/);
  });
});

describe("buildPRBody", () => {
  const passingTests = [
    {
      flow_id: "f1",
      flow_name: "User Login",
      priority: "critical",
      file_path: "tests/anqa/user-login.spec.ts",
      status: "passing" as const,
      heal_attempts: 0,
    },
    {
      flow_id: "f2",
      flow_name: "Add to Cart",
      priority: "high",
      file_path: "tests/anqa/add-to-cart.spec.ts",
      status: "passing" as const,
      heal_attempts: 2,
    },
  ];

  it("includes all passing tests in the table", () => {
    const body = buildPRBody({
      tests: passingTests,
      targetUrl: "https://example.com",
      coverageBefore: 45,
      coverageAfter: 68,
      estimatedCost: 3.5,
      failedCount: 0,
    });
    expect(body).toContain("User Login");
    expect(body).toContain("Add to Cart");
    expect(body).toContain("45% → 68%");
    expect(body).toContain("$3.50");
  });

  it("includes failed tests note when some excluded", () => {
    const body = buildPRBody({
      tests: passingTests,
      targetUrl: "https://example.com",
      coverageBefore: 45,
      coverageAfter: 68,
      estimatedCost: 3.5,
      failedCount: 3,
    });
    expect(body).toContain("3 additional flows");
  });

  it("includes playwright config note", () => {
    const body = buildPRBody({
      tests: passingTests,
      targetUrl: "https://example.com",
      coverageBefore: 0,
      coverageAfter: 50,
      estimatedCost: 1.0,
      failedCount: 0,
    });
    expect(body).toContain("playwright.config.ts");
  });
});
