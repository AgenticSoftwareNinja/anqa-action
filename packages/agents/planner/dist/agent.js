import { readFile } from "node:fs/promises";
import { createEmptyMetrics, toErrorMessage, } from "@agentic-nqa/core";
import { appDiscoverySkill, } from "./skills/app-discovery.js";
import { flowAnalysisSkill } from "./skills/flow-analysis.js";
import { planGenerationSkill } from "./skills/plan-generation.js";
import { repoScannerSkill } from "./skills/repo-scanner.js";
import { coverageEvaluatorSkill } from "./skills/coverage-evaluator.js";
export class PlannerAgent {
    name = "playwright-planner";
    program = "programs/planner.md";
    skills = [
        appDiscoverySkill,
        flowAnalysisSkill,
        planGenerationSkill,
        repoScannerSkill,
        coverageEvaluatorSkill,
    ];
    ctx;
    programContent = "";
    async init(ctx) {
        this.ctx = ctx;
        try {
            this.programContent = await readFile(this.program, "utf-8");
        }
        catch {
            // program.md is optional — use defaults
        }
    }
    async plan(task) {
        const maxDepth = task.input.maxDepth ?? 3;
        return {
            taskId: task.id,
            steps: [
                {
                    id: "discover",
                    description: `Crawl ${task.targetApp.url} up to depth ${maxDepth}`,
                    skill: "app-discovery",
                    input: { targetApp: task.targetApp, maxDepth },
                },
                {
                    id: "analyze",
                    description: "Identify critical user flows",
                    skill: "flow-analysis",
                    input: { targetAppName: task.targetApp.name },
                    dependsOn: ["discover"],
                },
                {
                    id: "generate-plan",
                    description: "Generate structured test plan",
                    skill: "plan-generation",
                    input: { targetAppName: task.targetApp.name },
                    dependsOn: ["analyze"],
                },
            ],
        };
    }
    async execute(plan) {
        const startTime = Date.now();
        const artifacts = [];
        try {
            // Step 1: App Discovery
            const discoverStep = plan.steps.find((s) => s.id === "discover");
            const inventory = (await appDiscoverySkill.execute(this.ctx, discoverStep.input));
            // Step 2: Flow Analysis
            const analyzeStep = plan.steps.find((s) => s.id === "analyze");
            const flows = await flowAnalysisSkill.execute(this.ctx, {
                ...analyzeStep.input,
                inventory,
            });
            // Step 3: Plan Generation
            const generateStep = plan.steps.find((s) => s.id === "generate-plan");
            const testPlan = (await planGenerationSkill.execute(this.ctx, {
                ...generateStep.input,
                flows,
            }));
            artifacts.push({
                type: "test-plan",
                path: `plans/${testPlan.id}.json`,
                metadata: {
                    flowCount: testPlan.flows.length,
                    targetApp: testPlan.targetApp,
                },
            });
            this.ctx.metrics.record("planner_duration_ms", Date.now() - startTime);
            return {
                taskId: plan.taskId,
                status: "success",
                outputs: { testPlan },
                artifacts,
            };
        }
        catch (error) {
            return {
                taskId: plan.taskId,
                status: "failure",
                outputs: {},
                artifacts,
                errors: [
                    {
                        code: "PLANNER_EXECUTION_FAILED",
                        message: toErrorMessage(error),
                        recoverable: true,
                    },
                ],
            };
        }
    }
    async verify(result) {
        const testPlan = result.outputs.testPlan;
        const issues = [];
        if (!testPlan) {
            return {
                taskId: result.taskId,
                passed: false,
                metrics: createEmptyMetrics(),
                issues: ["No test plan generated"],
            };
        }
        if (testPlan.flows.length === 0) {
            issues.push("Test plan has no flows");
        }
        const criticalFlows = testPlan.flows.filter((f) => f.priority === "critical");
        if (criticalFlows.length === 0) {
            issues.push("No critical priority flows identified");
        }
        for (const flow of testPlan.flows) {
            if (flow.steps.length === 0) {
                issues.push(`Flow "${flow.name}" has no steps`);
            }
            if (flow.assertions.length === 0) {
                issues.push(`Flow "${flow.name}" has no assertions`);
            }
        }
        return {
            taskId: result.taskId,
            passed: issues.length === 0,
            metrics: {
                passRate: 0,
                selectorResilience: 0,
                coverageDelta: testPlan.flows.length,
                flakinessScore: 0,
                healingSuccessRate: 0,
                generationTimeMs: 0,
            },
            issues: issues.length > 0 ? issues : undefined,
        };
    }
}
//# sourceMappingURL=agent.js.map