import { readFile, writeFile } from "node:fs/promises";
import { createEmptyMetrics, toErrorMessage } from "@agentic-nqa/core";
import { failureAnalysisSkill } from "./skills/failure-analysis.js";
import { applyHealingSkill } from "./skills/apply-healing.js";
export class HealerAgent {
    name = "playwright-healer";
    program = "programs/healer.md";
    skills = [failureAnalysisSkill, applyHealingSkill];
    ctx;
    async init(ctx) {
        this.ctx = ctx;
    }
    async plan(task) {
        const failedTests = task.input.failedTests;
        return {
            taskId: task.id,
            steps: failedTests.map((test, i) => ({
                id: `heal-${i}`,
                description: `Heal failing test: ${test.testFile}`,
                skill: "failure-analysis",
                input: { testResult: test },
            })),
        };
    }
    async execute(plan) {
        const startTime = Date.now();
        const artifacts = [];
        const errors = [];
        let healedCount = 0;
        let appBugCount = 0;
        for (const step of plan.steps) {
            const testResult = step.input
                .testResult;
            try {
                // Read the test file
                const testCode = await readFile(testResult.testFile, "utf-8");
                // Analyze the failure
                const report = (await failureAnalysisSkill.execute(this.ctx, {
                    testResult,
                    testCode,
                }));
                if (report.diagnosis === "app-bug") {
                    appBugCount++;
                    artifacts.push({
                        type: "report",
                        path: testResult.testFile,
                        metadata: {
                            diagnosis: "app-bug",
                            error: report.originalError.message,
                        },
                    });
                    continue;
                }
                if (!report.fix || report.fix.confidence < 0.8) {
                    artifacts.push({
                        type: "report",
                        path: testResult.testFile,
                        metadata: {
                            diagnosis: report.diagnosis,
                            confidence: report.fix?.confidence ?? 0,
                            needsHumanReview: true,
                        },
                    });
                    continue;
                }
                // Apply the healing fix
                const fixedCode = (await applyHealingSkill.execute(this.ctx, {
                    testCode,
                    report,
                }));
                await writeFile(testResult.testFile, fixedCode, "utf-8");
                healedCount++;
                artifacts.push({
                    type: "test-file",
                    path: testResult.testFile,
                    metadata: {
                        diagnosis: report.diagnosis,
                        healed: true,
                        fixType: report.fix.type,
                    },
                });
                this.ctx.metrics.record("healer_fix_applied", 1, {
                    diagnosis: report.diagnosis,
                });
            }
            catch (error) {
                errors.push({
                    code: "HEALING_FAILED",
                    message: toErrorMessage(error),
                    recoverable: true,
                    context: { testFile: testResult.testFile },
                });
            }
        }
        this.ctx.metrics.record("healer_duration_ms", Date.now() - startTime);
        return {
            taskId: plan.taskId,
            status: healedCount > 0
                ? "success"
                : appBugCount > 0
                    ? "partial"
                    : "failure",
            outputs: {
                totalAnalyzed: plan.steps.length,
                healed: healedCount,
                appBugs: appBugCount,
                healingRate: plan.steps.length > 0 ? healedCount / plan.steps.length : 0,
            },
            artifacts,
            errors: errors.length > 0 ? errors : undefined,
        };
    }
    async verify(result) {
        const healingRate = result.outputs.healingRate ?? 0;
        const issues = [];
        if (healingRate === 0 && result.outputs.appBugs === 0) {
            issues.push("No tests healed and no app bugs identified");
        }
        return {
            taskId: result.taskId,
            passed: issues.length === 0,
            metrics: createEmptyMetrics({ healingSuccessRate: healingRate }),
            issues: issues.length > 0 ? issues : undefined,
        };
    }
}
//# sourceMappingURL=agent.js.map