import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { createEmptyMetrics, toErrorMessage } from "@agentic-nqa/core";
import type {
  Agent,
  AgentContext,
  AgentPlan,
  AgentResult,
  AgentTask,
  Artifact,
  Skill,
  TestPlan,
  Verification,
} from "@agentic-nqa/core";
import {
  testScaffoldingSkill,
  type GeneratedTest,
} from "./skills/test-scaffolding.js";
import { selfVerifySkill, type VerificationResult } from "./skills/self-verify.js";
import { selfHealSkill } from "./skills/self-heal.js";

const MAX_RETRIES = 3;

export class GeneratorAgent implements Agent {
  readonly name = "playwright-generator";
  readonly program = "programs/generator.md";
  readonly skills: Skill[] = [
    testScaffoldingSkill,
    selfVerifySkill,
    selfHealSkill,
  ];

  private ctx!: AgentContext;
  private outputDir = ".";

  async init(ctx: AgentContext): Promise<void> {
    this.ctx = ctx;
  }

  async plan(task: AgentTask): Promise<AgentPlan> {
    const testPlan = task.input.testPlan as TestPlan;
    const authConfig = task.targetApp.auth;
    this.outputDir = (task.input.outputDir as string) ?? ".";

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

  async execute(plan: AgentPlan): Promise<AgentResult> {
    const startTime = Date.now();
    const artifacts: Artifact[] = [];
    const errors: AgentResult["errors"] = [];
    let passCount = 0;

    for (const step of plan.steps) {
      try {
        // Generate test
        const generated = (await testScaffoldingSkill.execute(
          this.ctx,
          step.input,
        )) as GeneratedTest;

        const outputDir = join(
          this.outputDir,
          "generated",
          "tests",
          (step.input as Record<string, unknown>).targetApp as string,
        );
        await mkdir(outputDir, { recursive: true });
        const filePath = join(outputDir, generated.fileName);

        let currentCode = generated.code;
        let passed = false;
        let healAttempts = 0;
        let lastError: string | undefined;

        // Self-verify loop
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          await writeFile(filePath, currentCode, "utf-8");

          const verification = (await selfVerifySkill.execute(this.ctx, {
            testFilePath: filePath,
            baseUrl: (step.input as Record<string, unknown>).baseUrl as string,
          })) as VerificationResult;

          if (verification.passed) {
            passed = true;
            lastError = undefined;
            break;
          }

          // Capture last failure reason
          const failedResult = verification.results.find(
            (r) => r.status === "failed",
          );
          lastError = failedResult?.error?.message ?? verification.rawOutput?.slice(0, 500);

          if (attempt < MAX_RETRIES && failedResult) {
            // Self-heal: fix and retry
            healAttempts++;
            const healAttempt = (await selfHealSkill.execute(this.ctx, {
              code: currentCode,
              testResult: failedResult,
              rawOutput: verification.rawOutput,
            })) as { fixedCode: string };
            currentCode = healAttempt.fixedCode;

            this.ctx.metrics.record("generator_self_heal_attempt", 1, {
              attempt: String(attempt + 1),
            });
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
              targetApp: (step.input as Record<string, unknown>)
                .targetApp as string,
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
            healAttempts,
            error: lastError,
          },
        });
      } catch (error) {
        errors!.push({
          code: "GENERATION_FAILED",
          message: toErrorMessage(error),
          recoverable: true,
          context: { step: step.id },
        });
      }
    }

    this.ctx.metrics.record(
      "generator_duration_ms",
      Date.now() - startTime,
    );

    const totalSteps = plan.steps.length;
    const status =
      passCount === totalSteps
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

  async verify(result: AgentResult): Promise<Verification> {
    const passRate = (result.outputs.passRate as number) ?? 0;
    const issues: string[] = [];

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
