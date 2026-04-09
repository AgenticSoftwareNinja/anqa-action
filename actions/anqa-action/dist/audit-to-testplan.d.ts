interface AuditGap {
    flowId: string;
    flowName: string;
    priority: "critical" | "high" | "medium" | "low";
    reason: string;
}
interface ProposedTest {
    flowId: string;
    flowName: string;
    priority: "critical" | "high" | "medium" | "low";
    description: string;
    estimatedComplexity: "simple" | "moderate" | "complex";
}
interface TestFlow {
    id: string;
    name: string;
    description: string;
    priority: "critical" | "high" | "medium" | "low";
    steps: Array<{
        action: string;
        target?: string;
        description: string;
    }>;
    assertions: Array<{
        type: string;
        target: string;
        expected: string;
        description: string;
    }>;
}
interface TestPlan {
    id: string;
    targetApp: string;
    createdAt: string;
    flows: TestFlow[];
}
export declare function selectFlows(gaps: AuditGap[], maxFlows: number): AuditGap[];
export declare function auditToTestPlan(selectedGaps: AuditGap[], proposedTests: ProposedTest[], targetApp: string): TestPlan;
export {};
//# sourceMappingURL=audit-to-testplan.d.ts.map