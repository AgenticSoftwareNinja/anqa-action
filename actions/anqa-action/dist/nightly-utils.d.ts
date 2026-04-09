import type { FlowInventoryItem } from "./types.js";
/**
 * Run a phase function with a budget. If the budget is exceeded, abort and
 * return the fallback value. Uses AbortController to signal the phase.
 */
export declare function runPhaseWithBudget<T>(name: string, budgetMs: number, fn: (signal: AbortSignal) => Promise<T>, fallback: T): Promise<T>;
/**
 * Diff the current flow inventory against the stored inventory.
 * Returns flows that are new or have changed.
 */
export declare function diffFlowInventory(currentFlows: FlowInventoryItem[], storedFlows: FlowInventoryItem[]): FlowInventoryItem[];
/**
 * Check if the repo has had any commits since the last nightly run.
 * Returns true if we should skip (no new commits).
 */
export declare function shouldSkipNightly(repoPath: string): boolean;
/**
 * Build a nightly branch name with date.
 */
export declare function buildNightlyBranchName(): string;
//# sourceMappingURL=nightly-utils.d.ts.map