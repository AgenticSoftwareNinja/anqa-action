import type { SupabaseClient } from "@supabase/supabase-js";
import type { RAGClient, Logger } from "@agentic-nqa/core";
import type { EmbeddingProvider } from "../embeddings/index.js";
export interface RAGClientOptions {
    supabase: SupabaseClient;
    embeddings: EmbeddingProvider;
    tableName?: string;
    logger?: Logger;
}
export declare function createRAGClient(options: RAGClientOptions): RAGClient;
//# sourceMappingURL=index.d.ts.map