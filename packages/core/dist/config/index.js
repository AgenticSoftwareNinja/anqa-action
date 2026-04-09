import { z } from "zod";
const configSchema = z.object({
    anthropicApiKey: z.string().min(1),
    supabaseUrl: z.string().url(),
    supabaseKey: z.string().min(1),
    embeddingProvider: z.enum(["openai", "voyage", "bedrock"]).default("openai"),
    embeddingApiKey: z.string().optional(),
    awsRegion: z.string().default("us-east-1"),
    playwrightCliBin: z.string().optional(),
    modelsConfig: z
        .object({
        planner: z.string().default("claude-opus-4-6"),
        generator: z.string().default("claude-sonnet-4-6"),
        healer: z.string().default("claude-sonnet-4-6"),
    })
        .default({}),
});
export function loadConfig(overrides) {
    const raw = {
        anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
        supabaseUrl: process.env.SUPABASE_URL ?? "http://127.0.0.1:54321",
        supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY ??
            process.env.SUPABASE_ANON_KEY ??
            "",
        embeddingProvider: process.env.EMBEDDING_PROVIDER ?? "openai",
        embeddingApiKey: process.env.OPENAI_API_KEY ?? process.env.VOYAGE_API_KEY ?? undefined,
        awsRegion: process.env.AWS_REGION ?? "us-east-1",
        playwrightCliBin: process.env.PLAYWRIGHT_CLI_BIN ?? "playwright-cli",
        modelsConfig: {
            planner: process.env.MODEL_PLANNER ?? "claude-opus-4-6",
            generator: process.env.MODEL_GENERATOR ?? "claude-sonnet-4-6",
            healer: process.env.MODEL_HEALER ?? "claude-sonnet-4-6",
        },
        ...overrides,
    };
    return configSchema.parse(raw);
}
//# sourceMappingURL=index.js.map