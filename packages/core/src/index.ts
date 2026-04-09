// Types
export type {
  Agent,
  AgentContext,
  AgentError,
  AgentPlan,
  AgentResult,
  AgentTask,
  AppAuth,
  Artifact,
  BrowserClient,
  BrowserSnapshot,
  MetricsCollector,
  ModelsConfig,
  PlanStep,
  PlatformConfig,
  QualityMetrics,
  Skill,
  SnapshotElement,
  TargetApp,
  Verification,
} from "./types/agent.js";

export type {
  KnowledgeType,
  RAGClient,
  RAGEntry,
  RAGResult,
  RAGSearchOptions,
} from "./types/rag.js";

export type {
  HealingFix,
  HealingReport,
  TestAssertion,
  TestError,
  TestFlow,
  TestPlan,
  TestResult,
  TestStep,
} from "./types/test-plan.js";

export type {
  Experiment,
  ExperimentChange,
  ImprovementCycle,
} from "./types/experiment.js";

// Audit
export type {
  AuditGap,
  AuditReport,
  AISetupInfo,
  CIConfigInfo,
  CoverageMap,
  CoverageSummary,
  ExistingTestFile,
  FlowCoverage,
  FrameworkInfo,
  ProposedTest,
  RepoAnalysis,
} from "./types/audit.js";

// Config
export { loadConfig } from "./config/index.js";

// LLM
export { createLLMClient } from "./llm/client.js";
export type {
  CompletionOptions,
  CompletionResult,
  LLMClient,
  LLMMessage,
} from "./llm/client.js";
export { parseLLMJson } from "./llm/parse.js";

// Logger
export { createLogger } from "./logger/index.js";
export type { Logger, LogLevel } from "./logger/index.js";

// Utils
export {
  createEmptyMetrics,
  deriveAppName,
  formatRAGContext,
  parsePlaywrightReport,
  toErrorMessage,
} from "./utils/index.js";

// Git
export {
  createGitHubPRClient,
  type GitHubPRClient,
  type CreateBranchOptions,
  type CommitFilesOptions,
  type CreatePROptions,
} from "./git/index.js";
