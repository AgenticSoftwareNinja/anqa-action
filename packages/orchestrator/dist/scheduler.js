import { toErrorMessage } from "@agentic-nqa/core";
/**
 * Scheduler for unattended overnight execution.
 * Runs the improvement engine within time/budget constraints
 * with watchdog error recovery.
 */
export class Scheduler {
    engine;
    timeBudgetMs;
    logger;
    running = false;
    startTime = 0;
    constructor(options) {
        this.engine = options.engine;
        this.timeBudgetMs = options.timeBudgetMs ?? 8 * 60 * 60 * 1000; // 8 hours default
        this.logger = options.logger;
    }
    async start() {
        if (this.running) {
            this.logger?.warn("Scheduler already running");
            return;
        }
        this.running = true;
        this.startTime = Date.now();
        this.logger?.info("Scheduler started", {
            timeBudgetMs: this.timeBudgetMs,
            timeBudgetHours: (this.timeBudgetMs / 3_600_000).toFixed(1),
        });
        // Set up watchdog timer
        const watchdog = setTimeout(() => {
            this.logger?.warn("Time budget exceeded, stopping");
            this.running = false;
        }, this.timeBudgetMs);
        // Handle graceful shutdown
        const shutdownHandler = () => {
            this.logger?.info("Shutdown signal received");
            this.running = false;
        };
        process.on("SIGINT", shutdownHandler);
        process.on("SIGTERM", shutdownHandler);
        try {
            const result = await this.engine.run();
            this.logger?.info("Improvement cycle complete", {
                totalExperiments: result.totalExperiments,
                keptExperiments: result.keptExperiments,
                durationMs: Date.now() - this.startTime,
            });
            // Report summary
            console.log("\n=== Overnight Run Summary ===");
            console.log(`Duration: ${formatDuration(Date.now() - this.startTime)}`);
            console.log(`Experiments: ${result.totalExperiments}`);
            console.log(`Kept: ${result.keptExperiments}`);
            console.log(`Improvement rate: ${result.totalExperiments > 0 ? ((result.keptExperiments / result.totalExperiments) * 100).toFixed(1) : 0}%`);
            console.log("\nStart metrics:", JSON.stringify(result.startMetrics, null, 2));
            console.log("End metrics:", JSON.stringify(result.endMetrics, null, 2));
        }
        catch (error) {
            this.logger?.error("Scheduler error", {
                error: toErrorMessage(error),
                elapsed: Date.now() - this.startTime,
            });
        }
        finally {
            clearTimeout(watchdog);
            process.off("SIGINT", shutdownHandler);
            process.off("SIGTERM", shutdownHandler);
            this.running = false;
        }
    }
    isRunning() {
        return this.running;
    }
    elapsed() {
        return this.running ? Date.now() - this.startTime : 0;
    }
    remaining() {
        return this.running
            ? Math.max(0, this.timeBudgetMs - (Date.now() - this.startTime))
            : 0;
    }
}
function formatDuration(ms) {
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.floor((ms % 3_600_000) / 60_000);
    const seconds = Math.floor((ms % 60_000) / 1_000);
    if (hours > 0)
        return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0)
        return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
}
//# sourceMappingURL=scheduler.js.map