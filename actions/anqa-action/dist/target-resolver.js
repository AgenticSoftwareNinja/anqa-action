// actions/anqa-action/src/target-resolver.ts
import { Octokit } from "@octokit/rest";
const DEPLOYMENT_POLL_TIMEOUT_MS = 5 * 60 * 1000;
const DEPLOYMENT_POLL_INTERVAL_MS = 10_000;
async function pollDeploymentStatus(octokit, owner, repo, sha) {
    const deadline = Date.now() + DEPLOYMENT_POLL_TIMEOUT_MS;
    while (Date.now() < deadline) {
        const { data: deployments } = await octokit.repos.listDeployments({
            owner,
            repo,
            sha,
            per_page: 10,
        });
        for (const deployment of deployments) {
            const { data: statuses } = await octokit.repos.listDeploymentStatuses({
                owner,
                repo,
                deployment_id: deployment.id,
                per_page: 1,
            });
            const latest = statuses[0];
            if (latest?.state === "success" && latest.environment_url) {
                return latest.environment_url;
            }
        }
        await new Promise((resolve) => setTimeout(resolve, DEPLOYMENT_POLL_INTERVAL_MS));
    }
    return null;
}
export async function resolveTargetUrl(options) {
    const { inputTargetUrl, projectTargetUrl, githubToken, owner, repo, headSha, skipDeploymentCheck } = options;
    // Pattern 2: explicit override
    if (inputTargetUrl && inputTargetUrl !== projectTargetUrl) {
        return { url: inputTargetUrl, source: "explicit_override" };
    }
    // Pattern 1: deployment status polling
    if (!skipDeploymentCheck) {
        try {
            const octokit = new Octokit({ auth: githubToken });
            const deploymentUrl = await pollDeploymentStatus(octokit, owner, repo, headSha);
            if (deploymentUrl) {
                return { url: deploymentUrl, source: "deployment_status" };
            }
        }
        catch {
            // Deployment check failed, fall through to fallback
        }
    }
    // Pattern 3: fallback with warning
    return {
        url: projectTargetUrl,
        source: "project_fallback",
        warning: "Running against production URL — results may not reflect PR changes. Configure a preview deployment for accurate analysis.",
    };
}
//# sourceMappingURL=target-resolver.js.map