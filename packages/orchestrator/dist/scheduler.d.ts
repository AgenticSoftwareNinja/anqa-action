import type { Logger } from "@agentic-nqa/core";
import type { ImprovementEngine } from "./improvement.js";
export interface SchedulerOptions {
    engine: ImprovementEngine;
    timeBudgetMs?: number;
    logger?: Logger;
}
/**
 * Scheduler for unattended overnight execution.
 * Runs the improvement engine within time/budget constraints
 * with watchdog error recovery.
 */
export declare class Scheduler {
    private readonly engine;
    private readonly timeBudgetMs;
    private readonly logger?;
    private running;
    private startTime;
    constructor(options: SchedulerOptions);
    start(): Promise<void>;
    isRunning(): boolean;
    elapsed(): number;
    remaining(): number;
}
//# sourceMappingURL=scheduler.d.ts.map