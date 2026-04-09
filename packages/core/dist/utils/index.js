export function toErrorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
export function createEmptyMetrics(overrides) {
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
export function formatRAGContext(results, header) {
    if (results.length === 0)
        return "";
    return `\n\n${header}:\n${results.map((r) => r.content).join("\n---\n")}`;
}
export function deriveAppName(url) {
    return new URL(url).hostname.replace(/\./g, "-");
}
/**
 * Parse Playwright JSON reporter output into TestResult[].
 * Handles both raw JSON objects and JSON embedded in stdout strings.
 */
export function parsePlaywrightReport(input) {
    let json;
    if (typeof input === "string") {
        const jsonStart = input.indexOf("{");
        if (jsonStart === -1)
            return [];
        try {
            json = JSON.parse(input.slice(jsonStart));
        }
        catch {
            return [];
        }
    }
    else {
        json = input;
    }
    const suites = (json.suites ?? []);
    const results = [];
    for (const suite of suites) {
        const specs = (suite.specs ?? []);
        for (const spec of specs) {
            const tests = (spec.tests ?? []);
            for (const test of tests) {
                const testResults = (test.results ?? []);
                const lastResult = testResults[testResults.length - 1];
                const status = test.status ?? lastResult?.status ?? "unknown";
                const error = lastResult?.error;
                results.push({
                    testFile: suite.file ?? "",
                    status: mapPlaywrightStatus(status),
                    duration: lastResult?.duration ?? 0,
                    error: error
                        ? { message: error.message, stack: error.stack }
                        : undefined,
                    retries: testResults.length - 1,
                });
            }
        }
    }
    return results;
}
function mapPlaywrightStatus(status) {
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
//# sourceMappingURL=index.js.map