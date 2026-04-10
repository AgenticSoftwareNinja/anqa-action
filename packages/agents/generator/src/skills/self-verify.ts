import { execFile, execSync } from "node:child_process";
import { writeFile, symlink, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import {
  parsePlaywrightReport,
  toErrorMessage,
  type AgentContext,
  type Skill,
  type TestResult,
} from "@agentic-nqa/core";

const exec = promisify(execFile);

// Try multiple locations for the playwright binary
function findPlaywrightBin(): string {
  const candidates = [
    "/github/workspace/node_modules/.bin/playwright",  // workspace install (npm ci in workflow)
    "/playwright/node_modules/.bin/playwright",         // flat Docker install
    "/app/actions/anqa-action/node_modules/.bin/playwright", // pnpm install
    "/app/node_modules/.bin/playwright",                // root node_modules
  ];
  for (const bin of candidates) {
    if (existsSync(bin)) {
      console.log(`[self-verify] Found playwright at: ${bin}`);
      return bin;
    }
  }
  // Last resort: npx (downloads its own copy)
  console.log("[self-verify] WARNING: No local playwright found, falling back to npx");
  return "npx";
}

// Find the node_modules that contains @playwright/test
function findPlaywrightModules(): string | null {
  const candidates = [
    "/github/workspace/node_modules",
    "/playwright/node_modules",
    "/app/actions/anqa-action/node_modules",
    "/app/node_modules",
  ];
  for (const dir of candidates) {
    const testPkg = join(dir, "@playwright/test/package.json");
    if (existsSync(testPkg)) {
      console.log(`[self-verify] Found @playwright/test in: ${dir}`);
      return dir;
    }
  }
  console.log("[self-verify] WARNING: @playwright/test not found in any known location");
  return null;
}

// Plain JS config — no baseURL since tests use full URLs for hash-routing compatibility
function buildConfig(): string {
  return `module.exports = {
  timeout: 30000,
  use: { headless: true },
};
`;
}

export interface VerificationResult {
  passed: boolean;
  results: TestResult[];
  rawOutput: string;
}

let _playwrightBin: string | undefined;
let _playwrightModules: string | null | undefined;

export const selfVerifySkill: Skill = {
  name: "self-verify",
  description: "Run a generated test file and parse results",

  async execute(ctx: AgentContext, input: unknown): Promise<VerificationResult> {
    const { testFilePath, baseUrl } = input as { testFilePath: string; baseUrl?: string };

    // Find playwright binary and modules (cached after first call)
    if (_playwrightBin === undefined) {
      _playwrightBin = findPlaywrightBin();
      _playwrightModules = findPlaywrightModules();
    }

    const testDir = dirname(testFilePath);

    // Write a minimal JS config next to the test
    const configPath = join(testDir, "playwright.config.js");
    await writeFile(configPath, buildConfig(), "utf-8");

    // Symlink node_modules so test files can resolve @playwright/test
    if (_playwrightModules) {
      const nodeModulesLink = join(testDir, "node_modules");
      try { await access(nodeModulesLink); } catch {
        await symlink(_playwrightModules, nodeModulesLink, "dir").catch(() => {});
      }
    }

    // Build command args
    const isNpx = _playwrightBin === "npx";
    const args = isNpx
      ? ["playwright", "test", testFilePath, "--config", configPath, "--reporter=json", "--retries=0"]
      : ["test", testFilePath, "--config", configPath, "--reporter=json", "--retries=0"];

    try {
      const { stdout, stderr } = await exec(
        _playwrightBin,
        args,
        { timeout: 60_000 },
      );

      const output = stdout || stderr;
      const results = parsePlaywrightReport(output);
      const passed =
        results.length > 0 && results.every((r) => r.status === "passed");

      ctx.metrics.record("test_run", 1, {
        result: passed ? "pass" : "fail",
        file: testFilePath,
      });

      return { passed, results, rawOutput: output };
    } catch (error) {
      const execErr = error as { stdout?: string; stderr?: string; message?: string };
      const stdout = execErr.stdout || "";
      const stderr = execErr.stderr || "";

      // Try to parse JSON report from stdout
      const results = parsePlaywrightReport(stdout);
      if (results.length > 0) {
        const passed = results.every((r) => r.status === "passed");
        ctx.metrics.record("test_run", 1, { result: passed ? "pass" : "fail", file: testFilePath });
        return { passed, results, rawOutput: stdout };
      }

      // No test results — tests failed to load
      const errorMessage = stderr || execErr.message || toErrorMessage(error);
      return {
        passed: false,
        results: [
          {
            testFile: testFilePath,
            status: "failed",
            duration: 0,
            error: { message: errorMessage.slice(0, 1000) },
            retries: 0,
          },
        ],
        rawOutput: errorMessage,
      };
    }
  },
};
