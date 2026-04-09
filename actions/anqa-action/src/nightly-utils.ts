// actions/anqa-action/src/nightly-utils.ts
// Pure utility functions for the nightly pipeline — no agent imports.
// Extracted so they can be tested without resolving workspace packages.

import { execFileSync } from "node:child_process";
import type { FlowInventoryItem } from "./types.js";

/**
 * Run a phase function with a budget. If the budget is exceeded, abort and
 * return the fallback value. Uses AbortController to signal the phase.
 */
export async function runPhaseWithBudget<T>(
  name: string,
  budgetMs: number,
  fn: (signal: AbortSignal) => Promise<T>,
  fallback: T,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), budgetMs);

  try {
    const result = await fn(controller.signal);
    clearTimeout(timeout);
    return result;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      console.log(`[anqa:nightly] Phase "${name}" timed out after ${budgetMs}ms. Continuing.`);
      return fallback;
    }
    throw err;
  }
}

/**
 * Diff the current flow inventory against the stored inventory.
 * Returns flows that are new or have changed.
 */
export function diffFlowInventory(
  currentFlows: FlowInventoryItem[],
  storedFlows: FlowInventoryItem[],
): FlowInventoryItem[] {
  const storedMap = new Map(storedFlows.map((f) => [f.id, f]));
  const newOrChanged: FlowInventoryItem[] = [];

  for (const flow of currentFlows) {
    const stored = storedMap.get(flow.id);
    if (!stored) {
      newOrChanged.push(flow);
    } else if (
      stored.name !== flow.name ||
      stored.description !== flow.description
    ) {
      newOrChanged.push(flow);
    }
  }

  return newOrChanged;
}

/**
 * Check if the repo has had any commits since the last nightly run.
 * Returns true if we should skip (no new commits).
 */
export function shouldSkipNightly(repoPath: string): boolean {
  try {
    const output = execFileSync(
      "git",
      ["log", "--oneline", "--since=24 hours ago", "--no-merges"],
      { cwd: repoPath, stdio: ["pipe", "pipe", "pipe"], timeout: 10_000 },
    );
    const commits = output.toString().trim();
    return commits.length === 0;
  } catch {
    return false;
  }
}

/**
 * Build a nightly branch name with date.
 */
export function buildNightlyBranchName(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  return `anqa/nightly-${date}`;
}
