// actions/anqa-action/src/check-run.ts
import { Octokit } from "@octokit/rest";
export function resolveCheckConclusion(input) {
    const { passed, healed, failed, skipped, isDryRun, reason } = input;
    if (reason) {
        return { conclusion: "neutral", summary: `Skipped — ${reason}` };
    }
    if (isDryRun) {
        const total = passed + healed + failed + skipped;
        return { conclusion: "success", summary: `Dry run — ${total || "no"} flows would be tested` };
    }
    const total = passed + healed + failed + skipped;
    if (total === 0) {
        return { conclusion: "success", summary: "No affected flows detected" };
    }
    if (failed > 0) {
        return { conclusion: "failure", summary: `${failed} tests failed — see PR comment for details` };
    }
    if (healed > 0) {
        return { conclusion: "neutral", summary: `${healed} tests healed — review suggested changes` };
    }
    return { conclusion: "success", summary: `All ${passed} tests passed` };
}
export async function createCheckRun(options) {
    const { githubToken, owner, repo, headSha, conclusion, summary, detailsText } = options;
    const octokit = new Octokit({ auth: githubToken });
    await octokit.checks.create({
        owner,
        repo,
        name: "anqa/pr-analysis",
        head_sha: headSha,
        status: "completed",
        conclusion,
        output: {
            title: summary,
            summary,
            text: detailsText,
        },
    });
}
//# sourceMappingURL=check-run.js.map