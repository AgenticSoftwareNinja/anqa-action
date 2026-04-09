import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { parsePlaywrightReport } from "@agentic-nqa/core";
import { HealerAgent } from "@agentic-nqa/healer";
import { createAgentContext } from "../setup.js";

export const healCommand = new Command("heal")
  .description("Auto-heal failing Playwright tests")
  .requiredOption("-r, --report <path>", "Path to test results JSON")
  .option("--dry-run", "Show proposed fixes without applying")
  .action(async (options) => {
    console.log(`[healer] Loading results from ${options.report}...`);

    const reportContent = await readFile(options.report, "utf-8");
    const report = JSON.parse(reportContent);

    const allResults = parsePlaywrightReport(report);
    const failedTests = allResults.filter((r) => r.status === "failed");

    if (failedTests.length === 0) {
      console.log("[healer] No failed tests found. Nothing to heal.");
      return;
    }

    console.log(`[healer] Found ${failedTests.length} failing tests`);

    const ctx = createAgentContext();
    const healer = new HealerAgent();
    await healer.init(ctx);

    const task = {
      id: `heal-${Date.now()}`,
      type: "heal" as const,
      targetApp: { name: "unknown", url: "" },
      input: { failedTests },
    };

    const plan = await healer.plan(task);
    console.log(`[healer] Analyzing ${plan.steps.length} failures...`);

    if (options.dryRun) {
      console.log("[healer] Dry run — showing analysis only");
    }

    const result = await healer.execute(plan);

    console.log(`[healer] Results:`);
    console.log(`  Analyzed: ${result.outputs.totalAnalyzed}`);
    console.log(`  Healed:   ${result.outputs.healed}`);
    console.log(`  App bugs: ${result.outputs.appBugs}`);

    for (const artifact of result.artifacts) {
      const meta = artifact.metadata as Record<string, unknown>;
      if (meta.healed) {
        console.log(`  HEALED ${artifact.path} (${meta.diagnosis})`);
      } else if (meta.diagnosis === "app-bug") {
        console.log(`  APP-BUG ${artifact.path}`);
      } else if (meta.needsHumanReview) {
        console.log(
          `  REVIEW ${artifact.path} (confidence: ${meta.confidence})`,
        );
      }
    }

    await ctx.browser.close();
  });

