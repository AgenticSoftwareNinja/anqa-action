import { Octokit } from "@octokit/rest";

export interface GitHubPRClient {
  createBranch(options: CreateBranchOptions): Promise<void>;
  commitFiles(options: CommitFilesOptions): Promise<string>;
  createPR(options: CreatePROptions): Promise<{ url: string; number: number }>;
  deleteBranch(options: { owner: string; repo: string; branch: string }): Promise<void>;
  pushToExistingBranch(options: PushToExistingBranchOptions): Promise<string>;
}

export interface CreateBranchOptions {
  owner: string;
  repo: string;
  baseBranch: string;
  newBranch: string;
}

export interface CommitFilesOptions {
  owner: string;
  repo: string;
  branch: string;
  message: string;
  files: Array<{ path: string; content: string }>;
}

export interface CreatePROptions {
  owner: string;
  repo: string;
  head: string;
  base: string;
  title: string;
  body: string;
}

export interface PushToExistingBranchOptions {
  owner: string;
  repo: string;
  branch: string;
  files: Array<{ path: string; content: string }>;
  message: string;
}

export function createGitHubPRClient(options: { token: string }): GitHubPRClient {
  const octokit = new Octokit({ auth: options.token });

  return {
    async createBranch({ owner, repo, baseBranch, newBranch }: CreateBranchOptions): Promise<void> {
      const { data: ref } = await octokit.git.getRef({
        owner, repo,
        ref: `heads/${baseBranch}`,
      });
      await octokit.git.createRef({
        owner, repo,
        ref: `refs/heads/${newBranch}`,
        sha: ref.object.sha,
      });
    },

    async commitFiles({ owner, repo, branch, message, files }: CommitFilesOptions): Promise<string> {
      // Get current commit SHA for the branch
      const { data: ref } = await octokit.git.getRef({
        owner, repo,
        ref: `heads/${branch}`,
      });
      const commitSha = ref.object.sha;

      // Get the tree SHA from the commit
      const { data: commitData } = await octokit.git.getCommit({
        owner, repo,
        commit_sha: commitSha,
      });
      const treeSha = commitData.tree.sha;

      // Create tree with new files
      const { data: tree } = await octokit.git.createTree({
        owner, repo,
        base_tree: treeSha,
        tree: files.map((f) => ({
          path: f.path,
          mode: "100644" as const,
          type: "blob" as const,
          content: f.content,
        })),
      });

      // Create commit
      const { data: commit } = await octokit.git.createCommit({
        owner, repo,
        message,
        tree: tree.sha,
        parents: [commitSha],
      });

      // Update branch ref
      await octokit.git.updateRef({
        owner, repo,
        ref: `heads/${branch}`,
        sha: commit.sha,
      });

      return commit.sha;
    },

    async createPR({ owner, repo, head, base, title, body }: CreatePROptions): Promise<{ url: string; number: number }> {
      const { data: pr } = await octokit.pulls.create({
        owner, repo, head, base, title, body,
      });
      return { url: pr.html_url, number: pr.number };
    },

    async deleteBranch({ owner, repo, branch }: { owner: string; repo: string; branch: string }): Promise<void> {
      try {
        await octokit.git.deleteRef({
          owner,
          repo,
          ref: `heads/${branch}`,
        });
      } catch {
        // Best-effort cleanup, don't throw
      }
    },

    async pushToExistingBranch({ owner, repo, branch, files, message }: PushToExistingBranchOptions): Promise<string> {
      // Get the current branch SHA
      const { data: ref } = await octokit.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });
      const baseSha = ref.object.sha;

      // Get the current tree
      const { data: baseCommit } = await octokit.git.getCommit({
        owner,
        repo,
        commit_sha: baseSha,
      });

      // Create blobs for each file
      const treeItems = await Promise.all(
        files.map(async (file) => {
          const { data: blob } = await octokit.git.createBlob({
            owner,
            repo,
            content: file.content,
            encoding: "utf-8",
          });
          return {
            path: file.path,
            mode: "100644" as const,
            type: "blob" as const,
            sha: blob.sha,
          };
        })
      );

      // Create new tree
      const { data: newTree } = await octokit.git.createTree({
        owner,
        repo,
        base_tree: baseCommit.tree.sha,
        tree: treeItems,
      });

      // Create commit
      const { data: newCommit } = await octokit.git.createCommit({
        owner,
        repo,
        message,
        tree: newTree.sha,
        parents: [baseSha],
      });

      // Update branch ref
      await octokit.git.updateRef({
        owner,
        repo,
        ref: `heads/${branch}`,
        sha: newCommit.sha,
      });

      return newCommit.sha;
    },
  };
}
