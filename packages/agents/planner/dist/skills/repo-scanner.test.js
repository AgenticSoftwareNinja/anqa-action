import { describe, it, expect, vi, beforeEach } from "vitest";
// ---------------------------------------------------------------------------
// Mocks — must be hoisted before any import that uses node:fs/promises
// ---------------------------------------------------------------------------
vi.mock("node:fs/promises", () => ({
    readFile: vi.fn(),
    readdir: vi.fn(),
    access: vi.fn(),
}));
import * as fs from "node:fs/promises";
import { scanRepository } from "./repo-scanner.js";
// Typed mock helpers
const mockReadFile = vi.mocked(fs.readFile);
const mockReaddir = vi.mocked(fs.readdir);
const mockAccess = vi.mocked(fs.access);
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDirent(name, isFile = true) {
    return {
        name,
        isFile: () => isFile,
        isDirectory: () => !isFile,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isFIFO: () => false,
        isSocket: () => false,
        isSymbolicLink: () => false,
        path: "",
        parentPath: "",
    };
}
function makePackageJson(overrides = {}) {
    return JSON.stringify({
        name: "my-app",
        version: "1.0.0",
        dependencies: {
            next: "^14.0.0",
            react: "^18.0.0",
        },
        devDependencies: {
            typescript: "^5.0.0",
            "@playwright/test": "^1.40.0",
            vitest: "^1.0.0",
        },
        ...overrides,
    });
}
// ---------------------------------------------------------------------------
// Reset mocks between tests
// ---------------------------------------------------------------------------
beforeEach(() => {
    vi.resetAllMocks();
    // Default: access rejects (nothing exists)
    mockAccess.mockRejectedValue(new Error("ENOENT"));
    // Default: readdir returns empty
    mockReaddir.mockResolvedValue([]);
    // Default: readFile rejects
    mockReadFile.mockRejectedValue(new Error("ENOENT"));
});
// ---------------------------------------------------------------------------
// Framework detection
// ---------------------------------------------------------------------------
describe("detectFramework via scanRepository", () => {
    it("detects next framework and typescript language with playwright present", async () => {
        mockReadFile.mockImplementation(async (path) => {
            if (String(path).endsWith("package.json"))
                return makePackageJson();
            throw new Error("ENOENT");
        });
        const result = await scanRepository("/repo");
        expect(result.framework.name).toBe("next");
        expect(result.framework.language).toBe("typescript");
        expect(result.framework.hasPlaywright).toBe(true);
        expect(result.framework.hasCypress).toBe(false);
    });
    it("detects test framework (vitest takes priority over playwright when both present)", async () => {
        // makePackageJson includes both vitest and @playwright/test; vitest wins (earlier in candidate list)
        mockReadFile.mockImplementation(async (path) => {
            if (String(path).endsWith("package.json"))
                return makePackageJson();
            throw new Error("ENOENT");
        });
        const result = await scanRepository("/repo");
        expect(result.framework.testFramework).toBe("vitest");
        // playwright is still detected via the hasPlaywright flag
        expect(result.framework.hasPlaywright).toBe(true);
    });
    it("detects react framework when next is absent", async () => {
        mockReadFile.mockImplementation(async (path) => {
            if (String(path).endsWith("package.json")) {
                return JSON.stringify({
                    dependencies: { react: "^18.0.0" },
                    devDependencies: { typescript: "^5.0.0" },
                });
            }
            throw new Error("ENOENT");
        });
        const result = await scanRepository("/repo");
        expect(result.framework.name).toBe("react");
        expect(result.framework.hasPlaywright).toBe(false);
        expect(result.framework.hasCypress).toBe(false);
    });
    it("detects cypress when present in devDependencies", async () => {
        mockReadFile.mockImplementation(async (path) => {
            if (String(path).endsWith("package.json")) {
                return JSON.stringify({
                    devDependencies: { cypress: "^13.0.0" },
                });
            }
            throw new Error("ENOENT");
        });
        const result = await scanRepository("/repo");
        expect(result.framework.hasCypress).toBe(true);
        expect(result.framework.testFramework).toBe("cypress");
    });
    it("returns unknown framework and javascript when no package.json", async () => {
        // readFile stays rejected (ENOENT)
        const result = await scanRepository("/repo");
        expect(result.framework.name).toBe("unknown");
        expect(result.framework.language).toBe("unknown");
    });
    it("returns javascript language when typescript dep is absent", async () => {
        mockReadFile.mockImplementation(async (path) => {
            if (String(path).endsWith("package.json")) {
                return JSON.stringify({ dependencies: { express: "^4.0.0" } });
            }
            throw new Error("ENOENT");
        });
        const result = await scanRepository("/repo");
        expect(result.framework.language).toBe("javascript");
        expect(result.framework.name).toBe("express");
    });
});
// ---------------------------------------------------------------------------
// CI config detection
// ---------------------------------------------------------------------------
describe("detectCIConfig via scanRepository", () => {
    it("detects .github/workflows with yml files", async () => {
        mockAccess.mockImplementation(async (path) => {
            if (String(path).includes(".github/workflows"))
                return undefined;
            throw new Error("ENOENT");
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockReaddir.mockImplementation(async (path) => {
            if (String(path).includes(".github/workflows")) {
                return [makeDirent("ci.yml"), makeDirent("release.yml")];
            }
            return [];
        });
        mockReadFile.mockImplementation(async (path) => {
            const p = String(path);
            if (p.endsWith("package.json"))
                throw new Error("ENOENT");
            if (p.endsWith("ci.yml"))
                return "name: CI\njobs:\n  test:\n    run: pnpm test";
            if (p.endsWith("release.yml"))
                return "name: Release\njobs:\n  deploy:\n    run: pnpm deploy";
            throw new Error("ENOENT");
        });
        const result = await scanRepository("/repo");
        expect(result.ciConfig.hasGitHubActions).toBe(true);
        expect(result.ciConfig.workflowFiles).toEqual(["ci.yml", "release.yml"]);
        expect(result.ciConfig.hasTestStep).toBe(true);
        expect(result.ciConfig.hasDeployStep).toBe(true);
    });
    it("reports no GitHub Actions when .github/workflows does not exist", async () => {
        // mockAccess rejects by default
        const result = await scanRepository("/repo");
        expect(result.ciConfig.hasGitHubActions).toBe(false);
        expect(result.ciConfig.workflowFiles).toEqual([]);
        expect(result.ciConfig.hasTestStep).toBe(false);
        expect(result.ciConfig.hasDeployStep).toBe(false);
    });
    it("skips non-yml/yaml files in workflows directory", async () => {
        mockAccess.mockImplementation(async (path) => {
            if (String(path).includes(".github/workflows"))
                return undefined;
            throw new Error("ENOENT");
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockReaddir.mockImplementation(async (path) => {
            if (String(path).includes(".github/workflows")) {
                return [makeDirent("ci.yml"), makeDirent("README.md"), makeDirent("schema.json")];
            }
            return [];
        });
        mockReadFile.mockImplementation(async (path) => {
            if (String(path).endsWith("ci.yml"))
                return "run: test";
            throw new Error("ENOENT");
        });
        const result = await scanRepository("/repo");
        expect(result.ciConfig.workflowFiles).toEqual(["ci.yml"]);
    });
});
// ---------------------------------------------------------------------------
// Test file discovery
// ---------------------------------------------------------------------------
describe("discoverTests via scanRepository", () => {
    it("finds spec.ts files and extracts describe/it descriptions", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockReaddir.mockImplementation(async (path) => {
            const p = String(path);
            if (p === "/repo" || p === "/repo/")
                return [makeDirent("tests", false)];
            if (p.endsWith("/tests"))
                return [makeDirent("login.spec.ts")];
            return [];
        });
        mockReadFile.mockImplementation(async (path) => {
            const p = String(path);
            if (p.endsWith("package.json"))
                throw new Error("ENOENT");
            if (p.endsWith("login.spec.ts")) {
                return `
import { test, expect } from '@playwright/test';
describe('Login flow', () => {
  it('should login with valid credentials', async () => {});
  it('should show error for invalid password', async () => {});
});
test('redirects after login', async () => {});
        `;
            }
            throw new Error("ENOENT");
        });
        const result = await scanRepository("/repo");
        expect(result.existingTests).toHaveLength(1);
        const testFile = result.existingTests[0];
        expect(testFile.path).toContain("login.spec.ts");
        expect(testFile.framework).toBe("playwright");
        expect(testFile.descriptions).toContain("Login flow");
        expect(testFile.descriptions).toContain("should login with valid credentials");
        expect(testFile.descriptions).toContain("should show error for invalid password");
        expect(testFile.descriptions).toContain("redirects after login");
    });
    it("skips node_modules directories during walk", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockReaddir.mockImplementation(async (path) => {
            const p = String(path);
            if (p === "/repo" || p === "/repo/") {
                return [makeDirent("node_modules", false), makeDirent("src", false)];
            }
            if (p.endsWith("/src"))
                return [makeDirent("app.test.ts")];
            // node_modules — should never be called
            return [];
        });
        mockReadFile.mockImplementation(async (path) => {
            if (String(path).endsWith("app.test.ts")) {
                return `describe('App', () => { it('works', () => {}); });`;
            }
            throw new Error("ENOENT");
        });
        const result = await scanRepository("/repo");
        // Should find src/app.test.ts but NOT node_modules contents
        expect(result.existingTests).toHaveLength(1);
        expect(result.existingTests[0].path).toContain("app.test.ts");
        expect(result.existingTests[0].path).not.toContain("node_modules");
    });
    it("classifies files in /e2e/ directory as e2e type", async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mockReaddir.mockImplementation(async (path) => {
            const p = String(path);
            if (p === "/repo" || p === "/repo/")
                return [makeDirent("e2e", false)];
            if (p.endsWith("/e2e"))
                return [makeDirent("checkout.spec.ts")];
            return [];
        });
        mockReadFile.mockImplementation(async (path) => {
            if (String(path).endsWith("checkout.spec.ts")) {
                return `test('checkout flow', async () => {});`;
            }
            throw new Error("ENOENT");
        });
        const result = await scanRepository("/repo");
        expect(result.existingTests[0].type).toBe("e2e");
    });
    it("returns empty array when no test files found", async () => {
        // mockReaddir returns [] by default
        const result = await scanRepository("/repo");
        expect(result.existingTests).toEqual([]);
    });
});
// ---------------------------------------------------------------------------
// AI setup detection
// ---------------------------------------------------------------------------
describe("detectAISetup via scanRepository", () => {
    it("detects claude setup when .claude directory exists", async () => {
        mockAccess.mockImplementation(async (path) => {
            if (String(path).endsWith("/.claude"))
                return undefined;
            throw new Error("ENOENT");
        });
        const result = await scanRepository("/repo");
        expect(result.aiSetup.hasClaude).toBe(true);
        expect(result.aiSetup.hasCopilot).toBe(false);
        expect(result.aiSetup.hasCursor).toBe(false);
        expect(result.aiSetup.configFiles).toContain("/repo/.claude");
    });
    it("detects copilot when .github/copilot-instructions.md exists", async () => {
        mockAccess.mockImplementation(async (path) => {
            if (String(path).includes("copilot-instructions.md"))
                return undefined;
            throw new Error("ENOENT");
        });
        const result = await scanRepository("/repo");
        expect(result.aiSetup.hasCopilot).toBe(true);
        expect(result.aiSetup.hasClaude).toBe(false);
    });
    it("detects cursor when .cursorrules exists", async () => {
        mockAccess.mockImplementation(async (path) => {
            if (String(path).endsWith(".cursorrules"))
                return undefined;
            throw new Error("ENOENT");
        });
        const result = await scanRepository("/repo");
        expect(result.aiSetup.hasCursor).toBe(true);
    });
    it("reports no AI setup when no config files exist", async () => {
        // mockAccess rejects by default
        const result = await scanRepository("/repo");
        expect(result.aiSetup.hasClaude).toBe(false);
        expect(result.aiSetup.hasCopilot).toBe(false);
        expect(result.aiSetup.hasCursor).toBe(false);
        expect(result.aiSetup.configFiles).toEqual([]);
    });
});
// ---------------------------------------------------------------------------
// RepoAnalysis shape
// ---------------------------------------------------------------------------
describe("scanRepository return shape", () => {
    it("includes analyzedAt as a valid ISO date string", async () => {
        const before = Date.now();
        const result = await scanRepository("/repo");
        const after = Date.now();
        const ts = new Date(result.analyzedAt).getTime();
        expect(ts).toBeGreaterThanOrEqual(before);
        expect(ts).toBeLessThanOrEqual(after);
    });
    it("runs all four detections in parallel and returns complete RepoAnalysis", async () => {
        mockReadFile.mockImplementation(async (path) => {
            if (String(path).endsWith("package.json"))
                return makePackageJson();
            throw new Error("ENOENT");
        });
        const result = await scanRepository("/repo");
        expect(result).toHaveProperty("framework");
        expect(result).toHaveProperty("existingTests");
        expect(result).toHaveProperty("ciConfig");
        expect(result).toHaveProperty("aiSetup");
        expect(result).toHaveProperty("analyzedAt");
    });
});
//# sourceMappingURL=repo-scanner.test.js.map