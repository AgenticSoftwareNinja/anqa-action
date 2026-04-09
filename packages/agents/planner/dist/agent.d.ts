import type { Agent, AgentContext, AgentPlan, AgentResult, AgentTask, Skill, Verification } from "@agentic-nqa/core";
export declare class PlannerAgent implements Agent {
    readonly name = "playwright-planner";
    readonly program = "programs/planner.md";
    readonly skills: Skill[];
    private ctx;
    private programContent;
    init(ctx: AgentContext): Promise<void>;
    plan(task: AgentTask): Promise<AgentPlan>;
    execute(plan: AgentPlan): Promise<AgentResult>;
    verify(result: AgentResult): Promise<Verification>;
}
//# sourceMappingURL=agent.d.ts.map