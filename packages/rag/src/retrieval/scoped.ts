import type { RAGClient, RAGEntry, RAGSearchOptions } from "@agentic-nqa/core";

/**
 * Wraps a RAGClient to automatically inject projectId into all operations.
 * Skills and agents use this transparently — no code changes needed.
 */
export function createScopedRAGClient(
  client: RAGClient,
  projectId: string | undefined,
): RAGClient {
  return {
    search(query: string, options?: RAGSearchOptions) {
      return client.search(
        query,
        projectId !== undefined ? { ...options, projectId } : options,
      );
    },
    ingest(entry: RAGEntry) {
      return client.ingest(
        projectId !== undefined ? { ...entry, projectId } : entry,
      );
    },
    delete(id: string) {
      return client.delete(id);
    },
  };
}
