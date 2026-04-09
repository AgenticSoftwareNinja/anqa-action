export interface LLMClient {
    complete(options: CompletionOptions): Promise<CompletionResult>;
    stream(options: CompletionOptions): AsyncIterable<{
        type: "text";
        text: string;
    }>;
}
export interface CompletionOptions {
    model: string;
    system?: string;
    messages: LLMMessage[];
    maxTokens?: number;
    temperature?: number;
}
export interface LLMMessage {
    role: "user" | "assistant";
    content: string;
}
export interface CompletionResult {
    content: string;
    model: string;
    usage: {
        inputTokens: number;
        outputTokens: number;
    };
    stopReason: string;
}
export declare function createLLMClient(apiKey: string): LLMClient;
//# sourceMappingURL=client.d.ts.map