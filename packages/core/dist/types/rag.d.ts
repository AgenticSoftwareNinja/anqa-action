export interface RAGClient {
    search(query: string, options?: RAGSearchOptions): Promise<RAGResult[]>;
    ingest(entry: RAGEntry): Promise<string>;
    delete(id: string): Promise<void>;
}
export interface RAGSearchOptions {
    type?: KnowledgeType;
    limit?: number;
    threshold?: number;
    metadata?: Record<string, unknown>;
    projectId?: string;
}
export interface RAGResult {
    id: string;
    content: string;
    type: KnowledgeType;
    similarity: number;
    metadata: Record<string, unknown>;
}
export interface RAGEntry {
    type: KnowledgeType;
    content: string;
    metadata?: Record<string, unknown>;
    projectId?: string;
}
export type KnowledgeType = "pattern" | "strategy" | "app" | "failure";
//# sourceMappingURL=rag.d.ts.map