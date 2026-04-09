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
export declare function resolveCheckConclusion(input: CheckConclusionInput): CheckConclusionResult;
interface CreateCheckRunOptions {
    githubToken: string;
    owner: string;
    repo: string;
    headSha: string;
    conclusion: "success" | "neutral" | "failure";
    summary: string;
    detailsText?: string;
}
export declare function createCheckRun(options: CreateCheckRunOptions): Promise<void>;
export {};
//# sourceMappingURL=check-run.d.ts.map