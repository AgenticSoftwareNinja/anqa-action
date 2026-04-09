// actions/anqa-action/src/__tests__/diff-mapper.test.ts
import { describe, it, expect } from "vitest";
import { mapDiffToFlows, heuristicMatch, truncateDiff } from "../diff-mapper.js";
import type { FlowInventoryItem } from "../types.js";

const mockFlowInventory: FlowInventoryItem[] = [
  { id: "login-flow", name: "User login", description: "Login with credentials", priority: "critical", test_file: "tests/anqa/login-flow.spec.ts" },
  { id: "checkout-flow", name: "Checkout", description: "Purchase items", priority: "high", test_file: "tests/anqa/checkout-flow.spec.ts" },
  { id: "settings-flow", name: "Settings", description: "User settings page", priority: "medium", test_file: "tests/anqa/settings-flow.spec.ts" },
];

const mockIndex: Record<string, string[]> = {
  "src/pages/login.tsx": ["login-flow"],
  "src/pages/checkout.tsx": ["checkout-flow"],
  "src/lib/auth.ts": ["login-flow", "settings-flow"],
};

describe("heuristicMatch", () => {
  it("matches exact file paths from the index", () => {
    const result = heuristicMatch(
      [{ filename: "src/pages/login.tsx", patch: "diff content" }],
      mockIndex
    );
    expect(result.matched).toEqual([
      { filename: "src/pages/login.tsx", flow_ids: ["login-flow"] },
    ]);
    expect(result.uncertain).toEqual([]);
  });

  it("puts unmatched files in uncertain list", () => {
    const result = heuristicMatch(
      [{ filename: "src/utils/helpers.ts", patch: "diff content" }],
      mockIndex
    );
    expect(result.matched).toEqual([]);
    expect(result.uncertain).toEqual([
      { filename: "src/utils/helpers.ts", patch: "diff content" },
    ]);
  });

  it("handles files matching multiple flows", () => {
    const result = heuristicMatch(
      [{ filename: "src/lib/auth.ts", patch: "diff" }],
      mockIndex
    );
    expect(result.matched[0].flow_ids).toEqual(["login-flow", "settings-flow"]);
  });

  it("matches directory prefixes", () => {
    const indexWithDir: Record<string, string[]> = {
      "src/pages/checkout/index.tsx": ["checkout-flow"],
    };
    const result = heuristicMatch(
      [{ filename: "src/pages/checkout/payment.tsx", patch: "diff" }],
      indexWithDir
    );
    expect(result.matched[0].flow_ids).toEqual(["checkout-flow"]);
  });
});

describe("truncateDiff", () => {
  it("truncates diffs exceeding max lines", () => {
    const longDiff = Array(300).fill("+ line").join("\n");
    const result = truncateDiff(longDiff, 200);
    expect(result.split("\n").length).toBeLessThanOrEqual(201);
    expect(result).toContain("[truncated]");
  });

  it("preserves short diffs unchanged", () => {
    const shortDiff = "- old\n+ new";
    expect(truncateDiff(shortDiff, 200)).toBe(shortDiff);
  });
});

describe("mapDiffToFlows", () => {
  it("returns affected flows with confidence levels", async () => {
    const changedFiles = [
      { filename: "src/pages/login.tsx", patch: "diff" },
    ];
    const result = await mapDiffToFlows({
      changedFiles,
      fileToFlowIndex: mockIndex,
      flowInventory: mockFlowInventory,
      dryRun: false,
      anthropicApiKey: "test-key",
    });
    expect(result.affectedFlows).toEqual([
      expect.objectContaining({
        flow_id: "login-flow",
        confidence: "definite",
        test_file: "tests/anqa/login-flow.spec.ts",
      }),
    ]);
    expect(result.stats.heuristic_matches).toBe(1);
    expect(result.stats.llm_escalations).toBe(0);
  });

  it("skips LLM escalation when no uncertain files", async () => {
    const changedFiles = [
      { filename: "src/pages/login.tsx", patch: "diff" },
    ];
    const result = await mapDiffToFlows({
      changedFiles,
      fileToFlowIndex: mockIndex,
      flowInventory: mockFlowInventory,
      dryRun: false,
      anthropicApiKey: "test-key",
    });
    expect(result.stats.llm_escalations).toBe(0);
    expect(result.stats.unanalyzed_files).toBe(0);
  });

  it("returns empty when no flows affected", async () => {
    const result = await mapDiffToFlows({
      changedFiles: [{ filename: "README.md", patch: "update" }],
      fileToFlowIndex: mockIndex,
      flowInventory: mockFlowInventory,
      dryRun: false,
      anthropicApiKey: "test-key",
    });
    // README.md goes to uncertain, but with no LLM mock it stays unanalyzed
    expect(result.affectedFlows).toEqual([]);
  });
});
