import { execFile } from "node:child_process";
import { writeFile, unlink } from "node:fs/promises";
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

// Plain JS config — no imports needed
const MINIMAL_PW_CONFIG = `module.exports = {
  timeout: 30000,
  use: { headless: true, browserName: "chromium" },
};
`;

export interface VerificationResult {
  passed: boolean;
  results: TestResult[];
  rawOutput: string;
}

export const selfVerifySkill: Skill = {
  name: "self-verify",
  description: "Run a generated test file and parse results",

  async execute(ctx: AgentContext, input: unknown): Promise<VerificationResult> {
    const { testFilePath } = input as { testFilePath: string };

    // Write a minimal JS config next to the test to avoid picking up the user's config
    const configPath = join(dirname(testFilePath), "playwright.config.js");
    await writeFile(configPath, MINIMAL_PW_CONFIG, "utf-8");

    // NODE_PATH lets generated tests resolve @playwright/test from /app/node_modules
    const env = { ...process.env, NODE_PATH: "/app/node_modules" };

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
        { timeout: 60_000, env },
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
      // execFile errors include stdout/stderr — try to parse the JSON report
      const execErr = error as { stdout?: string; stderr?: string; message?: string };
      const rawOutput = execErr.stdout || execErr.stderr || toErrorMessage(error);

      // Playwright exits non-zero on test failure but still produces valid JSON
      const results = parsePlaywrightReport(rawOutput);
      if (results.length > 0) {
        const passed = results.every((r) => r.status === "passed");
        ctx.metrics.record("test_run", 1, { result: passed ? "pass" : "fail", file: testFilePath });
        return { passed, results, rawOutput };
      }

      // Truly broken (config error, crash, etc.)
      return {
        passed: false,
        results: [
          {
            testFile: testFilePath,
            status: "failed",
            duration: 0,
            error: { message: rawOutput.slice(0, 1000) },
            retries: 0,
          },
        ],
        rawOutput,
      };
    }
  },
};
