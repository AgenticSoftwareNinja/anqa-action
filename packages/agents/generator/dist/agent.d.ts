import type { Agent, AgentContext, AgentPlan, AgentResult, AgentTask, Skill, Verification } from "@agentic-nqa/core";
export declare class GeneratorAgent implements Agent {
    readonly name = "playwright-generator";
    readonly program = "programs/generator.md";
    readonly skills: Skill[];
    private ctx;
    private outputDir;
    init(ctx: AgentContext): Promise<void>;
    plan(task: AgentTask): Promise<AgentPlan>;
    execute(plan: AgentPlan): Promise<AgentResult>;
    verify(result: AgentResult): Promise<Verification>;
}
//# sourceMappingURL=agent.d.ts.map