import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  parsePlaywrightReport,
  toErrorMessage,
  type AgentContext,
  type Skill,
  type TestResult,
} from "@agentic-nqa/core";

const exec = promisify(execFile);

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

    try {
      const { stdout, stderr } = await exec(
        "npx",
        [
          "playwright",
          "test",
          testFilePath,
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
