import { readFile, writeFile } from "node:fs/promises";
import { createEmptyMetrics, toErrorMessage } from "@agentic-nqa/core";
import type {
  Agent,
  AgentContext,
  AgentPlan,
  AgentResult,
  AgentTask,
  Artifact,
  HealingReport,
  Skill,
  TestResult,
  Verification,
} from "@agentic-nqa/core";
import { failureAnalysisSkill } from "./skills/failure-analysis.js";
import { applyHealingSkill } from "./skills/apply-healing.js";

export class HealerAgent implements Agent {
  readonly name = "playwright-healer";
  readonly program = "programs/healer.md";
  readonly skills: Skill[] = [failureAnalysisSkill, applyHealingSkill];

  private ctx!: AgentContext;

  async init(ctx: AgentContext): Promise<void> {
    this.ctx = ctx;
  }

  async plan(task: AgentTask): Promise<AgentPlan> {
    const failedTests = task.input.failedTests as TestResult[];

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

  async execute(plan: AgentPlan): Promise<AgentResult> {
    const startTime = Date.now();
    const artifacts: Artifact[] = [];
    const errors: AgentResult["errors"] = [];
    let healedCount = 0;
    let appBugCount = 0;

    for (const step of plan.steps) {
      const testResult = (step.input as Record<string, unknown>)
        .testResult as TestResult;

      try {
        // Read the test file
        const testCode = await readFile(testResult.testFile, "utf-8");

        // Analyze the failure
        const report = (await failureAnalysisSkill.execute(this.ctx, {
          testResult,
          testCode,
        })) as HealingReport;

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
        })) as string;

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
      } catch (error) {
        errors!.push({
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
      status:
        healedCount > 0
          ? "success"
          : appBugCount > 0
            ? "partial"
            : "failure",
      outputs: {
        totalAnalyzed: plan.steps.length,
        healed: healedCount,
        appBugs: appBugCount,
        healingRate:
          plan.steps.length > 0 ? healedCount / plan.steps.length : 0,
      },
      artifacts,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async verify(result: AgentResult): Promise<Verification> {
    const healingRate = (result.outputs.healingRate as number) ?? 0;
    const issues: string[] = [];

    if (healingRate === 0 && (result.outputs.appBugs as number) === 0) {
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
