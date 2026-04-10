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
      return {
        passed: false,
        results: [
          {
            testFile: testFilePath,
            status: "failed",
            duration: 0,
            error: { message: toErrorMessage(error) },
            retries: 0,
          },
        ],
        rawOutput: toErrorMessage(error),
      };
    }
  },
};
