import { formatRAGContext, type AgentContext, type Skill, type TestFlow } from "@agentic-nqa/core";

export interface GeneratedTest {
  fileName: string;
  code: string;
  flow: TestFlow;
}

export const testScaffoldingSkill: Skill = {
  name: "test-scaffolding",
  description: "Generate Playwright test code from a test flow",

  async execute(ctx: AgentContext, input: unknown): Promise<GeneratedTest> {
    const { flow, targetApp, baseUrl, authConfig } = input as {
      flow: TestFlow;
      targetApp: string;
      baseUrl: string;
      authConfig?: { type: string; storageStatePath?: string };
    };

    // Retrieve relevant test patterns from RAG
    const patterns = await ctx.rag.search(
      `playwright test pattern for ${flow.name} ${flow.description}`,
      { type: "pattern", limit: 3 },
    );

    const patternContext = formatRAGContext(
      patterns,
      "Relevant test patterns from knowledge base",
    );

    const authInstruction = authConfig?.storageStatePath
      ? `\n\n## Authentication\nThis app requires authentication. Add this at the top of the test.describe block:\ntest.use({ storageState: '${authConfig.storageStatePath}' });`
      : "";

    const result = await ctx.llm.complete({
      model: ctx.config.modelsConfig.generator,
      system: `You are a senior QA engineer writing Playwright tests. Output ONLY the test code — no markdown fences, no explanation.

Rules:
- Use @playwright/test imports
- Use semantic selectors: getByRole, getByText, getByLabel (never raw CSS unless necessary)
- Each test must be independently runnable
- Use test.describe for grouping related tests
- Add meaningful assertion messages
- Use page.ariaSnapshot() for accessibility checks where appropriate
- Base URL is configured in playwright.config.ts, use relative paths in goto()`,
      messages: [
        {
          role: "user",
          content: `Generate a Playwright test file for this flow:

## Flow: ${flow.name}
${flow.description}

## Steps:
${flow.steps.map((s, i) => `${i + 1}. ${s.action}: ${s.description}${s.target ? ` (target: ${s.target})` : ""}${s.value ? ` (value: ${s.value})` : ""}`).join("\n")}

## Assertions:
${flow.assertions.map((a) => `- ${a.type}: ${a.description} (expect ${a.target} ${a.expected})`).join("\n")}

## Target App: ${targetApp}
## Base URL: ${baseUrl}
${patternContext}${authInstruction}`,
        },
      ],
      maxTokens: 4096,
      temperature: 0,
    });

    const fileName = toFileName(flow.name);

    return {
      fileName,
      code: result.content,
      flow,
    };
  },
};

function toFileName(flowName: string): string {
  return (
    flowName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") + ".spec.ts"
  );
}
