import type { RAGClient } from "./rag.js";
import type { LLMClient } from "../llm/client.js";

/**
 * GSD-inspired agent lifecycle: init → plan → execute → verify
 */
export interface Agent {
  readonly name: string;
  readonly program: string;
  readonly skills: Skill[];

  init(ctx: AgentContext): Promise<void>;
  plan(task: AgentTask): Promise<AgentPlan>;
  execute(plan: AgentPlan): Promise<AgentResult>;
  verify(result: AgentResult): Promise<Verification>;
}

export interface AgentContext {
  rag: RAGClient;
  browser: BrowserClient;
  llm: LLMClient;
  metrics: MetricsCollector;
  config: PlatformConfig;
}

export interface Skill {
  readonly name: string;
  readonly description: string;
  execute(ctx: AgentContext, input: unknown): Promise<unknown>;
}

export interface AgentTask {
  id: string;
  type: "plan" | "generate" | "heal";
  targetApp: TargetApp;
  input: Record<string, unknown>;
}

export interface AgentPlan {
  taskId: string;
  steps: PlanStep[];
  estimatedDuration?: number;
}

export interface PlanStep {
  id: string;
  description: string;
  skill: string;
  input: Record<string, unknown>;
  dependsOn?: string[];
}

export interface AgentResult {
  taskId: string;
  status: "success" | "failure" | "partial";
  outputs: Record<string, unknown>;
  artifacts: Artifact[];
  errors?: AgentError[];
}

export interface Verification {
  taskId: string;
  passed: boolean;
  metrics: QualityMetrics;
  issues?: string[];
}

export interface Artifact {
  type: "test-file" | "test-plan" | "trace" | "screenshot" | "report";
  path: string;
  metadata?: Record<string, unknown>;
}

export interface AgentError {
  code: string;
  message: string;
  recoverable: boolean;
  context?: Record<string, unknown>;
}

export interface BrowserClient {
  navigate(url: string): Promise<BrowserSnapshot>;
  snapshot(): Promise<BrowserSnapshot>;
  click(selector: string): Promise<void>;
  fill(selector: string, value: string): Promise<void>;
  setStorageState(path: string): Promise<void>;
  close(): Promise<void>;
}

export interface BrowserSnapshot {
  url: string;
  title: string;
  content: string;
  elements: SnapshotElement[];
  timestamp: number;
}

export interface SnapshotElement {
  ref: string;
  role: string;
  name: string;
  selector: string;
}

export interface TargetApp {
  name: string;
  url: string;
  description?: string;
  auth?: AppAuth;
  projectId?: string;
}

export interface AppAuth {
  type: "none" | "basic" | "bearer" | "cookie" | "storage-state";
  credentials?: Record<string, string>;
  storageStatePath?: string;
}

export interface QualityMetrics {
  passRate: number;
  selectorResilience: number;
  coverageDelta: number;
  flakinessScore: number;
  healingSuccessRate: number;
  generationTimeMs: number;
}

export interface MetricsCollector {
  record(name: string, value: number, tags?: Record<string, string>): void;
  snapshot(): QualityMetrics;
}

export interface PlatformConfig {
  anthropicApiKey: string;
  supabaseUrl: string;
  supabaseKey: string;
  embeddingProvider: "openai" | "voyage" | "bedrock";
  embeddingApiKey?: string;
  awsRegion: string;
  playwrightCliBin?: string;
  modelsConfig: ModelsConfig;
}

export interface ModelsConfig {
  planner: string;
  generator: string;
  healer: string;
}
