export const applyHealingSkill = {
    name: "apply-healing",
    description: "Apply a healing fix to a test file",
    async execute(ctx, input) {
        const { testCode, report } = input;
        if (!report.fix || report.diagnosis === "app-bug") {
            throw new Error("Cannot heal app bugs — report for human review");
        }
        if (report.fix.confidence < 0.8) {
            throw new Error(`Confidence too low (${report.fix.confidence}) — requires human review`);
        }
        const result = await ctx.llm.complete({
            model: ctx.config.modelsConfig.healer,
            system: `You are a QA engineer applying a specific fix to a Playwright test.
Output ONLY the complete fixed test code — no markdown fences, no explanation.
Add a comment where you made changes: // Healed: <description> on <date>`,
            messages: [
                {
                    role: "user",
                    content: `Apply this fix to the test code.

## Current Test Code:
${testCode}

## Diagnosis: ${report.diagnosis}
## Error: ${report.originalError.message}
## Fix Type: ${report.fix.type}
## Suggested Fix: ${report.fix.after}

Output the complete fixed test file.`,
                },
            ],
            maxTokens: 4096,
            temperature: 0,
        });
        // Store the healing pattern in RAG
        await ctx.rag.ingest({
            type: "failure",
            content: JSON.stringify({
                diagnosis: report.diagnosis,
                error: report.originalError.message,
                fixType: report.fix.type,
                fix: report.fix.after,
            }),
            metadata: {
                testFile: report.testFile,
                diagnosis: report.diagnosis,
                confidence: report.fix.confidence,
            },
        });
        return result.content;
    },
};
//# sourceMappingURL=apply-healing.js.map