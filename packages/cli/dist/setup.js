import { loadConfig, createLLMClient, createLogger, } from "@agentic-nqa/core";
import { createBrowserClient } from "@agentic-nqa/browser";
import { createRAGClient, createEmbeddingProvider, getSupabaseClient, createScopedRAGClient, } from "@agentic-nqa/rag";
export function createAgentContext(options) {
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
function createMetricsCollector() {
    const data = new Map();
    return {
        record(name, value, _tags) {
            const values = data.get(name) ?? [];
            values.push(value);
            data.set(name, values);
        },
        snapshot() {
            const avg = (key) => {
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
//# sourceMappingURL=setup.js.map