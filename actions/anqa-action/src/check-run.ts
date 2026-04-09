// actions/anqa-action/src/check-run.ts
import { Octokit } from "@octokit/rest";

interface CheckConclusionInput {
  passed: number;
  healed: number;
  failed: number;
  skipped: number;
  isDryRun: boolean;
  reason: string | undefined;
}

interface CheckConclusionResult {
  conclusion: "success" | "neutral" | "failure";
  summary: string;
}

export function resolveCheckConclusion(input: CheckConclusionInput): CheckConclusionResult {
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

interface CreateCheckRunOptions {
  githubToken: string;
  owner: string;
  repo: string;
  headSha: string;
  conclusion: "success" | "neutral" | "failure";
  summary: string;
  detailsText?: string;
}

export async function createCheckRun(options: CreateCheckRunOptions): Promise<void> {
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
