import type { AgentContext, Experiment, ImprovementCycle, Logger } from "@agentic-nqa/core";
import type { Conductor } from "./conductor.js";
export interface ImprovementOptions {
    conductor: Conductor;
    context: AgentContext;
    maxCycles: number;
    maxBudgetTokens?: number;
    plateauThreshold?: number;
    plateauWindow?: number;
    targetAgent?: string;
    programsDir?: string;
    checkpointPath?: string;
    logger?: Logger;
}
export interface CycleResult {
    experiment: Experiment;
    improved: boolean;
}
export declare class ImprovementEngine {
    private readonly conductor;
    private readonly ctx;
    private readonly maxCycles;
    private readonly plateauThreshold;
    private readonly plateauWindow;
    private readonly targetAgent?;
    private readonly logger?;
    private readonly programsDir;
    private readonly improvementTargets;
    private currentCycle;
    private consecutiveNoImprovement;
    private targetIndex;
    private baselineMetrics;
    private checkpointPath;
    constructor(options: ImprovementOptions);
    run(): Promise<ImprovementCycle>;
    private runSingleExperiment;
    private generateHypothesis;
    private measureMetrics;
    private computeWeightedScore;
    private selectTarget;
    private rotateTarget;
    private logExperiment;
    private saveCheckpoint;
    private loadCheckpoint;
    private clearCheckpoint;
}
//# sourceMappingURL=improvement.d.ts.map