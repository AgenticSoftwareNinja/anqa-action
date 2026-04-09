import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import { deriveAppName } from "@agentic-nqa/core";
import { PlannerAgent } from "@agentic-nqa/planner";
import { createAgentContext } from "../setup.js";
export const planCommand = new Command("plan")
    .description("Analyze a target app and generate a test plan")
    .requiredOption("-u, --url <url>", "Target application URL")
    .option("-n, --name <name>", "Target app name")
    .option("-o, --output <path>", "Output path for test plan JSON", "./plans")
    .option("--depth <number>", "Crawl depth for app discovery", "3")
    .action(async (options) => {
    const appName = options.name ?? deriveAppName(options.url);
    console.log(`[planner] Analyzing ${options.url} (${appName})...`);
    const ctx = createAgentContext();
    const planner = new PlannerAgent();
    await planner.init(ctx);
    const task = {
        id: `plan-${Date.now()}`,
        type: "plan",
        targetApp: { name: appName, url: options.url },
        input: { maxDepth: parseInt(options.depth, 10) },
    };
    const plan = await planner.plan(task);
    console.log(`[planner] Plan: ${plan.steps.length} steps (discover → analyze → generate)`);
    const result = await planner.execute(plan);
    if (result.status === "failure") {
        console.error("[planner] Failed:", result.errors?.[0]?.message);
        process.exit(1);
    }
    const verification = await planner.verify(result);
    if (verification.issues?.length) {
        console.warn("[planner] Warnings:", verification.issues.join(", "));
    }
    // Write test plan to output directory
    const outputDir = options.output;
    await mkdir(outputDir, { recursive: true });
    const testPlan = result.outputs.testPlan;
    const outputFile = join(outputDir, `${appName}-${Date.now()}.json`);
    await writeFile(outputFile, JSON.stringify(testPlan, null, 2), "utf-8");
    console.log(`[planner] Test plan written to ${outputFile}`);
    console.log(`[planner] Flows: ${testPlan.flows?.length ?? 0}`);
    await ctx.browser.close();
});
//# sourceMappingURL=plan.js.map