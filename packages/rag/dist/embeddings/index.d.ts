import type { Logger } from "@agentic-nqa/core";
export interface EmbeddingProvider {
    embed(text: string): Promise<number[]>;
    embedBatch(texts: string[]): Promise<number[][]>;
    readonly dimensions: number;
}
export interface EmbeddingOptions {
    provider: "openai" | "voyage" | "bedrock";
    apiKey: string;
    model?: string;
    awsRegion?: string;
    logger?: Logger;
}
export declare function createEmbeddingProvider(options: EmbeddingOptions): EmbeddingProvider;
//# sourceMappingURL=index.d.ts.map