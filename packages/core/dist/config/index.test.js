import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { loadConfig } from "./index.js";
const REQUIRED_ENV = {
    ANTHROPIC_API_KEY: "test-anthropic-key",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
};
describe("loadConfig", () => {
    let savedEnv;
    beforeEach(() => {
        // Save relevant env vars before each test
        savedEnv = {};
        const keysToSave = [
            "ANTHROPIC_API_KEY",
            "SUPABASE_URL",
            "SUPABASE_SERVICE_ROLE_KEY",
            "SUPABASE_ANON_KEY",
            "EMBEDDING_PROVIDER",
            "OPENAI_API_KEY",
            "VOYAGE_API_KEY",
            "PLAYWRIGHT_CLI_BIN",
            "MODEL_PLANNER",
            "MODEL_GENERATOR",
            "MODEL_HEALER",
        ];
        for (const key of keysToSave) {
            savedEnv[key] = process.env[key];
            delete process.env[key];
        }
        // Set required env vars for a valid baseline
        for (const [key, val] of Object.entries(REQUIRED_ENV)) {
            process.env[key] = val;
        }
    });
    afterEach(() => {
        // Restore env vars after each test
        for (const [key, val] of Object.entries(savedEnv)) {
            if (val === undefined) {
                delete process.env[key];
            }
            else {
                process.env[key] = val;
            }
        }
    });
    describe("loading from env vars", () => {
        it("loads ANTHROPIC_API_KEY from env", () => {
            const config = loadConfig();
            expect(config.anthropicApiKey).toBe("test-anthropic-key");
        });
        it("loads supabaseUrl from SUPABASE_URL env var", () => {
            const config = loadConfig();
            expect(config.supabaseUrl).toBe("https://example.supabase.co");
        });
        it("loads supabaseKey from SUPABASE_SERVICE_ROLE_KEY first", () => {
            process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
            process.env.SUPABASE_ANON_KEY = "anon-key";
            const config = loadConfig();
            expect(config.supabaseKey).toBe("service-role-key");
        });
        it("falls back to SUPABASE_ANON_KEY when SUPABASE_SERVICE_ROLE_KEY is absent", () => {
            delete process.env.SUPABASE_SERVICE_ROLE_KEY;
            process.env.SUPABASE_ANON_KEY = "anon-key";
            const config = loadConfig();
            expect(config.supabaseKey).toBe("anon-key");
        });
        it("loads embeddingProvider from EMBEDDING_PROVIDER env var", () => {
            process.env.EMBEDDING_PROVIDER = "voyage";
            const config = loadConfig();
            expect(config.embeddingProvider).toBe("voyage");
        });
        it("loads embeddingApiKey from OPENAI_API_KEY first", () => {
            process.env.OPENAI_API_KEY = "openai-key";
            process.env.VOYAGE_API_KEY = "voyage-key";
            const config = loadConfig();
            expect(config.embeddingApiKey).toBe("openai-key");
        });
        it("falls back to VOYAGE_API_KEY when OPENAI_API_KEY is absent", () => {
            delete process.env.OPENAI_API_KEY;
            process.env.VOYAGE_API_KEY = "voyage-key";
            const config = loadConfig();
            expect(config.embeddingApiKey).toBe("voyage-key");
        });
        it("loads MODEL_PLANNER, MODEL_GENERATOR, MODEL_HEALER from env vars", () => {
            process.env.MODEL_PLANNER = "custom-planner";
            process.env.MODEL_GENERATOR = "custom-generator";
            process.env.MODEL_HEALER = "custom-healer";
            const config = loadConfig();
            expect(config.modelsConfig.planner).toBe("custom-planner");
            expect(config.modelsConfig.generator).toBe("custom-generator");
            expect(config.modelsConfig.healer).toBe("custom-healer");
        });
        it("loads PLAYWRIGHT_CLI_BIN from env var", () => {
            process.env.PLAYWRIGHT_CLI_BIN = "/usr/local/bin/playwright";
            const config = loadConfig();
            expect(config.playwrightCliBin).toBe("/usr/local/bin/playwright");
        });
    });
    describe("default values", () => {
        it("defaults supabaseUrl to http://127.0.0.1:54321 when SUPABASE_URL is not set", () => {
            delete process.env.SUPABASE_URL;
            const config = loadConfig();
            expect(config.supabaseUrl).toBe("http://127.0.0.1:54321");
        });
        it("defaults embeddingProvider to openai when EMBEDDING_PROVIDER is not set", () => {
            const config = loadConfig();
            expect(config.embeddingProvider).toBe("openai");
        });
        it("defaults modelsConfig.planner to claude-opus-4-6", () => {
            const config = loadConfig();
            expect(config.modelsConfig.planner).toBe("claude-opus-4-6");
        });
        it("defaults modelsConfig.generator to claude-sonnet-4-6", () => {
            const config = loadConfig();
            expect(config.modelsConfig.generator).toBe("claude-sonnet-4-6");
        });
        it("defaults modelsConfig.healer to claude-sonnet-4-6", () => {
            const config = loadConfig();
            expect(config.modelsConfig.healer).toBe("claude-sonnet-4-6");
        });
        it("defaults embeddingApiKey to undefined when no API key env vars are set", () => {
            delete process.env.OPENAI_API_KEY;
            delete process.env.VOYAGE_API_KEY;
            const config = loadConfig();
            expect(config.embeddingApiKey).toBeUndefined();
        });
        it("defaults playwrightCliBin to playwright-cli when not set", () => {
            delete process.env.PLAYWRIGHT_CLI_BIN;
            const config = loadConfig();
            expect(config.playwrightCliBin).toBe("playwright-cli");
        });
    });
    describe("overrides", () => {
        it("merges overrides over env-derived values", () => {
            const config = loadConfig({ anthropicApiKey: "override-key" });
            expect(config.anthropicApiKey).toBe("override-key");
        });
        it("overrides supabaseUrl", () => {
            const config = loadConfig({ supabaseUrl: "https://override.supabase.co" });
            expect(config.supabaseUrl).toBe("https://override.supabase.co");
        });
        it("overrides supabaseKey", () => {
            const config = loadConfig({ supabaseKey: "override-key" });
            expect(config.supabaseKey).toBe("override-key");
        });
        it("overrides embeddingProvider", () => {
            const config = loadConfig({ embeddingProvider: "voyage" });
            expect(config.embeddingProvider).toBe("voyage");
        });
        it("overrides modelsConfig", () => {
            const config = loadConfig({
                modelsConfig: { planner: "gpt-4", generator: "gpt-3.5", healer: "gpt-4" },
            });
            expect(config.modelsConfig.planner).toBe("gpt-4");
            expect(config.modelsConfig.generator).toBe("gpt-3.5");
            expect(config.modelsConfig.healer).toBe("gpt-4");
        });
        it("preserves non-overridden fields from env", () => {
            const config = loadConfig({ anthropicApiKey: "override-key" });
            expect(config.supabaseUrl).toBe("https://example.supabase.co");
            expect(config.supabaseKey).toBe("test-service-role-key");
        });
    });
    describe("validation errors", () => {
        it("throws when ANTHROPIC_API_KEY is not set", () => {
            delete process.env.ANTHROPIC_API_KEY;
            expect(() => loadConfig()).toThrow();
        });
        it("throws when ANTHROPIC_API_KEY is empty string", () => {
            process.env.ANTHROPIC_API_KEY = "";
            expect(() => loadConfig()).toThrow();
        });
        it("throws when supabaseUrl is not a valid URL", () => {
            process.env.SUPABASE_URL = "not-a-valid-url";
            expect(() => loadConfig()).toThrow();
        });
        it("throws when supabaseKey is empty string (no service role or anon key)", () => {
            delete process.env.SUPABASE_SERVICE_ROLE_KEY;
            delete process.env.SUPABASE_ANON_KEY;
            expect(() => loadConfig()).toThrow();
        });
        it("throws when embeddingProvider is an invalid value", () => {
            expect(() => loadConfig({ embeddingProvider: "unsupported" })).toThrow();
        });
        it("throws when anthropicApiKey override is empty string", () => {
            expect(() => loadConfig({ anthropicApiKey: "" })).toThrow();
        });
    });
});
//# sourceMappingURL=index.test.js.map