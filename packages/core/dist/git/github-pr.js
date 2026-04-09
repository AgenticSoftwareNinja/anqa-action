import { Octokit } from "@octokit/rest";
export function createGitHubPRClient(options) {
    const octokit = new Octokit({ auth: options.token });
    return {
        async createBranch({ owner, repo, baseBranch, newBranch }) {
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
        async commitFiles({ owner, repo, branch, message, files }) {
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
                    mode: "100644",
                    type: "blob",
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
        async createPR({ owner, repo, head, base, title, body }) {
            const { data: pr } = await octokit.pulls.create({
                owner, repo, head, base, title, body,
            });
            return { url: pr.html_url, number: pr.number };
        },
        async deleteBranch({ owner, repo, branch }) {
            try {
                await octokit.git.deleteRef({
                    owner,
                    repo,
                    ref: `heads/${branch}`,
                });
            }
            catch {
                // Best-effort cleanup, don't throw
            }
        },
        async pushToExistingBranch({ owner, repo, branch, files, message }) {
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
            const treeItems = await Promise.all(files.map(async (file) => {
                const { data: blob } = await octokit.git.createBlob({
                    owner,
                    repo,
                    content: file.content,
                    encoding: "utf-8",
                });
                return {
                    path: file.path,
                    mode: "100644",
                    type: "blob",
                    sha: blob.sha,
                };
            }));
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
//# sourceMappingURL=github-pr.js.map