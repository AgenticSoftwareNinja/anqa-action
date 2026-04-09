export { createRAGClient } from "./retrieval/index.js";
export type { RAGClientOptions } from "./retrieval/index.js";

export { createScopedRAGClient } from "./retrieval/scoped.js";

export { createEmbeddingProvider } from "./embeddings/index.js";
export type {
  EmbeddingProvider,
  EmbeddingOptions,
} from "./embeddings/index.js";

export { getSupabaseClient, resetSupabaseClient } from "./supabase/client.js";
export type { SupabaseOptions } from "./supabase/client.js";

export { ingestDirectory } from "./ingestion/index.js";
export type { IngestionOptions } from "./ingestion/index.js";
