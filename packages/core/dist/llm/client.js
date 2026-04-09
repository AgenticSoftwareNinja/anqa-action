import Anthropic from "@anthropic-ai/sdk";
export function createLLMClient(apiKey) {
    const anthropic = new Anthropic({ apiKey });
    return {
        async complete(options) {
            const response = await anthropic.messages.create({
                model: options.model,
                max_tokens: options.maxTokens ?? 4096,
                temperature: options.temperature ?? 0,
                system: options.system,
                messages: options.messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
            });
            const textBlock = response.content.find((block) => block.type === "text");
            return {
                content: textBlock?.text ?? "",
                model: response.model,
                usage: {
                    inputTokens: response.usage.input_tokens,
                    outputTokens: response.usage.output_tokens,
                },
                stopReason: response.stop_reason ?? "unknown",
            };
        },
        async *stream(options) {
            const stream = anthropic.messages.stream({
                model: options.model,
                max_tokens: options.maxTokens ?? 4096,
                temperature: options.temperature ?? 0,
                system: options.system,
                messages: options.messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
            });
            for await (const event of stream) {
                if (event.type === "content_block_delta" &&
                    event.delta.type === "text_delta") {
                    yield { type: "text", text: event.delta.text };
                }
            }
        },
    };
}
//# sourceMappingURL=client.js.map