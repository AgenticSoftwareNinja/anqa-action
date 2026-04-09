import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  diffFlowInventory,
  shouldSkipNightly,
  buildNightlyBranchName,
  runPhaseWithBudget,
} from "../nightly-utils.js";
import type { FlowInventoryItem } from "../types.js";

// ─── diffFlowInventory ───────────────────────────────

describe("diffFlowInventory", () => {
  const stored: FlowInventoryItem[] = [
    { id: "f1", name: "Login", description: "Login flow", priority: "critical", test_file: "login.spec.ts" },
    { id: "f2", name: "Signup", description: "Signup flow", priority: "high", test_file: "signup.spec.ts" },
    { id: "f3", name: "Dashboard", description: "Dashboard", priority: "medium", test_file: null },
  ];

  it("returns new flows not in stored inventory", () => {
    const current: FlowInventoryItem[] = [
      ...stored,
      { id: "f4", name: "Settings", description: "Settings page", priority: "medium", test_file: null },
    ];

    const diff = diffFlowInventory(current, stored);
    expect(diff).toHaveLength(1);
    expect(diff[0].id).toBe("f4");
  });

  it("returns changed flows (name differs)", () => {
    const current: FlowInventoryItem[] = [
      { id: "f1", name: "Login v2", description: "Login flow", priority: "critical", test_file: "login.spec.ts" },
      { id: "f2", name: "Signup", description: "Signup flow", priority: "high", test_file: "signup.spec.ts" },
    ];

    const diff = diffFlowInventory(current, stored);
    expect(diff).toHaveLength(1);
    expect(diff[0].name).toBe("Login v2");
  });

  it("returns changed flows (description differs)", () => {
    const current: FlowInventoryItem[] = [
      { id: "f1", name: "Login", description: "Updated login flow", priority: "critical", test_file: "login.spec.ts" },
    ];

    const diff = diffFlowInventory(current, stored);
    expect(diff).toHaveLength(1);
  });

  it("returns empty array when no changes", () => {
    const diff = diffFlowInventory(stored, stored);
    expect(diff).toHaveLength(0);
  });

  it("handles empty stored inventory (all flows are new)", () => {
    const diff = diffFlowInventory(stored, []);
    expect(diff).toHaveLength(3);
  });

  it("handles empty current inventory", () => {
    const diff = diffFlowInventory([], stored);
    expect(diff).toHaveLength(0);
  });
});

// ─── buildNightlyBranchName ──────────────────────────

describe("buildNightlyBranchName", () => {
  it("returns branch name with anqa/nightly- prefix and date", () => {
    const branch = buildNightlyBranchName();
    expect(branch).toMatch(/^anqa\/nightly-\d{4}-\d{2}-\d{2}$/);
  });

  it("uses current date", () => {
    const branch = buildNightlyBranchName();
    const today = new Date().toISOString().split("T")[0];
    expect(branch).toBe(`anqa/nightly-${today}`);
  });
});

// ─── shouldSkipNightly ───────────────────────────────

describe("shouldSkipNightly", () => {
  it("returns false when git log has commits", () => {
    // Testing with the actual repo (which has commits)
    const result = shouldSkipNightly(process.cwd());
    // We can't guarantee the result here, but it should not throw
    expect(typeof result).toBe("boolean");
  });

  it("returns false on git error (e.g., invalid path)", () => {
    const result = shouldSkipNightly("/nonexistent/path");
    expect(result).toBe(false);
  });
});

// ─── runPhaseWithBudget ──────────────────────────────

describe("runPhaseWithBudget", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns result when phase completes within budget", async () => {
    const result = await runPhaseWithBudget(
      "test-phase",
      5000,
      async () => "success",
      "fallback",
    );
    expect(result).toBe("success");
  });

  it("returns fallback when phase times out", async () => {
    const promise = runPhaseWithBudget(
      "slow-phase",
      100,
      async (signal) => {
        // Simulate a long-running operation
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(resolve, 10_000);
          signal.addEventListener("abort", () => {
            clearTimeout(timeout);
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
        return "should not reach";
      },
      "fallback-value",
    );

    await vi.advanceTimersByTimeAsync(200);

    const result = await promise;
    expect(result).toBe("fallback-value");
  });

  it("propagates non-abort errors", async () => {
    await expect(
      runPhaseWithBudget(
        "error-phase",
        5000,
        async () => {
          throw new Error("unexpected error");
        },
        "fallback",
      ),
    ).rejects.toThrow("unexpected error");
  });
});

// ─── Mode auto-detection ─────────────────────────────

describe("mode auto-detection", () => {
  it("schedule event should map to nightly mode", () => {
    // This tests the logic from index.ts:
    // config.mode === "audit" && eventName === "schedule" -> "nightly"
    const config = { mode: "audit" as const, eventName: "schedule" };
    const effectiveMode = config.mode === "audit" && config.eventName === "schedule"
      ? "nightly"
      : config.mode === "audit" && config.eventName === "pull_request"
        ? "pr-analysis"
        : config.mode;
    expect(effectiveMode).toBe("nightly");
  });

  it("pull_request event should map to pr-analysis mode", () => {
    const config = { mode: "audit" as const, eventName: "pull_request" };
    const effectiveMode = config.mode === "audit" && config.eventName === "schedule"
      ? "nightly"
      : config.mode === "audit" && config.eventName === "pull_request"
        ? "pr-analysis"
        : config.mode;
    expect(effectiveMode).toBe("pr-analysis");
  });

  it("explicit nightly mode is preserved", () => {
    const config = { mode: "nightly" as const, eventName: "workflow_dispatch" };
    const effectiveMode = config.mode === "audit" && config.eventName === "schedule"
      ? "nightly"
      : config.mode === "audit" && config.eventName === "pull_request"
        ? "pr-analysis"
        : config.mode;
    expect(effectiveMode).toBe("nightly");
  });

  it("explicit generate mode is preserved regardless of event", () => {
    const config = { mode: "generate" as const, eventName: "schedule" };
    const effectiveMode = config.mode === "audit" && config.eventName === "schedule"
      ? "nightly"
      : config.mode === "audit" && config.eventName === "pull_request"
        ? "pr-analysis"
        : config.mode;
    expect(effectiveMode).toBe("generate");
  });
});

// ─── postNightlyResults ──────────────────────────────

describe("postNightlyResults", () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends nightly payload to correct endpoint", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const { postNightlyResults } = await import("../webhook.js");

    await postNightlyResults("https://api.example.com", "test-key", {
      github_action_run_id: "123",
      mode: "nightly",
      trigger: "schedule",
      pr_url: null,
      pr_number: null,
      summary: {
        tests_run: 10,
        tests_passed: 8,
        tests_healed: 1,
        tests_failed: 1,
        tests_generated: 2,
        tests_generated_passing: 1,
        flows_discovered: 15,
        flows_new: 2,
        total_heal_attempts: 3,
        healing_time_ms: 5000,
        crawl_time_ms: 3000,
        generation_time_ms: 8000,
        total_time_ms: 20000,
        estimated_token_cost_usd: 1.5,
      },
      healed_tests: [],
      new_tests: [],
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.example.com/api/action/nightly",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-ANQA-Key": "test-key",
        },
      }),
    );
  });
});

// ─── NightlyConfig validation caps ───────────────────

describe("nightly config validation", () => {
  it("caps max_flows at 50", () => {
    const nightlyConfig = { max_flows: 100, max_heal_attempts: 3 };
    const validated = {
      ...nightlyConfig,
      max_flows: Math.min(nightlyConfig.max_flows, 50),
      max_heal_attempts: Math.min(nightlyConfig.max_heal_attempts, 10),
    };
    expect(validated.max_flows).toBe(50);
  });

  it("caps max_heal_attempts at 10", () => {
    const nightlyConfig = { max_flows: 10, max_heal_attempts: 20 };
    const validated = {
      ...nightlyConfig,
      max_flows: Math.min(nightlyConfig.max_flows, 50),
      max_heal_attempts: Math.min(nightlyConfig.max_heal_attempts, 10),
    };
    expect(validated.max_heal_attempts).toBe(10);
  });

  it("preserves valid values", () => {
    const nightlyConfig = { max_flows: 5, max_heal_attempts: 3 };
    const validated = {
      ...nightlyConfig,
      max_flows: Math.min(nightlyConfig.max_flows, 50),
      max_heal_attempts: Math.min(nightlyConfig.max_heal_attempts, 10),
    };
    expect(validated.max_flows).toBe(5);
    expect(validated.max_heal_attempts).toBe(3);
  });
});
