import { randomUUID } from "node:crypto";
const PRIORITY_ORDER = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
};
export function selectFlows(gaps, maxFlows) {
    const sorted = [...gaps].sort((a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3));
    const selected = [];
    for (const gap of sorted) {
        if (selected.length >= maxFlows)
            break;
        if (gap.priority === "low")
            continue;
        selected.push(gap);
    }
    return selected;
}
export function auditToTestPlan(selectedGaps, proposedTests, targetApp) {
    const proposedMap = new Map(proposedTests.map((p) => [p.flowId, p]));
    const flows = selectedGaps.map((gap) => {
        const proposed = proposedMap.get(gap.flowId);
        const description = proposed?.description ?? `Test the ${gap.flowName} flow`;
        return {
            id: gap.flowId,
            name: gap.flowName,
            description,
            priority: gap.priority,
            steps: [
                {
                    action: "navigate",
                    target: "/",
                    description: `Navigate to the application for ${gap.flowName}`,
                },
                {
                    action: "assert",
                    target: "page",
                    description: `Verify the ${gap.flowName} flow completes successfully`,
                },
            ],
            assertions: [
                {
                    type: "visible",
                    target: "page",
                    expected: "loaded",
                    description: `Verify ${gap.flowName} page elements are visible`,
                },
            ],
        };
    });
    return {
        id: randomUUID(),
        targetApp,
        createdAt: new Date().toISOString(),
        flows,
    };
}
//# sourceMappingURL=audit-to-testplan.js.map