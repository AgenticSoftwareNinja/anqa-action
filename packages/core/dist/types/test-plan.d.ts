export interface TestPlan {
    id: string;
    targetApp: string;
    createdAt: string;
    flows: TestFlow[];
}
export interface TestFlow {
    id: string;
    name: string;
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    steps: TestStep[];
    assertions: TestAssertion[];
}
export interface TestStep {
    action: "navigate" | "click" | "fill" | "select" | "wait" | "assert";
    target?: string;
    value?: string;
    description: string;
}
export interface TestAssertion {
    type: "visible" | "text" | "url" | "attribute" | "count";
    target: string;
    expected: string;
    description: string;
}
export interface TestResult {
    testFile: string;
    status: "passed" | "failed" | "skipped" | "flaky";
    duration: number;
    error?: TestError;
    retries: number;
}
export interface TestError {
    message: string;
    stack?: string;
    screenshot?: string;
    trace?: string;
}
export interface HealingReport {
    testFile: string;
    originalError: TestError;
    diagnosis: "selector-broken" | "timing-issue" | "assertion-stale" | "app-bug" | "unknown";
    fix?: HealingFix;
}
export interface HealingFix {
    type: "selector" | "wait" | "assertion" | "flow";
    before: string;
    after: string;
    confidence: number;
}
//# sourceMappingURL=test-plan.d.ts.map