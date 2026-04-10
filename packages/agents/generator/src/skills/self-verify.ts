import { execFile } from "node:child_process";
import { writeFile, symlink, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { promisify } from "node:util";
import {
  parsePlaywrightReport,
  toErrorMessage,
  type AgentContext,
  type Skill,
  type TestResult,
} from "@agentic-nqa/core";

const exec = promisify(execFile);

// Plain JS config template — no imports needed
function buildConfig(baseUrl?: string): string {
  return `module.exports = {
  timeout: 30000,
  use: {
    headless: true,${baseUrl ? `\n    baseURL: "${baseUrl}",` : ""}
  },
};
`;
}

export interface VerificationResult {
  passed: boolean;
  results: TestResult[];
  rawOutput: string;
}

export const selfVerifySkill: Skill = {
  name: "self-verify",
  description: "Run a generated test file and parse results",

  async execute(ctx: AgentContext, input: unknown): Promise<VerificationResult> {
    const { testFilePath, baseUrl } = input as { testFilePath: string; baseUrl?: string };

    const testDir = dirname(testFilePath);

    // Write a minimal JS config next to the test to avoid picking up the user's config
    const configPath = join(testDir, "playwright.config.js");
    await writeFile(configPath, buildConfig(baseUrl), "utf-8");

    // Symlink node_modules so tests can resolve @playwright/test
    const nodeModulesLink = join(testDir, "node_modules");
    try {
      await access(nodeModulesLink);
    } catch {
      await symlink("/app/node_modules", nodeModulesLink, "dir").catch(() => {});
    }

    try {
      const { stdout, stderr } = await exec(
        "npx",
        [
          "playwright",
          "test",
          testFilePath,
          "--config",
          configPath,
          "--reporter=json",
          "--retries=0",
        ],
        { timeout: 60_000 },
      );

      const output = stdout || stderr;
      const results = parsePlaywrightReport(output);
      // Empty results means unparseable output — treat as failure
      const passed =
        results.length > 0 && results.every((r) => r.status === "passed");

      ctx.metrics.record("test_run", 1, {
        result: passed ? "pass" : "fail",
        file: testFilePath,
      });

      return { passed, results, rawOutput: output };
    } catch (error) {
      // execFile errors include stdout/stderr on the error object
      const execErr = error as { stdout?: string; stderr?: string; message?: string };
      const stdout = execErr.stdout || "";
      const stderr = execErr.stderr || "";

      // Try to parse JSON report from stdout (Playwright writes JSON to stdout)
      const results = parsePlaywrightReport(stdout);
      if (results.length > 0) {
        const passed = results.every((r) => r.status === "passed");
        ctx.metrics.record("test_run", 1, { result: passed ? "pass" : "fail", file: testFilePath });
        return { passed, results, rawOutput: stdout };
      }

      // No test results parsed — tests failed to load.
      // The real error is in stderr (import failures, syntax errors, etc.)
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
