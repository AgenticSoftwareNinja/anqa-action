import { randomUUID } from "node:crypto";

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
  steps: Array<{ action: string; target?: string; description: string }>;
  assertions: Array<{ type: string; target: string; expected: string; description: string }>;
}

interface TestPlan {
  id: string;
  targetApp: string;
  createdAt: string;
  flows: TestFlow[];
}

const PRIORITY_ORDER: Record<string, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export function selectFlows(gaps: AuditGap[], maxFlows: number): AuditGap[] {
  const sorted = [...gaps].sort(
    (a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
  );

  const selected: AuditGap[] = [];
  for (const gap of sorted) {
    if (selected.length >= maxFlows) break;
    if (gap.priority === "low") continue;
    selected.push(gap);
  }
  return selected;
}

export function auditToTestPlan(
  selectedGaps: AuditGap[],
  proposedTests: ProposedTest[],
  targetApp: string
): TestPlan {
  const proposedMap = new Map(proposedTests.map((p) => [p.flowId, p]));

  const flows: TestFlow[] = selectedGaps.map((gap) => {
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
