import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createEmptyMetrics, toErrorMessage } from "@agentic-nqa/core";
import { testScaffoldingSkill, } from "./skills/test-scaffolding.js";
import { selfVerifySkill } from "./skills/self-verify.js";
import { selfHealSkill } from "./skills/self-heal.js";
const MAX_RETRIES = 3;
export class GeneratorAgent {
    name = "playwright-generator";
    program = "programs/generator.md";
    skills = [
        testScaffoldingSkill,
        selfVerifySkill,
        selfHealSkill,
    ];
    ctx;
    outputDir = ".";
    async init(ctx) {
        this.ctx = ctx;
    }
    async plan(task) {
        const testPlan = task.input.testPlan;
        const authConfig = task.targetApp.auth;
        this.outputDir = task.input.outputDir ?? ".";
        return {
            taskId: task.id,
            steps: testPlan.flows.map((flow, i) => ({
                id: `generate-${i}`,
                description: `Generate test for flow: ${flow.name}`,
                skill: "test-scaffolding",
                input: {
                    flow,
                    targetApp: testPlan.targetApp,
                    baseUrl: task.targetApp.url,
                    authConfig: authConfig
                        ? { type: authConfig.type, storageStatePath: authConfig.storageStatePath }
                        : undefined,
                },
            })),
        };
    }
    async execute(plan) {
        const startTime = Date.now();
        const artifacts = [];
        const errors = [];
        let passCount = 0;
        for (const step of plan.steps) {
            try {
                // Generate test
                const generated = (await testScaffoldingSkill.execute(this.ctx, step.input));
                const outputDir = join(this.outputDir, "generated", "tests", step.input.targetApp);
                await mkdir(outputDir, { recursive: true });
                const filePath = join(outputDir, generated.fileName);
                let currentCode = generated.code;
                let passed = false;
                // Self-verify loop
                for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
                    await writeFile(filePath, currentCode, "utf-8");
                    const verification = (await selfVerifySkill.execute(this.ctx, {
                        testFilePath: filePath,
                    }));
                    if (verification.passed) {
                        passed = true;
                        break;
                    }
                    if (attempt < MAX_RETRIES) {
                        // Self-heal: fix and retry
                        const failedResult = verification.results.find((r) => r.status === "failed");
                        if (failedResult) {
                            const healAttempt = (await selfHealSkill.execute(this.ctx, {
                                code: currentCode,
                                testResult: failedResult,
                                rawOutput: verification.rawOutput,
                            }));
                            currentCode = healAttempt.fixedCode;
                            this.ctx.metrics.record("generator_self_heal_attempt", 1, {
                                attempt: String(attempt + 1),
                            });
                        }
                    }
                }
                if (passed) {
                    passCount++;
                    // Only ingest verified passing test patterns into RAG
                    await this.ctx.rag.ingest({
                        type: "pattern",
                        content: currentCode,
                        metadata: {
                            flowName: generated.flow.name,
                            targetApp: step.input
                                .targetApp,
                            verified: true,
                        },
                    });
                }
                artifacts.push({
                    type: "test-file",
                    path: filePath,
                    metadata: {
                        flow: generated.flow.name,
                        passed,
                    },
                });
            }
            catch (error) {
                errors.push({
                    code: "GENERATION_FAILED",
                    message: toErrorMessage(error),
                    recoverable: true,
                    context: { step: step.id },
                });
            }
        }
        this.ctx.metrics.record("generator_duration_ms", Date.now() - startTime);
        const totalSteps = plan.steps.length;
        const status = passCount === totalSteps
            ? "success"
            : passCount > 0
                ? "partial"
                : "failure";
        return {
            taskId: plan.taskId,
            status,
            outputs: {
                totalGenerated: totalSteps,
                totalPassed: passCount,
                passRate: totalSteps > 0 ? passCount / totalSteps : 0,
            },
            artifacts,
            errors: errors.length > 0 ? errors : undefined,
        };
    }
    async verify(result) {
        const passRate = result.outputs.passRate ?? 0;
        const issues = [];
        if (passRate < 0.5) {
            issues.push(`Low pass rate: ${(passRate * 100).toFixed(1)}%`);
        }
        if (result.artifacts.length === 0) {
            issues.push("No test files generated");
        }
        return {
            taskId: result.taskId,
            passed: passRate >= 0.8,
            metrics: createEmptyMetrics({
                passRate,
                coverageDelta: result.artifacts.length,
            }),
            issues: issues.length > 0 ? issues : undefined,
        };
    }
}
//# sourceMappingURL=agent.js.map