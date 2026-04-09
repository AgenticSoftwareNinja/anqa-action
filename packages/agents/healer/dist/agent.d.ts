import type { Agent, AgentContext, AgentPlan, AgentResult, AgentTask, Skill, Verification } from "@agentic-nqa/core";
export declare class HealerAgent implements Agent {
    readonly name = "playwright-healer";
    readonly program = "programs/healer.md";
    readonly skills: Skill[];
    private ctx;
    init(ctx: AgentContext): Promise<void>;
    plan(task: AgentTask): Promise<AgentPlan>;
    execute(plan: AgentPlan): Promise<AgentResult>;
    verify(result: AgentResult): Promise<Verification>;
}
//# sourceMappingURL=agent.d.ts.map