import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { postStatus, postAuditResults } from "../webhook.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("webhook client", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("postStatus", () => {
    it("sends status with correct headers and body", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await postStatus("https://api.example.com", "test-api-key", {
        status: "running",
        github_action_run_id: "12345",
        mode: "audit",
        trigger: "onboarding",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/api/action/status",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-ANQA-Key": "test-api-key",
          },
        }),
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.status).toBe("running");
      expect(body.github_action_run_id).toBe("12345");
    });

    it("retries 3 times with exponential backoff on failure", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("network error"))
        .mockRejectedValueOnce(new Error("network error"))
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const promise = postStatus("https://api.example.com", "key", {
        status: "running",
        github_action_run_id: "1",
        mode: "audit",
        trigger: "manual",
      });

      // Advance past first retry delay (1000ms)
      await vi.advanceTimersByTimeAsync(1000);
      // Advance past second retry delay (4000ms)
      await vi.advanceTimersByTimeAsync(4000);

      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("throws after 3 failed retries", async () => {
      mockFetch
        .mockRejectedValueOnce(new Error("network error"))
        .mockRejectedValueOnce(new Error("network error"))
        .mockRejectedValueOnce(new Error("network error"));

      const promise = postStatus("https://api.example.com", "key", {
        status: "running",
        github_action_run_id: "1",
        mode: "audit",
        trigger: "manual",
      });

      // Attach rejection handler before advancing timers to avoid unhandled rejection
      const resultPromise = promise.then(
        () => {
          throw new Error("expected rejection");
        },
        (err: Error) => err,
      );

      // Advance past first retry delay (1000ms)
      await vi.advanceTimersByTimeAsync(1000);
      // Advance past second retry delay (4000ms)
      await vi.advanceTimersByTimeAsync(4000);

      const error = await resultPromise;
      expect(error.message).toBe("network error");
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe("postAuditResults", () => {
    it("sends audit payload to correct endpoint", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await postAuditResults("https://api.example.com", "test-key", {
        audit: {
          repoAnalysis: {} as any,
          flowInventory: [],
          coverageMap: { flows: [], summary: {} as any, evaluatedAt: "" },
          gaps: [],
          proposedTests: [],
          createdAt: new Date().toISOString(),
        },
        github_action_run_id: "999",
        mode: "audit",
        trigger: "onboarding",
      });

      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.example.com/api/action/audit",
        expect.objectContaining({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-ANQA-Key": "test-key",
          },
        }),
      );
    });

    it("retries on HTTP 5xx responses", async () => {
      mockFetch
        .mockResolvedValueOnce({ ok: false, status: 502, statusText: "Bad Gateway" })
        .mockResolvedValueOnce({ ok: true, status: 200 });

      const promise = postAuditResults("https://api.example.com", "key", {
        audit: {} as any,
        github_action_run_id: "1",
        mode: "audit",
        trigger: "manual",
      });

      // Advance past first retry delay (1000ms)
      await vi.advanceTimersByTimeAsync(1000);

      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
