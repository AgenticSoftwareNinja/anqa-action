const MARKER = "<!-- anqa-pr-analysis -->";
export function buildPRComment(options) {
    const { tests, stats, totalFlows, timingMs, estimatedCostUsd, dashboardUrl, targetWarning } = options;
    const passed = tests.filter((t) => t.status === "passed").length;
    const healed = tests.filter((t) => t.status === "healed").length;
    const failed = tests.filter((t) => t.status === "failed").length;
    const skipped = tests.filter((t) => t.status === "skipped").length;
    const allGreen = failed === 0 && skipped === 0;
    const hasHeals = healed > 0;
    const hasFailures = failed > 0;
    let verdict;
    let actionText = "";
    if (hasFailures) {
        verdict = `**✗ ${passed} passed, ${healed} healed, ${failed} failed**`;
        actionText = "\n\nThese tests couldn't be auto-healed. Check the failures below and fix manually, or re-push after updating your code.";
    }
    else if (hasHeals) {
        verdict = `**✓ ${passed} passed, ${healed} healed, ${failed} failed** — safe to merge`;
        actionText = "\n\nReview the healed diffs below. If they look correct, no action needed — your tests are up to date.";
    }
    else {
        verdict = `**✓ ${passed + healed} tests passed** — safe to merge`;
    }
    const warningLine = targetWarning ? `\n\n> ⚠️ ${targetWarning}\n` : "";
    const flowsSection = `<details>\n<summary>Affected flows (${tests.length} of ${totalFlows} total)</summary>\n\n| Flow | Confidence | Test | Status | Heals |\n|------|------------|------|--------|-------|\n${tests.map((t) => `| ${t.flow_name} | ${t.confidence} | \`${t.file_path.split("/").pop()}\` | ${statusIcon(t.status)} ${t.status} | ${t.heal_attempts} |`).join("\n")}\n\n</details>`;
    const healedTests = tests.filter((t) => t.status === "healed" && t.healed_diff);
    const healedSection = healedTests.length > 0
        ? `\n\n<details>\n<summary>Healed tests (${healedTests.length})</summary>\n\n${healedTests.map((t) => `### \`${t.file_path.split("/").pop()}\`\n\n\`\`\`diff\n${t.healed_diff}\n\`\`\`\n\n> Apply this fix by pushing it to your branch, or copy the diff above.`).join("\n\n")}\n\n</details>`
        : "";
    const totalMs = timingMs.mapping + timingMs.execution + timingMs.healing;
    const timingSection = `\n\n<details>\n<summary>Timing & cost</summary>\n\n- Mapping: ${(timingMs.mapping / 1000).toFixed(1)}s\n- Test execution: ${(timingMs.execution / 1000).toFixed(0)}s\n- Healing: ${(timingMs.healing / 1000).toFixed(0)}s\n- Estimated token cost: ~$${estimatedCostUsd.toFixed(2)}\n\n</details>`;
    return `${MARKER}\n## ANQA PR Analysis\n\n${verdict}${actionText}${warningLine}\n\n${flowsSection}${healedSection}${timingSection}\n\n---\n*[ANQA](https://anqa.dev) • [Dashboard](${dashboardUrl}) • ${(totalMs / 1000).toFixed(0)}s total*`;
}
export function buildDryRunComment(options) {
    const { affectedFlows, stats, estimatedCostUsd, estimatedTimeSeconds, dashboardSettingsUrl } = options;
    const definite = affectedFlows.filter((f) => f.confidence === "definite").length;
    const likely = affectedFlows.filter((f) => f.confidence === "likely").length;
    const mappingTable = affectedFlows.length > 0
        ? `\n\n<details>\n<summary>File → flow mapping</summary>\n\n| Changed File | Matched Flows | How |\n|---|---|---|\n${affectedFlows.map((f) => `| \`${f.matched_files[0] || "—"}\` | ${f.flow_name} | ${f.confidence === "definite" ? "file-to-flow index" : "LLM analysis"} |`).join("\n")}\n\n</details>`
        : "";
    const costSection = `\n\n<details>\n<summary>Estimated cost</summary>\n\n- Execution time: ~${estimatedTimeSeconds}s\n- Token cost: ~$${estimatedCostUsd.toFixed(2)}\n- Tests that would run: ${affectedFlows.filter((f) => f.test_file).length}\n\n</details>`;
    return `${MARKER}\n## ANQA PR Analysis (dry run)\n\n**Would test ${affectedFlows.length} flows** (${definite} definite, ${likely} likely). No tests executed.${mappingTable}${costSection}\n\n> **Ready to enable?** [Turn on PR analysis in dashboard settings](${dashboardSettingsUrl})\n\n---\n*[ANQA](https://anqa.dev) • Dry run — no tests executed*`;
}
function statusIcon(status) {
    switch (status) {
        case "passed": return "✓";
        case "healed": return "🔧";
        case "failed": return "✗";
        case "skipped": return "⏭";
        default: return "—";
    }
}
//# sourceMappingURL=pr-comment.js.map