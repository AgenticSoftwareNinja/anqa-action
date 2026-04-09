import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { GeneratorAgent } from "@agentic-nqa/generator";
import { createAgentContext } from "../setup.js";
export const generateCommand = new Command("generate")
    .description("Generate Playwright tests from a test plan")
    .requiredOption("-p, --plan <path>", "Path to test plan JSON")
    .option("-o, --output <path>", "Output directory for tests", "./generated/tests")
    .action(async (options) => {
    console.log(`[generator] Loading plan from ${options.plan}...`);
    const planContent = await readFile(options.plan, "utf-8");
    const testPlan = JSON.parse(planContent);
    console.log(`[generator] Plan: ${testPlan.flows.length} flows for ${testPlan.targetApp}`);
    const ctx = createAgentContext();
    const generator = new GeneratorAgent();
    await generator.init(ctx);
    const task = {
        id: `gen-${Date.now()}`,
        type: "generate",
        targetApp: { name: testPlan.targetApp, url: "" },
        input: { testPlan },
    };
    const plan = await generator.plan(task);
    console.log(`[generator] Generating ${plan.steps.length} test files...`);
    const result = await generator.execute(plan);
    console.log(`[generator] Result: ${result.outputs.totalPassed}/${result.outputs.totalGenerated} passed`);
    console.log(`[generator] Status: ${result.status}`);
    for (const artifact of result.artifacts) {
        const status = artifact.metadata?.passed
            ? "PASS"
            : "FAIL";
        console.log(`  ${status} ${artifact.path}`);
    }
    if (result.errors?.length) {
        console.error("[generator] Errors:");
        for (const err of result.errors) {
            console.error(`  - ${err.message}`);
        }
    }
    await ctx.browser.close();
});
//# sourceMappingURL=generate.js.map