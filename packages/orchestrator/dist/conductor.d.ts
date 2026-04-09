import type { Agent, AgentContext, AgentResult, Logger, TargetApp, QualityMetrics } from "@agentic-nqa/core";
import { parsePlaywrightReport } from "@agentic-nqa/core";
export interface ConductorOptions {
    agents: Agent[];
    context: AgentContext;
    outputDir?: string;
    logger?: Logger;
}
export interface PipelineResult {
    planResult: AgentResult;
    generateResult: AgentResult;
    healResult?: AgentResult;
    testResults: ReturnType<typeof parsePlaywrightReport>;
    metrics: QualityMetrics;
}
export declare class Conductor {
    private readonly agents;
    private readonly ctx;
    private readonly outputDir;
    private readonly logger?;
    constructor(options: ConductorOptions);
    initialize(): Promise<void>;
    runPipeline(targetApp: TargetApp): Promise<PipelineResult>;
    getAgent(name: string): Agent | undefined;
}
//# sourceMappingURL=conductor.d.ts.map