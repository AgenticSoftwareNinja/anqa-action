import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateCoverage } from "./coverage-evaluator.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function mockLLMClient() {
    return {
        complete: vi.fn().mockResolvedValue({
            content: JSON.stringify([
                {
                    flowId: "flow-1",
                    status: "covered",
                    matchedTests: ["tests/login.spec.ts"],
                    confidence: 0.9,
                },
                {
                    flowId: "flow-2",
                    status: "uncovered",
                    matchedTests: [],
                    confidence: 0.95,
                },
            ]),
            model: "test",
            usage: { inputTokens: 0, outputTokens: 0 },
            stopReason: "end_turn",
        }),
        stream: vi.fn(),
    };
}
const flows = [
    {
        id: "flow-1",
        name: "User Login",
        description: "Login with email and password",
        priority: "critical",
        steps: [
            {
                action: "navigate",
                target: "/login",
                description: "Go to login",
            },
        ],
        assertions: [
            {
                type: "url",
                target: "url",
                expected: "/dashboard",
                description: "Redirects",
            },
        ],
    },
    {
        id: "flow-2",
        name: "Create Project",
        description: "Create a new project",
        priority: "high",
        steps: [
            {
                action: "click",
                target: "New Project",
                description: "Click new project",
            },
        ],
        assertions: [
            {
                type: "visible",
                target: "form",
                expected: "visible",
                description: "Form appears",
            },
        ],
    },
];
const existingTests = [
    {
        path: "tests/login.spec.ts",
        type: "e2e",
        framework: "playwright",
        descriptions: ["Login flow", "should login with valid credentials"],
    },
];
// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
    vi.clearAllMocks();
});
describe("evaluateCoverage", () => {
    it("maps flows to existing tests and produces coverage map", async () => {
        const llm = mockLLMClient();
        const result = await evaluateCoverage(flows, existingTests, llm, "test-model");
        // Overall structure
        expect(result).toHaveProperty("flows");
        expect(result).toHaveProperty("summary");
        expect(result).toHaveProperty("evaluatedAt");
        // flows array has one entry per input flow
        expect(result.flows).toHaveLength(2);
        // flow-1 is covered
        const flow1 = result.flows.find((f) => f.flowId === "flow-1");
        expect(flow1).toBeDefined();
        expect(flow1?.status).toBe("covered");
        expect(flow1?.matchedTests).toEqual(["tests/login.spec.ts"]);
        expect(flow1?.confidence).toBe(0.9);
        expect(flow1?.flowName).toBe("User Login");
        expect(flow1?.priority).toBe("critical");
        // flow-2 is uncovered
        const flow2 = result.flows.find((f) => f.flowId === "flow-2");
        expect(flow2).toBeDefined();
        expect(flow2?.status).toBe("uncovered");
        expect(flow2?.matchedTests).toEqual([]);
        expect(flow2?.confidence).toBe(0.95);
        expect(flow2?.flowName).toBe("Create Project");
        expect(flow2?.priority).toBe("high");
        // LLM was called exactly once
        expect(llm.complete).toHaveBeenCalledTimes(1);
    });
    it("calculates correct coverage percentage", async () => {
        const llm = mockLLMClient();
        const result = await evaluateCoverage(flows, existingTests, llm, "test-model");
        const { summary } = result;
        expect(summary.totalFlows).toBe(2);
        expect(summary.coveredFlows).toBe(1);
        expect(summary.partialFlows).toBe(0);
        expect(summary.uncoveredFlows).toBe(1);
        // 1 covered + 0 partial * 0.5 out of 2 total = 50%
        expect(summary.coveragePercent).toBe(50);
    });
    it("returns all uncovered when no existing tests (no LLM call)", async () => {
        const llm = mockLLMClient();
        const result = await evaluateCoverage(flows, [], llm, "test-model");
        // No LLM call should be made
        expect(llm.complete).not.toHaveBeenCalled();
        // All flows are uncovered with confidence 1.0
        expect(result.flows).toHaveLength(2);
        for (const flow of result.flows) {
            expect(flow.status).toBe("uncovered");
            expect(flow.matchedTests).toEqual([]);
            expect(flow.confidence).toBe(1.0);
        }
        // Summary reflects all uncovered
        expect(result.summary.totalFlows).toBe(2);
        expect(result.summary.coveredFlows).toBe(0);
        expect(result.summary.partialFlows).toBe(0);
        expect(result.summary.uncoveredFlows).toBe(2);
        expect(result.summary.coveragePercent).toBe(0);
        // evaluatedAt is a valid ISO date
        expect(() => new Date(result.evaluatedAt)).not.toThrow();
        expect(new Date(result.evaluatedAt).getTime()).toBeGreaterThan(0);
    });
    it("handles partial coverage in summary calculation", async () => {
        const llm = {
            complete: vi.fn().mockResolvedValue({
                content: JSON.stringify([
                    {
                        flowId: "flow-1",
                        status: "partial",
                        matchedTests: ["tests/login.spec.ts"],
                        confidence: 0.7,
                    },
                    {
                        flowId: "flow-2",
                        status: "partial",
                        matchedTests: [],
                        confidence: 0.6,
                    },
                ]),
                model: "test",
                usage: { inputTokens: 0, outputTokens: 0 },
                stopReason: "end_turn",
            }),
            stream: vi.fn(),
        };
        const result = await evaluateCoverage(flows, existingTests, llm, "test-model");
        expect(result.summary.coveredFlows).toBe(0);
        expect(result.summary.partialFlows).toBe(2);
        expect(result.summary.uncoveredFlows).toBe(0);
        // 2 partial * 0.5 / 2 total = 50%
        expect(result.summary.coveragePercent).toBe(50);
    });
    it("falls back to uncovered for flows missing from LLM response", async () => {
        // LLM only returns flow-1, omits flow-2
        const llm = {
            complete: vi.fn().mockResolvedValue({
                content: JSON.stringify([
                    {
                        flowId: "flow-1",
                        status: "covered",
                        matchedTests: ["tests/login.spec.ts"],
                        confidence: 0.9,
                    },
                ]),
                model: "test",
                usage: { inputTokens: 0, outputTokens: 0 },
                stopReason: "end_turn",
            }),
            stream: vi.fn(),
        };
        const result = await evaluateCoverage(flows, existingTests, llm, "test-model");
        const flow2 = result.flows.find((f) => f.flowId === "flow-2");
        expect(flow2?.status).toBe("uncovered");
        expect(flow2?.matchedTests).toEqual([]);
        expect(flow2?.confidence).toBe(1.0);
    });
});
//# sourceMappingURL=coverage-evaluator.test.js.map