import { describe, it, expect } from "vitest";
import { toErrorMessage, createEmptyMetrics, formatRAGContext, deriveAppName, parsePlaywrightReport, } from "./index.js";
// ---------------------------------------------------------------------------
// toErrorMessage
// ---------------------------------------------------------------------------
describe("toErrorMessage", () => {
    it("returns the message from an Error instance", () => {
        const err = new Error("something went wrong");
        expect(toErrorMessage(err)).toBe("something went wrong");
    });
    it("returns the message from a subclass of Error", () => {
        const err = new TypeError("type mismatch");
        expect(toErrorMessage(err)).toBe("type mismatch");
    });
    it("converts a plain string to itself", () => {
        expect(toErrorMessage("oops")).toBe("oops");
    });
    it("converts a number to its string representation", () => {
        expect(toErrorMessage(42)).toBe("42");
    });
    it("converts null to the string 'null'", () => {
        expect(toErrorMessage(null)).toBe("null");
    });
    it("converts undefined to the string 'undefined'", () => {
        expect(toErrorMessage(undefined)).toBe("undefined");
    });
    it("converts a plain object via String()", () => {
        expect(toErrorMessage({ code: 404 })).toBe("[object Object]");
    });
    it("handles an Error with an empty message", () => {
        expect(toErrorMessage(new Error(""))).toBe("");
    });
});
// ---------------------------------------------------------------------------
// createEmptyMetrics
// ---------------------------------------------------------------------------
describe("createEmptyMetrics", () => {
    it("returns zero-value metrics when called with no arguments", () => {
        const metrics = createEmptyMetrics();
        expect(metrics).toEqual({
            passRate: 0,
            selectorResilience: 0,
            coverageDelta: 0,
            flakinessScore: 0,
            healingSuccessRate: 0,
            generationTimeMs: 0,
        });
    });
    it("applies partial overrides while keeping other fields at zero", () => {
        const metrics = createEmptyMetrics({ passRate: 0.95, generationTimeMs: 1500 });
        expect(metrics.passRate).toBe(0.95);
        expect(metrics.generationTimeMs).toBe(1500);
        expect(metrics.selectorResilience).toBe(0);
        expect(metrics.coverageDelta).toBe(0);
        expect(metrics.flakinessScore).toBe(0);
        expect(metrics.healingSuccessRate).toBe(0);
    });
    it("applies all overrides at once", () => {
        const overrides = {
            passRate: 1,
            selectorResilience: 0.8,
            coverageDelta: 0.1,
            flakinessScore: 0.05,
            healingSuccessRate: 0.9,
            generationTimeMs: 3000,
        };
        expect(createEmptyMetrics(overrides)).toEqual(overrides);
    });
    it("returns a new object each call (no shared reference)", () => {
        const a = createEmptyMetrics();
        const b = createEmptyMetrics();
        expect(a).not.toBe(b);
    });
    it("override value of zero is preserved (not treated as falsy)", () => {
        const metrics = createEmptyMetrics({ passRate: 0 });
        expect(metrics.passRate).toBe(0);
    });
});
// ---------------------------------------------------------------------------
// formatRAGContext
// ---------------------------------------------------------------------------
describe("formatRAGContext", () => {
    const makeResult = (content) => ({
        id: "1",
        content,
        type: "pattern",
        similarity: 0.9,
        metadata: {},
    });
    it("returns empty string when the results array is empty", () => {
        expect(formatRAGContext([], "Patterns")).toBe("");
    });
    it("formats a single result correctly", () => {
        const result = formatRAGContext([makeResult("use data-testid selectors")], "Patterns");
        expect(result).toBe("\n\nPatterns:\nuse data-testid selectors");
    });
    it("separates multiple results with ---", () => {
        const results = [makeResult("first"), makeResult("second"), makeResult("third")];
        const output = formatRAGContext(results, "Context");
        expect(output).toBe("\n\nContext:\nfirst\n---\nsecond\n---\nthird");
    });
    it("uses the provided header in the output", () => {
        const output = formatRAGContext([makeResult("data")], "My Custom Header");
        expect(output).toContain("My Custom Header:");
    });
    it("starts with two newlines", () => {
        const output = formatRAGContext([makeResult("x")], "H");
        expect(output.startsWith("\n\n")).toBe(true);
    });
});
// ---------------------------------------------------------------------------
// deriveAppName
// ---------------------------------------------------------------------------
describe("deriveAppName", () => {
    it("replaces dots with hyphens for a simple hostname", () => {
        expect(deriveAppName("https://example.com")).toBe("example-com");
    });
    it("handles a multi-part subdomain", () => {
        expect(deriveAppName("https://app.my-company.io/path?q=1")).toBe("app-my-company-io");
    });
    it("handles localhost (no dots)", () => {
        expect(deriveAppName("http://localhost:3000")).toBe("localhost");
    });
    it("handles an IP address", () => {
        expect(deriveAppName("http://192.168.1.1:8080")).toBe("192-168-1-1");
    });
    it("ignores path, query, and hash — uses hostname only", () => {
        expect(deriveAppName("https://staging.acme.dev/app/dashboard?debug=true#top")).toBe("staging-acme-dev");
    });
    it("handles a URL with no path", () => {
        expect(deriveAppName("https://foo.bar.baz")).toBe("foo-bar-baz");
    });
});
// ---------------------------------------------------------------------------
// parsePlaywrightReport
// ---------------------------------------------------------------------------
describe("parsePlaywrightReport", () => {
    // Minimal valid Playwright JSON report shape
    const makeReport = (suites) => ({ suites });
    const makeSuite = (file, specs) => ({ file, specs });
    const makeSpec = (tests) => ({ tests });
    const makeTest = (status, results) => ({ status, results });
    // ── object input ──────────────────────────────────────────────────────────
    it("returns empty array for an object with no suites key", () => {
        expect(parsePlaywrightReport({})).toEqual([]);
    });
    it("returns empty array for an object with an empty suites array", () => {
        expect(parsePlaywrightReport(makeReport([]))).toEqual([]);
    });
    it("parses a single passing test", () => {
        const report = makeReport([
            makeSuite("tests/login.spec.ts", [
                makeSpec([makeTest("expected", [{ duration: 120, status: "passed" }])]),
            ]),
        ]);
        const results = parsePlaywrightReport(report);
        expect(results).toHaveLength(1);
        expect(results[0]).toEqual({
            testFile: "tests/login.spec.ts",
            status: "passed",
            duration: 120,
            error: undefined,
            retries: 0,
        });
    });
    it("maps 'unexpected' status to 'failed'", () => {
        const report = makeReport([
            makeSuite("tests/broken.spec.ts", [
                makeSpec([
                    makeTest("unexpected", [
                        {
                            duration: 50,
                            status: "failed",
                            error: { message: "Element not found", stack: "Error: Element not found\n  at ..." },
                        },
                    ]),
                ]),
            ]),
        ]);
        const [result] = parsePlaywrightReport(report);
        expect(result.status).toBe("failed");
        expect(result.error).toEqual({
            message: "Element not found",
            stack: "Error: Element not found\n  at ...",
        });
    });
    it("maps 'expected' status to 'passed'", () => {
        const report = makeReport([
            makeSuite("a.spec.ts", [makeSpec([makeTest("expected", [{ duration: 10 }])])]),
        ]);
        expect(parsePlaywrightReport(report)[0].status).toBe("passed");
    });
    it("maps 'skipped' status to 'skipped'", () => {
        const report = makeReport([
            makeSuite("a.spec.ts", [makeSpec([makeTest("skipped", [{ duration: 0 }])])]),
        ]);
        expect(parsePlaywrightReport(report)[0].status).toBe("skipped");
    });
    it("maps 'flaky' status to 'flaky'", () => {
        const report = makeReport([
            makeSuite("a.spec.ts", [makeSpec([makeTest("flaky", [{ duration: 300 }])])]),
        ]);
        expect(parsePlaywrightReport(report)[0].status).toBe("flaky");
    });
    it("maps an unknown status to 'failed'", () => {
        const report = makeReport([
            makeSuite("a.spec.ts", [makeSpec([makeTest("weird-status", [{ duration: 5 }])])]),
        ]);
        expect(parsePlaywrightReport(report)[0].status).toBe("failed");
    });
    it("counts retries correctly", () => {
        const report = makeReport([
            makeSuite("a.spec.ts", [
                makeSpec([
                    makeTest("expected", [
                        { duration: 100, status: "failed" },
                        { duration: 200, status: "failed" },
                        { duration: 150, status: "passed" },
                    ]),
                ]),
            ]),
        ]);
        const [result] = parsePlaywrightReport(report);
        expect(result.retries).toBe(2); // 3 results - 1
        expect(result.duration).toBe(150); // last result duration
    });
    it("handles a test with empty results array", () => {
        const report = makeReport([
            makeSuite("a.spec.ts", [
                makeSpec([{ status: "skipped", results: [] }]),
            ]),
        ]);
        const [result] = parsePlaywrightReport(report);
        expect(result.status).toBe("skipped");
        expect(result.duration).toBe(0);
        expect(result.retries).toBe(-1); // length(0) - 1
        expect(result.error).toBeUndefined();
    });
    it("sets testFile to empty string when suite has no file property", () => {
        const report = { suites: [{ specs: [makeSpec([makeTest("expected", [{ duration: 1 }])])] }] };
        const [result] = parsePlaywrightReport(report);
        expect(result.testFile).toBe("");
    });
    it("flattens tests across multiple suites", () => {
        const report = makeReport([
            makeSuite("a.spec.ts", [makeSpec([makeTest("expected", [{ duration: 10 }])])]),
            makeSuite("b.spec.ts", [makeSpec([makeTest("unexpected", [{ duration: 20, status: "failed" }])])]),
        ]);
        const results = parsePlaywrightReport(report);
        expect(results).toHaveLength(2);
        expect(results[0].testFile).toBe("a.spec.ts");
        expect(results[1].testFile).toBe("b.spec.ts");
    });
    it("flattens tests across multiple specs in the same suite", () => {
        const report = makeReport([
            makeSuite("a.spec.ts", [
                makeSpec([makeTest("expected", [{ duration: 10 }])]),
                makeSpec([makeTest("skipped", [{ duration: 0 }])]),
            ]),
        ]);
        expect(parsePlaywrightReport(report)).toHaveLength(2);
    });
    // ── string input ──────────────────────────────────────────────────────────
    it("parses a valid JSON string", () => {
        const report = makeReport([
            makeSuite("tests/foo.spec.ts", [
                makeSpec([makeTest("expected", [{ duration: 75 }])]),
            ]),
        ]);
        const results = parsePlaywrightReport(JSON.stringify(report));
        expect(results).toHaveLength(1);
        expect(results[0].testFile).toBe("tests/foo.spec.ts");
        expect(results[0].status).toBe("passed");
    });
    it("strips leading text before the opening brace in a string", () => {
        const report = makeReport([
            makeSuite("tests/bar.spec.ts", [makeSpec([makeTest("expected", [{ duration: 10 }])])]),
        ]);
        const input = `stdout output prefix\n${JSON.stringify(report)}`;
        const results = parsePlaywrightReport(input);
        expect(results).toHaveLength(1);
        expect(results[0].testFile).toBe("tests/bar.spec.ts");
    });
    it("returns empty array for a string with no opening brace", () => {
        expect(parsePlaywrightReport("no json here")).toEqual([]);
    });
    it("returns empty array for a string with malformed JSON", () => {
        expect(parsePlaywrightReport("{ bad json ]")).toEqual([]);
    });
    it("returns empty array for an empty string", () => {
        expect(parsePlaywrightReport("")).toEqual([]);
    });
    it("returns empty array for a JSON string representing an empty object", () => {
        expect(parsePlaywrightReport("{}")).toEqual([]);
    });
});
//# sourceMappingURL=index.test.js.map