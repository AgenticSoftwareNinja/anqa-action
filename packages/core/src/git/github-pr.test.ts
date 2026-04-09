import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGitHubPRClient, type GitHubPRClient } from "./github-pr.js";

vi.mock("@octokit/rest", () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    git: {
      getRef: vi.fn().mockResolvedValue({
        data: { object: { sha: "base-sha-123" } },
      }),
      getCommit: vi.fn().mockResolvedValue({
        data: { tree: { sha: "tree-sha-base" } },
      }),
      createRef: vi.fn().mockResolvedValue({ data: {} }),
      createTree: vi.fn().mockResolvedValue({
        data: { sha: "tree-sha-456" },
      }),
      createCommit: vi.fn().mockResolvedValue({
        data: { sha: "commit-sha-789" },
      }),
      updateRef: vi.fn().mockResolvedValue({ data: {} }),
    },
    repos: {
      createOrUpdateFileContents: vi.fn().mockResolvedValue({ data: {} }),
    },
    pulls: {
      create: vi.fn().mockResolvedValue({
        data: { html_url: "https://github.com/owner/repo/pull/1", number: 1 },
      }),
    },
  })),
}));

describe("GitHubPRClient", () => {
  let client: GitHubPRClient;

  beforeEach(() => {
    client = createGitHubPRClient({ token: "test-token" });
  });

  it("creates a branch from base", async () => {
    await client.createBranch({
      owner: "owner", repo: "repo",
      baseBranch: "main", newBranch: "feat/test",
    });
    // If it doesn't throw, it succeeded
  });

  it("commits files to a branch", async () => {
    const sha = await client.commitFiles({
      owner: "owner", repo: "repo",
      branch: "feat/test",
      message: "test commit",
      files: [{ path: "test.ts", content: 'console.log("hello")' }],
    });
    expect(sha).toBe("commit-sha-789");
  });

  it("creates a pull request", async () => {
    const pr = await client.createPR({
      owner: "owner", repo: "repo",
      head: "feat/test", base: "main",
      title: "Test PR", body: "Test body",
    });
    expect(pr.url).toBe("https://github.com/owner/repo/pull/1");
    expect(pr.number).toBe(1);
  });
});
