import { execFile } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { createEmptyMetrics, parsePlaywrightReport, } from "@agentic-nqa/core";
const exec = promisify(execFile);
export class Conductor {
    agents;
    ctx;
    outputDir;
    logger;
    constructor(options) {
        this.agents = new Map(options.agents.map((a) => [a.name, a]));
        this.ctx = options.context;
        this.outputDir = options.outputDir ?? ".";
        this.logger = options.logger;
    }
    async initialize() {
        for (const agent of this.agents.values()) {
            await agent.init(this.ctx);
            this.logger?.info("Agent initialized", { agent: agent.name });
        }
    }
    async runPipeline(targetApp) {
        const startTime = Date.now();
        this.logger?.info("Pipeline started", { app: targetApp.name });
        // Step 1: Plan
        this.logger?.info("Step 1: Planning");
        const planner = this.getAgent("playwright-planner");
        if (!planner)
            throw new Error("Planner agent not found");
        const planTask = {
            id: `plan-${Date.now()}`,
            type: "plan",
            targetApp,
            input: { maxDepth: 3 },
        };
        const planPlan = await planner.plan(planTask);
        const planResult = await planner.execute(planPlan);
        if (planResult.status === "failure") {
            return {
                planResult,
                generateResult: emptyResult(planTask.id),
                testResults: [],
                metrics: createEmptyMetrics(),
            };
        }
        const testPlan = planResult.outputs.testPlan;
        this.logger?.info("Plan complete", { flows: testPlan.flows.length });
        // Save plan to disk
        const plansDir = join(this.outputDir, "plans");
        await mkdir(plansDir, { recursive: true });
        await writeFile(join(plansDir, `${targetApp.name}.json`), JSON.stringify(testPlan, null, 2));
        // Step 2: Generate
        this.logger?.info("Step 2: Generating tests");
        const generator = this.getAgent("playwright-generator");
        if (!generator)
            throw new Error("Generator agent not found");
        const genTask = {
            id: `gen-${Date.now()}`,
            type: "generate",
            targetApp,
            input: { testPlan, outputDir: this.outputDir },
        };
        const genPlan = await generator.plan(genTask);
        const generateResult = await generator.execute(genPlan);
        this.logger?.info("Generation complete", {
            passed: generateResult.outputs.totalPassed,
            total: generateResult.outputs.totalGenerated,
        });
        // Step 3: Run tests
        this.logger?.info("Step 3: Running tests");
        const testDir = join(this.outputDir, "generated", "tests", targetApp.name);
        let testResults = parsePlaywrightReport("");
        try {
            const { stdout } = await exec("npx", ["playwright", "test", testDir, "--reporter=json", "--retries=1"], {
                timeout: 120_000,
                env: { ...process.env, TARGET_URL: targetApp.url },
            });
            testResults = parsePlaywrightReport(stdout);
        }
        catch (error) {
            // Playwright exits non-zero when tests fail — still parse output
            const output = error instanceof Object && "stdout" in error
                ? String(error.stdout)
                : "";
            testResults = parsePlaywrightReport(output);
        }
        const failedTests = testResults.filter((r) => r.status === "failed");
        this.logger?.info("Test run complete", {
            total: testResults.length,
            passed: testResults.filter((r) => r.status === "passed").length,
            failed: failedTests.length,
        });
        // Step 4: Heal (if there are failures)
        let healResult;
        if (failedTests.length > 0) {
            this.logger?.info("Step 4: Healing failures");
            const healer = this.getAgent("playwright-healer");
            if (healer) {
                const healTask = {
                    id: `heal-${Date.now()}`,
                    type: "heal",
                    targetApp,
                    input: { failedTests },
                };
                const healPlan = await healer.plan(healTask);
                healResult = await healer.execute(healPlan);
                this.logger?.info("Healing complete", {
                    healed: healResult.outputs.healed,
                    appBugs: healResult.outputs.appBugs,
                });
            }
        }
        // Compute metrics
        const totalTests = testResults.length;
        const passedTests = testResults.filter((r) => r.status === "passed").length;
        const metrics = {
            passRate: totalTests > 0 ? passedTests / totalTests : 0,
            selectorResilience: 0,
            coverageDelta: testPlan.flows.length,
            flakinessScore: testResults.filter((r) => r.status === "flaky").length /
                Math.max(totalTests, 1),
            healingSuccessRate: healResult && failedTests.length > 0
                ? (healResult.outputs.healed ?? 0) / failedTests.length
                : 0,
            generationTimeMs: Date.now() - startTime,
        };
        this.logger?.info("Pipeline complete", { metrics });
        return {
            planResult,
            generateResult,
            healResult,
            testResults,
            metrics,
        };
    }
    getAgent(name) {
        return this.agents.get(name);
    }
}
function emptyResult(taskId) {
    return {
        taskId,
        status: "failure",
        outputs: {},
        artifacts: [],
    };
}
//# sourceMappingURL=conductor.js.map