import type { QualityMetrics } from "../types/agent.js";
import type { RAGResult } from "../types/rag.js";
import type { TestResult } from "../types/test-plan.js";

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createEmptyMetrics(
  overrides?: Partial<QualityMetrics>,
): QualityMetrics {
  return {
    passRate: 0,
    selectorResilience: 0,
    coverageDelta: 0,
    flakinessScore: 0,
    healingSuccessRate: 0,
    generationTimeMs: 0,
    ...overrides,
  };
}

export function formatRAGContext(
  results: RAGResult[],
  header: string,
): string {
  if (results.length === 0) return "";
  return `\n\n${header}:\n${results.map((r) => r.content).join("\n---\n")}`;
}

export function deriveAppName(url: string): string {
  return new URL(url).hostname.replace(/\./g, "-");
}

/**
 * Parse Playwright JSON reporter output into TestResult[].
 * Handles both raw JSON objects and JSON embedded in stdout strings.
 */
export function parsePlaywrightReport(
  input: string | Record<string, unknown>,
): TestResult[] {
  let json: Record<string, unknown>;

  if (typeof input === "string") {
    const jsonStart = input.indexOf("{");
    if (jsonStart === -1) return [];
    try {
      json = JSON.parse(input.slice(jsonStart));
    } catch {
      return [];
    }
  } else {
    json = input;
  }

  const results: TestResult[] = [];

  // Recursively walk suites (Playwright nests suites for test.describe blocks)
  function walkSuites(suites: Array<Record<string, unknown>>, file?: string) {
    for (const suite of suites) {
      const suiteFile = (suite.file as string) || file || "";
      // Process specs at this level
      const specs = (suite.specs ?? []) as Array<Record<string, unknown>>;
      for (const spec of specs) {
        const tests = (spec.tests ?? []) as Array<Record<string, unknown>>;
        for (const test of tests) {
          const testResults = (test.results ?? []) as Array<
            Record<string, unknown>
          >;
          const lastResult = testResults[testResults.length - 1];
          const status = (test.status as string) ?? (lastResult?.status as string) ?? "unknown";
          // Playwright may store errors as singular or array
          const error = (lastResult?.error ?? (lastResult?.errors as unknown[])?.[0]) as
            | { message: string; stack?: string }
            | undefined;

          results.push({
            testFile: suiteFile,
            status: mapPlaywrightStatus(status),
            duration: (lastResult?.duration as number) ?? 0,
            error: error
              ? { message: error.message, stack: error.stack }
              : undefined,
            retries: testResults.length - 1,
          });
        }
      }
      // Recurse into nested suites (test.describe blocks)
      const nestedSuites = (suite.suites ?? []) as Array<Record<string, unknown>>;
      if (nestedSuites.length > 0) {
        walkSuites(nestedSuites, suiteFile);
      }
    }
  }

  const topSuites = (json.suites ?? []) as Array<Record<string, unknown>>;
  walkSuites(topSuites);

  return results;
}

function mapPlaywrightStatus(
  status: string,
): "passed" | "failed" | "skipped" | "flaky" {
  switch (status) {
    case "expected":
    case "passed":
      return "passed";
    case "unexpected":
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    case "flaky":
      return "flaky";
    default:
      return "failed";
  }
}
