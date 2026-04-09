import { formatRAGContext } from "@agentic-nqa/core";
import type { AgentContext, Skill, TestResult } from "@agentic-nqa/core";

export interface HealAttempt {
  fixedCode: string;
  explanation: string;
}

export const selfHealSkill: Skill = {
  name: "self-heal",
  description: "Fix a failing generated test based on error output",

  async execute(ctx: AgentContext, input: unknown): Promise<HealAttempt> {
    const { code, testResult, rawOutput } = input as {
      code: string;
      testResult: TestResult;
      rawOutput: string;
    };

    const errorMsg = testResult.error?.message ?? "Unknown error";
    const errorStack = testResult.error?.stack ?? "";

    // Query RAG for similar failures and their fixes
    const healingPatterns = await ctx.rag.search(
      `fix playwright test failure: ${errorMsg}`,
      { type: "failure", limit: 3 },
    );

    const healingContext = formatRAGContext(
      healingPatterns,
      "Similar past failures and their fixes",
    );

    const result = await ctx.llm.complete({
      model: ctx.config.modelsConfig.generator,
      system: `You are a senior QA engineer fixing a failing Playwright test.
Output ONLY the complete fixed test code — no markdown fences, no explanation.
Keep the same test structure but fix the specific issue causing the failure.`,
      messages: [
        {
          role: "user",
          content: `This Playwright test is failing. Fix it.

## Current Test Code:
${code}

## Error:
${errorMsg}

## Stack Trace:
${errorStack}

## Full Output:
${rawOutput.slice(0, 2000)}
${healingContext}

Output the complete fixed test file.`,
        },
      ],
      maxTokens: 4096,
      temperature: 0,
    });

    return {
      fixedCode: result.content,
      explanation: `Fixed test based on error: ${errorMsg.slice(0, 100)}`,
    };
  },
};
