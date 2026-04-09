import { Command } from "commander";
import { createLogger } from "@agentic-nqa/core";
import { PlannerAgent } from "@agentic-nqa/planner";
import { GeneratorAgent } from "@agentic-nqa/generator";
import { HealerAgent } from "@agentic-nqa/healer";
import {
  Conductor,
  ImprovementEngine,
  Scheduler,
} from "@agentic-nqa/orchestrator";
import { createAgentContext } from "../setup.js";

export const improveCommand = new Command("improve")
  .description("Run autoresearch improvement loop on agents")
  .option("-c, --cycles <number>", "Number of improvement cycles", "5")
  .option(
    "-a, --agent <name>",
    "Target specific agent (playwright-planner|playwright-generator|playwright-healer)",
  )
  .option(
    "-t, --time-budget <hours>",
    "Time budget in hours (for overnight mode)",
    "8",
  )
  .option("--overnight", "Run in overnight mode with full time budget")
  .action(async (options) => {
    const logger = createLogger({ component: "improve" });
    const ctx = createAgentContext();

    // Set up conductor with all agents
    const conductor = new Conductor({
      agents: [
        new PlannerAgent(),
        new GeneratorAgent(),
        new HealerAgent(),
      ],
      context: ctx,
      logger,
    });
    await conductor.initialize();

    const cycles = parseInt(options.cycles, 10);
    const engine = new ImprovementEngine({
      conductor,
      context: ctx,
      maxCycles: cycles,
      targetAgent: options.agent,
      logger,
    });

    if (options.overnight) {
      const timeBudgetMs =
        parseFloat(options.timeBudget) * 60 * 60 * 1000;
      console.log(
        `[improve] Overnight mode: ${cycles} cycles, ${options.timeBudget}h time budget`,
      );
      console.log("[improve] Press Ctrl+C to stop gracefully\n");

      const scheduler = new Scheduler({
        engine,
        timeBudgetMs,
        logger,
      });
      await scheduler.start();
    } else {
      console.log(`[improve] Running ${cycles} improvement cycles...`);
      if (options.agent) {
        console.log(`[improve] Targeting: ${options.agent}`);
      }
      console.log("");

      const result = await engine.run();

      console.log("\n=== Improvement Results ===");
      console.log(`Experiments: ${result.totalExperiments}`);
      console.log(`Kept: ${result.keptExperiments}`);
      console.log(
        `Success rate: ${result.totalExperiments > 0 ? ((result.keptExperiments / result.totalExperiments) * 100).toFixed(1) : 0}%`,
      );
    }

    await ctx.browser.close();
  });
