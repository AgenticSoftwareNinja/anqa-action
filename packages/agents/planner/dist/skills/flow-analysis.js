import { formatRAGContext, parseLLMJson } from "@agentic-nqa/core";
export const flowAnalysisSkill = {
    name: "flow-analysis",
    description: "Identify and prioritize critical user flows from page inventory",
    async execute(ctx, input) {
        const { inventory, targetAppName } = input;
        // Query RAG for known patterns about this app
        const priorKnowledge = await ctx.rag.search(`test flows for ${targetAppName}`, { type: "app", limit: 5 });
        // Build a description of the app for the LLM
        const appDescription = buildAppDescription(inventory);
        const ragContext = formatRAGContext(priorKnowledge, "Prior knowledge about this app");
        const result = await ctx.llm.complete({
            model: ctx.config.modelsConfig.planner,
            system: `You are a QA engineer analyzing a web application to identify critical user flows for automated testing.
Output ONLY valid JSON — no markdown fences, no explanation.`,
            messages: [
                {
                    role: "user",
                    content: `Analyze this web application and identify the critical user flows that need automated testing.

## App Structure
${appDescription}
${ragContext}

Return a JSON array of test flows. Each flow must have:
- "id": unique string like "flow-1", "flow-2", etc.
- "name": short descriptive name
- "description": what the flow tests
- "priority": "critical" | "high" | "medium" | "low"
- "steps": array of { "action": "navigate"|"click"|"fill"|"select"|"wait"|"assert", "target": string, "value"?: string, "description": string }
- "assertions": array of { "type": "visible"|"text"|"url"|"attribute"|"count", "target": string, "expected": string, "description": string }

Prioritize:
1. Authentication flows (login, signup, logout)
2. Core CRUD operations
3. Navigation between main sections
4. Form submissions
5. Error handling paths

Return 5-20 flows depending on app complexity.`,
                },
            ],
            maxTokens: 8192,
            temperature: 0,
        });
        const flows = parseLLMJson(result.content);
        return flows;
    },
};
function buildAppDescription(inventory) {
    const lines = [];
    lines.push(`Total pages discovered: ${inventory.pages.length}`);
    lines.push("");
    for (const page of inventory.pages) {
        lines.push(`### ${page.title || page.url}`);
        lines.push(`URL: ${page.url}`);
        lines.push(`Interactive elements: ${page.interactiveElements}`);
        if (page.forms.length > 0) {
            lines.push(`Forms: ${page.forms.map((f) => `[${f.fields.join(", ")}]`).join("; ")}`);
        }
        if (page.links.length > 0) {
            lines.push(`Links to: ${page.links.slice(0, 10).join(", ")}`);
        }
        lines.push("");
    }
    return lines.join("\n");
}
//# sourceMappingURL=flow-analysis.js.map