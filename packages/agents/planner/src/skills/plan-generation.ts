import { randomUUID } from "node:crypto";
import type { AgentContext, Skill } from "@agentic-nqa/core";
import type { TestPlan, TestFlow } from "@agentic-nqa/core";

export const planGenerationSkill: Skill = {
  name: "plan-generation",
  description: "Generate a structured test plan from analyzed flows",

  async execute(ctx: AgentContext, input: unknown): Promise<TestPlan> {
    const { flows, targetAppName } = input as {
      flows: TestFlow[];
      targetAppName: string;
    };

    const plan: TestPlan = {
      id: `plan-${randomUUID()}`,
      targetApp: targetAppName,
      createdAt: new Date().toISOString(),
      flows: flows.slice(0, 50), // Max 50 flows per plan
    };

    // Store the plan in RAG for future reference
    await ctx.rag.ingest({
      type: "app",
      content: JSON.stringify(plan, null, 2),
      metadata: {
        targetApp: targetAppName,
        flowCount: plan.flows.length,
        priorities: {
          critical: flows.filter((f) => f.priority === "critical").length,
          high: flows.filter((f) => f.priority === "high").length,
          medium: flows.filter((f) => f.priority === "medium").length,
          low: flows.filter((f) => f.priority === "low").length,
        },
      },
    });

    ctx.metrics.record("plan_flows_generated", plan.flows.length, {
      app: targetAppName,
    });

    return plan;
  },
};
