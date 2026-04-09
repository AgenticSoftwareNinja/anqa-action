import { parseLLMJson } from "@agentic-nqa/core";
// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------
export async function evaluateCoverage(flows, existingTests, llm, model) {
    const evaluatedAt = new Date().toISOString();
    // Short-circuit: no existing tests → all flows are uncovered
    if (existingTests.length === 0) {
        const flowCoverages = flows.map((flow) => ({
            flowId: flow.id,
            flowName: flow.name,
            priority: flow.priority,
            status: "uncovered",
            matchedTests: [],
            confidence: 1.0,
        }));
        const summary = computeSummary(flowCoverages);
        return { flows: flowCoverages, summary, evaluatedAt };
    }
    // Build summaries for the LLM prompt
    const flowSummaries = flows
        .map((f) => `- id="${f.id}" name="${f.name}" description="${f.description}"`)
        .join("\n");
    const testSummaries = existingTests
        .map((t) => {
        const descs = t.descriptions.length > 0 ? t.descriptions.join("; ") : "(no descriptions)";
        return `- path="${t.path}" descriptions="${descs}"`;
    })
        .join("\n");
    const result = await llm.complete({
        model,
        system: `You are a QA engineer analyzing test coverage. You match user flows against existing test files semantically.
Output ONLY valid JSON — no markdown fences, no explanation.`,
        messages: [
            {
                role: "user",
                content: `Analyze the following user flows and existing test files. For each flow, determine whether it is covered, partially covered, or uncovered by the existing tests.

Match semantically — for example, a test file named "login.spec.ts" with descriptions like "Login flow" or "should login with valid credentials" covers a flow named "User Login".

## User Flows
${flowSummaries}

## Existing Test Files
${testSummaries}

Return a JSON array with one entry per flow:
[
  {
    "flowId": "<id from flow list>",
    "status": "covered" | "partial" | "uncovered",
    "matchedTests": ["<test file path>", ...],
    "confidence": <0.0-1.0>
  }
]

Rules:
- "covered" = test(s) clearly exercise this flow end-to-end
- "partial" = test(s) touch parts of this flow but not the full path
- "uncovered" = no existing test covers this flow
- confidence = how sure you are (1.0 = certain, 0.5 = unsure)
- matchedTests = list of test file paths that cover this flow (empty array for uncovered)`,
            },
        ],
        maxTokens: 4096,
        temperature: 0,
    });
    const matches = parseLLMJson(result.content);
    // Build a lookup map from flowId → LLM result
    const matchMap = new Map(matches.map((m) => [m.flowId, m]));
    // Merge LLM results with original flow metadata
    const flowCoverages = flows.map((flow) => {
        const match = matchMap.get(flow.id);
        if (!match) {
            // LLM didn't return an entry for this flow — treat as uncovered
            return {
                flowId: flow.id,
                flowName: flow.name,
                priority: flow.priority,
                status: "uncovered",
                matchedTests: [],
                confidence: 1.0,
            };
        }
        return {
            flowId: flow.id,
            flowName: flow.name,
            priority: flow.priority,
            status: match.status,
            matchedTests: match.matchedTests,
            confidence: match.confidence,
        };
    });
    const summary = computeSummary(flowCoverages);
    return { flows: flowCoverages, summary, evaluatedAt };
}
function computeSummary(flows) {
    const totalFlows = flows.length;
    const coveredFlows = flows.filter((f) => f.status === "covered").length;
    const partialFlows = flows.filter((f) => f.status === "partial").length;
    const uncoveredFlows = flows.filter((f) => f.status === "uncovered").length;
    const coveragePercent = totalFlows === 0
        ? 0
        : Math.round(((coveredFlows + partialFlows * 0.5) / totalFlows) * 100);
    return {
        totalFlows,
        coveredFlows,
        partialFlows,
        uncoveredFlows,
        coveragePercent,
    };
}
// ---------------------------------------------------------------------------
// Skill wrapper
// ---------------------------------------------------------------------------
export const coverageEvaluatorSkill = {
    name: "coverage-evaluator",
    description: "Map discovered flows against existing tests to produce coverage map",
    async execute(ctx, input) {
        const { flows, existingTests } = input;
        return evaluateCoverage(flows, existingTests, ctx.llm, ctx.config.modelsConfig.planner);
    },
};
//# sourceMappingURL=coverage-evaluator.js.map