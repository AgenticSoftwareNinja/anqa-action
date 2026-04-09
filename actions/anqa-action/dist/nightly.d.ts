import type { NightlyOptions, NightlyPayload, NightlyHealResult } from "./types.js";
export { runPhaseWithBudget, diffFlowInventory, shouldSkipNightly, buildNightlyBranchName } from "./nightly-utils.js";
/**
 * Heal a single test file safely: writes to a temp file, only renames on
 * success, restores original on failure/timeout.
 */
export declare function healTestSafe(testFilePath: string, error: string, options: NightlyOptions, budgetMs: number): Promise<NightlyHealResult>;
export declare function runNightly(options: NightlyOptions): Promise<NightlyPayload>;
//# sourceMappingURL=nightly.d.ts.map