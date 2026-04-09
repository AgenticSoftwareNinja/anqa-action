import { readFile, writeFile, copyFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createEmptyMetrics, parseLLMJson, toErrorMessage } from "@agentic-nqa/core";
function getImprovementTargets(programsDir) {
    return [
        { agent: "playwright-planner", file: join(programsDir, "planner.md") },
        { agent: "playwright-generator", file: join(programsDir, "generator.md") },
        { agent: "playwright-healer", file: join(programsDir, "healer.md") },
    ];
}
export class ImprovementEngine {
    conductor;
    ctx;
    maxCycles;
    plateauThreshold;
    plateauWindow;
    targetAgent;
    logger;
    programsDir;
    improvementTargets;
    currentCycle = 0;
    consecutiveNoImprovement = 0;
    targetIndex = 0;
    baselineMetrics = createEmptyMetrics();
    checkpointPath;
    constructor(options) {
        this.conductor = options.conductor;
        this.ctx = options.context;
        this.maxCycles = options.maxCycles;
        this.plateauThreshold = options.plateauThreshold ?? 0.01;
        this.plateauWindow = options.plateauWindow ?? 3;
        this.targetAgent = options.targetAgent;
        this.logger = options.logger;
        this.programsDir = options.programsDir ?? "programs";
        this.checkpointPath = options.checkpointPath ?? ".anqa-checkpoint.json";
        this.improvementTargets = getImprovementTargets(this.programsDir);
    }
    async run() {
        const cycleId = `cycle-${randomUUID()}`;
        const startedAt = new Date().toISOString();
        // Try to resume from checkpoint
        await this.loadCheckpoint();
        // Measure baseline
        this.baselineMetrics = await this.measureMetrics();
        this.logger?.info("Baseline metrics", { metrics: this.baselineMetrics });
        const experiments = [];
        for (this.currentCycle; this.currentCycle < this.maxCycles; this.currentCycle++) {
            this.logger?.info("Starting cycle", {
                cycle: this.currentCycle + 1,
                total: this.maxCycles,
            });
            try {
                const result = await this.runSingleExperiment();
                experiments.push(result.experiment);
                if (result.improved) {
                    this.consecutiveNoImprovement = 0;
                    this.baselineMetrics =
                        result.experiment.metricsAfter ?? this.baselineMetrics;
                }
                else {
                    this.consecutiveNoImprovement++;
                }
                // Plateau detection: if N consecutive cycles show no improvement, rotate agent
                if (this.consecutiveNoImprovement >= this.plateauWindow) {
                    this.logger?.info("Plateau detected, rotating target agent");
                    this.rotateTarget();
                    this.consecutiveNoImprovement = 0;
                }
                // Save checkpoint after each cycle
                await this.saveCheckpoint();
            }
            catch (error) {
                this.logger?.error("Cycle failed, continuing", {
                    cycle: this.currentCycle,
                    error: toErrorMessage(error),
                });
            }
        }
        // Clean up checkpoint on completion
        await this.clearCheckpoint();
        const endMetrics = await this.measureMetrics();
        return {
            id: cycleId,
            totalExperiments: experiments.length,
            keptExperiments: experiments.filter((e) => e.kept).length,
            startMetrics: this.baselineMetrics,
            endMetrics,
            startedAt,
            completedAt: new Date().toISOString(),
        };
    }
    async runSingleExperiment() {
        const target = this.selectTarget();
        const experimentId = `exp-${randomUUID()}`;
        this.logger?.info("Experiment starting", {
            id: experimentId,
            agent: target.agent,
            file: target.file,
        });
        // Read current program file
        const originalContent = await readFile(target.file, "utf-8");
        // Back up the original
        const backupPath = `${target.file}.backup`;
        await copyFile(target.file, backupPath);
        // Generate hypothesis and modification via LLM
        const hypothesis = await this.generateHypothesis(target.agent, originalContent);
        // Apply modification
        await writeFile(target.file, hypothesis.modifiedContent, "utf-8");
        // Measure metrics with modification
        const metricsAfter = await this.measureMetrics();
        // Compare: did it improve?
        const score = this.computeWeightedScore(metricsAfter);
        const baselineScore = this.computeWeightedScore(this.baselineMetrics);
        const improved = score > baselineScore + this.plateauThreshold;
        if (!improved) {
            // Revert: restore from backup
            await copyFile(backupPath, target.file);
            this.logger?.info("Experiment reverted", {
                id: experimentId,
                scoreDelta: score - baselineScore,
            });
        }
        else {
            this.logger?.info("Experiment kept", {
                id: experimentId,
                scoreDelta: score - baselineScore,
            });
        }
        const experiment = {
            id: experimentId,
            agent: target.agent,
            hypothesis: hypothesis.description,
            changes: [
                {
                    file: target.file,
                    type: "prompt",
                    description: hypothesis.description,
                    diff: hypothesis.diff,
                },
            ],
            metricsBefore: this.baselineMetrics,
            metricsAfter,
            kept: improved,
            createdAt: new Date().toISOString(),
        };
        // Log to Supabase
        await this.logExperiment(experiment);
        return { experiment, improved };
    }
    async generateHypothesis(agentName, currentContent) {
        const result = await this.ctx.llm.complete({
            model: this.ctx.config.modelsConfig.planner,
            system: `You are an AI researcher improving a QA testing agent's instruction file (program.md).
Your goal is to make ONE targeted modification that improves the agent's test generation quality.

Output valid JSON with these fields:
- "description": one-line hypothesis of what you're changing and why
- "modifiedContent": the complete modified program.md content
- "diff": a brief summary of what changed`,
            messages: [
                {
                    role: "user",
                    content: `Improve the "${agentName}" agent's instructions.

Current metrics:
- Pass rate: ${this.baselineMetrics.passRate}
- Selector resilience: ${this.baselineMetrics.selectorResilience}
- Flakiness: ${this.baselineMetrics.flakinessScore}
- Healing success: ${this.baselineMetrics.healingSuccessRate}

Current program.md:
${currentContent}

Make ONE specific improvement. Ideas:
- Add better selector generation examples
- Improve assertion quality guidance
- Add error recovery patterns
- Refine flow analysis heuristics
- Add edge case handling instructions

Output JSON with description, modifiedContent, and diff.`,
                },
            ],
            maxTokens: 8192,
            temperature: 0.7,
        });
        return parseLLMJson(result.content);
    }
    async measureMetrics() {
        // Run a quick test cycle and collect metrics
        return this.ctx.metrics.snapshot();
    }
    computeWeightedScore(metrics) {
        return (metrics.passRate * 0.3 +
            metrics.selectorResilience * 0.2 +
            metrics.coverageDelta * 0.2 +
            (1 - metrics.flakinessScore) * 0.15 +
            metrics.healingSuccessRate * 0.1 +
            (metrics.generationTimeMs > 0
                ? Math.max(0, 1 - metrics.generationTimeMs / 60000)
                : 0) *
                0.05);
    }
    selectTarget() {
        if (this.targetAgent) {
            const target = this.improvementTargets.find((t) => t.agent === this.targetAgent);
            return target ?? this.improvementTargets[0];
        }
        return this.improvementTargets[this.targetIndex % this.improvementTargets.length];
    }
    rotateTarget() {
        this.targetIndex =
            (this.targetIndex + 1) % this.improvementTargets.length;
    }
    async logExperiment(experiment) {
        try {
            await this.ctx.rag.ingest({
                type: "strategy",
                content: JSON.stringify({
                    agent: experiment.agent,
                    hypothesis: experiment.hypothesis,
                    kept: experiment.kept,
                    metricsDelta: experiment.metricsAfter
                        ? {
                            passRate: experiment.metricsAfter.passRate -
                                experiment.metricsBefore.passRate,
                        }
                        : null,
                }),
                metadata: {
                    experimentId: experiment.id,
                    agent: experiment.agent,
                    kept: experiment.kept,
                },
            });
        }
        catch (error) {
            this.logger?.warn("Failed to log experiment to RAG", {
                error: toErrorMessage(error),
            });
        }
    }
    async saveCheckpoint() {
        const checkpoint = {
            currentCycle: this.currentCycle,
            targetIndex: this.targetIndex,
            consecutiveNoImprovement: this.consecutiveNoImprovement,
            baselineMetrics: this.baselineMetrics,
            savedAt: new Date().toISOString(),
        };
        await writeFile(this.checkpointPath, JSON.stringify(checkpoint, null, 2), "utf-8");
    }
    async loadCheckpoint() {
        try {
            const data = await readFile(this.checkpointPath, "utf-8");
            const checkpoint = JSON.parse(data);
            this.currentCycle = checkpoint.currentCycle ?? 0;
            this.targetIndex = checkpoint.targetIndex ?? 0;
            this.consecutiveNoImprovement =
                checkpoint.consecutiveNoImprovement ?? 0;
            this.baselineMetrics =
                checkpoint.baselineMetrics ?? createEmptyMetrics();
            this.logger?.info("Resumed from checkpoint", {
                cycle: this.currentCycle,
            });
        }
        catch {
            // No checkpoint — start fresh
        }
    }
    async clearCheckpoint() {
        try {
            const { unlink } = await import("node:fs/promises");
            await unlink(this.checkpointPath);
        }
        catch {
            // Already cleared
        }
    }
}
//# sourceMappingURL=improvement.js.map