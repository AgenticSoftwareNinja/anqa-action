import type { RAGClient, KnowledgeType, Logger } from "@agentic-nqa/core";
export interface IngestionOptions {
    rag: RAGClient;
    logger?: Logger;
}
/**
 * Ingest markdown files from a directory into the RAG knowledge base.
 * Used to seed patterns, strategies, and app docs from the knowledge/ directory.
 */
export declare function ingestDirectory(dirPath: string, type: KnowledgeType, options: IngestionOptions): Promise<number>;
//# sourceMappingURL=index.d.ts.map