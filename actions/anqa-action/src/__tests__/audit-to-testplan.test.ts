import { describe, it, expect } from "vitest";
import { auditToTestPlan, selectFlows } from "../audit-to-testplan.js";

const mockGaps = [
  { flowId: "f1", flowName: "Login", priority: "critical" as const, reason: "uncovered" },
  { flowId: "f2", flowName: "Checkout", priority: "high" as const, reason: "uncovered" },
  { flowId: "f3", flowName: "Profile", priority: "medium" as const, reason: "partial" },
  { flowId: "f4", flowName: "Settings", priority: "low" as const, reason: "uncovered" },
];

const mockProposed = [
  { flowId: "f1", flowName: "Login", priority: "critical" as const, description: "Test login flow", estimatedComplexity: "simple" as const },
  { flowId: "f2", flowName: "Checkout", priority: "high" as const, description: "Test checkout", estimatedComplexity: "moderate" as const },
  { flowId: "f3", flowName: "Profile", priority: "medium" as const, description: "Test profile", estimatedComplexity: "simple" as const },
];

describe("selectFlows", () => {
  it("selects all critical and high, then medium up to cap", () => {
    const selected = selectFlows(mockGaps, 10);
    expect(selected).toHaveLength(3);
    expect(selected.map((g) => g.flowId)).toEqual(["f1", "f2", "f3"]);
  });

  it("respects maxFlows cap", () => {
    const selected = selectFlows(mockGaps, 2);
    expect(selected).toHaveLength(2);
    expect(selected.map((g) => g.flowId)).toEqual(["f1", "f2"]);
  });

  it("returns empty for no gaps", () => {
    const selected = selectFlows([], 10);
    expect(selected).toHaveLength(0);
  });
});

describe("auditToTestPlan", () => {
  it("converts gaps and proposed tests to a TestPlan", () => {
    const plan = auditToTestPlan(mockGaps.slice(0, 2), mockProposed, "my-app");
    expect(plan.targetApp).toBe("my-app");
    expect(plan.flows).toHaveLength(2);
    expect(plan.flows[0].name).toBe("Login");
    expect(plan.flows[0].priority).toBe("critical");
    expect(plan.flows[0].description).toBe("Test login flow");
    expect(plan.flows[0].steps.length).toBeGreaterThan(0);
    expect(plan.flows[0].assertions.length).toBeGreaterThan(0);
  });

  it("creates minimal steps when no proposed test details", () => {
    const gaps = [{ flowId: "f99", flowName: "Unknown", priority: "high" as const, reason: "uncovered" }];
    const plan = auditToTestPlan(gaps, [], "my-app");
    expect(plan.flows).toHaveLength(1);
    expect(plan.flows[0].name).toBe("Unknown");
    expect(plan.flows[0].steps.length).toBeGreaterThan(0);
  });
});
