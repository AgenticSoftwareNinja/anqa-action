import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RAGClient,
  RAGEntry,
  RAGResult,
  RAGSearchOptions,
  Logger,
} from "@agentic-nqa/core";
import type { EmbeddingProvider } from "../embeddings/index.js";

export interface RAGClientOptions {
  supabase: SupabaseClient;
  embeddings: EmbeddingProvider;
  tableName?: string;
  logger?: Logger;
}

export function createRAGClient(options: RAGClientOptions): RAGClient {
  const {
    supabase,
    embeddings,
    tableName = "knowledge",
    logger,
  } = options;

  return {
    async search(
      query: string,
      searchOptions?: RAGSearchOptions,
    ): Promise<RAGResult[]> {
      const limit = searchOptions?.limit ?? 10;
      const threshold = searchOptions?.threshold ?? 0.7;

      logger?.debug("RAG search", { query, limit, threshold });

      let queryEmbedding: number[];
      try {
        queryEmbedding = await embeddings.embed(query);
      } catch (e) {
        logger?.warn?.("RAG search skipped — embedding failed", { error: String(e) });
        return [];
      }

      const { data, error } = await supabase.rpc("match_knowledge", {
        query_embedding: queryEmbedding,
        match_threshold: threshold,
        match_count: limit,
        filter_type: searchOptions?.type ?? null,
        filter_project_id: searchOptions?.projectId ?? null,
      });

      if (error) {
        logger?.error("RAG search failed", { error: error.message });
        return [];
      }

      return (data ?? []).map(
        (row: {
          id: string;
          content: string;
          type: string;
          similarity: number;
          metadata: Record<string, unknown>;
        }) => ({
          id: row.id,
          content: row.content,
          type: row.type as RAGResult["type"],
          similarity: row.similarity,
          metadata: row.metadata ?? {},
        }),
      );
    },

    async ingest(entry: RAGEntry): Promise<string> {
      logger?.debug("RAG ingest", { type: entry.type });

      let embedding: number[];
      try {
        embedding = await embeddings.embed(entry.content);
      } catch (e) {
        logger?.warn?.("RAG ingest skipped — embedding failed", { error: String(e) });
        return "skipped";
      }

      const { data, error } = await supabase
        .from(tableName)
        .insert({
          type: entry.type,
          content: entry.content,
          embedding,
          metadata: entry.metadata ?? {},
          project_id: entry.projectId ?? null,
        })
        .select("id")
        .single();

      if (error) {
        logger?.error("RAG ingest failed", { error: error.message });
        return "skipped";
      }

      return data.id;
    },

    async delete(id: string): Promise<void> {
      logger?.debug("RAG delete", { id });

      const { error } = await supabase.from(tableName).delete().eq("id", id);

      if (error) {
        logger?.error("RAG delete failed", { error: error.message });
        throw new Error(`RAG delete failed: ${error.message}`);
      }
    },
  };
}
