import type { RAGClient } from "@agentic-nqa/core";
/**
 * Wraps a RAGClient to automatically inject projectId into all operations.
 * Skills and agents use this transparently — no code changes needed.
 */
export declare function createScopedRAGClient(client: RAGClient, projectId: string | undefined): RAGClient;
//# sourceMappingURL=scoped.d.ts.map