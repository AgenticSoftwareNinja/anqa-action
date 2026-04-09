import {
  loadConfig,
  createLLMClient,
  createLogger,
  type AgentContext,
  type MetricsCollector,
  type QualityMetrics,
} from "@agentic-nqa/core";
import { createBrowserClient } from "@agentic-nqa/browser";
import {
  createRAGClient,
  createEmbeddingProvider,
  getSupabaseClient,
  createScopedRAGClient,
} from "@agentic-nqa/rag";

interface SetupOptions {
  projectId?: string;
}

export function createAgentContext(options?: SetupOptions): AgentContext {
  const config = loadConfig();
  const logger = createLogger({ component: "anqa" });
  const llm = createLLMClient(config.anthropicApiKey);

  const supabase = getSupabaseClient({
    url: config.supabaseUrl,
    serviceRoleKey: config.supabaseKey,
    logger,
  });

  const embeddings = createEmbeddingProvider({
    provider: config.embeddingProvider,
    apiKey: config.embeddingApiKey ?? "",
    awsRegion: config.awsRegion,
    logger,
  });

  const rawRag = createRAGClient({
    supabase,
    embeddings,
    logger,
  });

  const rag = createScopedRAGClient(rawRag, options?.projectId);

  const browser = createBrowserClient({
    playwrightCliBin: config.playwrightCliBin,
    logger,
  });

  const metrics = createMetricsCollector();

  return { rag, browser, llm, metrics, config };
}

function createMetricsCollector(): MetricsCollector {
  const data: Map<string, number[]> = new Map();

  return {
    record(name: string, value: number, _tags?: Record<string, string>) {
      const values = data.get(name) ?? [];
      values.push(value);
      data.set(name, values);
    },
    snapshot(): QualityMetrics {
      const avg = (key: string) => {
        const values = data.get(key) ?? [];
        return values.length > 0
          ? values.reduce((a, b) => a + b, 0) / values.length
          : 0;
      };

      return {
        passRate: avg("pass_rate"),
        selectorResilience: avg("selector_resilience"),
        coverageDelta: avg("coverage_delta"),
        flakinessScore: avg("flakiness_score"),
        healingSuccessRate: avg("healing_success_rate"),
        generationTimeMs: avg("generation_time_ms"),
      };
    },
  };
}
