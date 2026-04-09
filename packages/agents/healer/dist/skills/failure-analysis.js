import { formatRAGContext, parseLLMJson } from "@agentic-nqa/core";
export const failureAnalysisSkill = {
    name: "failure-analysis",
    description: "Analyze a test failure and classify the diagnosis",
    async execute(ctx, input) {
        const { testResult, testCode } = input;
        const errorMsg = testResult.error?.message ?? "";
        const errorStack = testResult.error?.stack ?? "";
        // Query RAG for similar past failures
        const pastFailures = await ctx.rag.search(`playwright test failure: ${errorMsg}`, { type: "failure", limit: 3 });
        const pastContext = formatRAGContext(pastFailures, "Similar past failures");
        const result = await ctx.llm.complete({
            model: ctx.config.modelsConfig.healer,
            system: `You are a QA engineer diagnosing test failures. Classify the failure and output ONLY valid JSON.

Possible diagnoses:
- "selector-broken": Element exists but selector doesn't match (DOM restructured, renamed)
- "timing-issue": Race condition, element not ready, network delay
- "assertion-stale": App behavior changed, assertion expectations are wrong
- "app-bug": Genuine application defect — DO NOT attempt to heal
- "unknown": Cannot determine cause`,
            messages: [
                {
                    role: "user",
                    content: `Diagnose this test failure.

## Test Code:
${testCode}

## Error Message:
${errorMsg}

## Stack Trace:
${errorStack}
${pastContext}

Output JSON with these fields:
- "diagnosis": one of "selector-broken", "timing-issue", "assertion-stale", "app-bug", "unknown"
- "confidence": 0-1 how confident you are
- "explanation": brief explanation of the root cause
- "suggestedFix": what to change (if diagnosis is not "app-bug")`,
                },
            ],
            maxTokens: 1024,
            temperature: 0,
        });
        const analysis = parseLLMJson(result.content);
        return {
            testFile: testResult.testFile,
            originalError: testResult.error ?? { message: "Unknown error" },
            diagnosis: analysis.diagnosis,
            fix: analysis.diagnosis !== "app-bug" && analysis.suggestedFix
                ? {
                    type: mapDiagnosisToFixType(analysis.diagnosis),
                    before: "",
                    after: analysis.suggestedFix,
                    confidence: analysis.confidence,
                }
                : undefined,
        };
    },
};
function mapDiagnosisToFixType(diagnosis) {
    switch (diagnosis) {
        case "selector-broken":
            return "selector";
        case "timing-issue":
            return "wait";
        case "assertion-stale":
            return "assertion";
        default:
            return "flow";
    }
}
//# sourceMappingURL=failure-analysis.js.map