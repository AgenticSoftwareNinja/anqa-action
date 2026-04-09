import type { QualityMetrics } from "./agent.js";

export interface Experiment {
  id: string;
  agent: string;
  hypothesis: string;
  changes: ExperimentChange[];
  metricsBefore: QualityMetrics;
  metricsAfter?: QualityMetrics;
  kept: boolean;
  createdAt: string;
}

export interface ExperimentChange {
  file: string;
  type: "prompt" | "strategy" | "template" | "config";
  description: string;
  diff: string;
}

export interface ImprovementCycle {
  id: string;
  totalExperiments: number;
  keptExperiments: number;
  startMetrics: QualityMetrics;
  endMetrics: QualityMetrics;
  startedAt: string;
  completedAt?: string;
}
