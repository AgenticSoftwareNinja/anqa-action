const ERROR_PATTERNS = [
    {
        pattern: /locator\.\w+: Element is not (visible|attached|enabled)|locator\.\w+: No element/i,
        code: "element_not_found",
        guidance: "The test couldn't find a UI element. The page may have changed since the audit.",
    },
    {
        pattern: /net::ERR_CONNECTION_REFUSED|ECONNREFUSED|ENOTFOUND/i,
        code: "site_unreachable",
        guidance: "Could not reach your site. Check that the target URL is accessible.",
    },
    {
        pattern: /401 Unauthorized|403 Forbidden/i,
        code: "auth_failed",
        guidance: "Authentication failed. Check your auth configuration in project settings.",
    },
    {
        pattern: /Timeout \d+ms exceeded|TimeoutError|navigation timeout/i,
        code: "timeout",
        guidance: "Page took too long to respond. This may be a performance issue.",
    },
    {
        pattern: /anthropic.*rate_limit/i,
        code: "llm_rate_limit",
        guidance: "Hit API rate limits. Try again in a few minutes or reduce max_flows.",
    },
    {
        pattern: /anthropic.*invalid_api_key|authentication_error/i,
        code: "llm_auth_failed",
        guidance: "Anthropic API key is invalid. Update ANTHROPIC_API_KEY in your GitHub repository secrets.",
    },
    { pattern: /409\s*conflict/i, code: "run_in_progress", guidance: "Another ANQA run is in progress for this project. Wait for it to complete or re-push to retry." },
    { pattern: /no\s*audit\s*found|404.*audit/i, code: "no_audit", guidance: "No audit data available. Run an audit first to enable PR analysis." },
    { pattern: /stale_audit/i, code: "stale_audit", guidance: "Audit data is stale. Run a fresh audit for accurate PR analysis." },
    { pattern: /insufficient_tests/i, code: "insufficient_tests", guidance: "PR analysis requires at least N generated tests. Generate tests first." },
    { pattern: /mapping_timeout/i, code: "mapping_timeout", guidance: "Diff analysis took too long. Results are partial — some files were not analyzed." },
    { pattern: /execution_timeout/i, code: "execution_timeout", guidance: "Test execution budget exceeded. Partial results reported." },
    { pattern: /push_failed/i, code: "push_failed", guidance: "Could not push healed tests to your branch. Diffs are shown in the PR comment instead." },
    { pattern: /fork_pr/i, code: "fork_pr", guidance: "Healed test diffs are in the PR comment. Direct push is not supported for fork PRs." },
];
export function normalizeError(errorMessage) {
    for (const { pattern, code, guidance } of ERROR_PATTERNS) {
        if (pattern.test(errorMessage)) {
            return { code, guidance };
        }
    }
    return {
        code: "unknown",
        guidance: "Check the full error details in the run log.",
    };
}
//# sourceMappingURL=error-normalizer.js.map