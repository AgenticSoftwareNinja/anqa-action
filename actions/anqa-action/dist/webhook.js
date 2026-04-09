const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000; // 1s, 4s, 16s
async function postWithRetry(url, apiKey, payload) {
    let lastError = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-ANQA-Key": apiKey,
                },
                body: JSON.stringify(payload),
            });
            if (response.ok)
                return;
            if (response.status >= 500) {
                lastError = new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            else {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
        }
        if (attempt < MAX_RETRIES - 1) {
            const delayMs = BACKOFF_BASE_MS * Math.pow(4, attempt);
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }
    throw lastError;
}
export async function postStatus(apiBaseUrl, apiKey, payload) {
    await postWithRetry(`${apiBaseUrl}/api/action/status`, apiKey, payload);
}
export async function postAuditResults(apiBaseUrl, apiKey, payload) {
    await postWithRetry(`${apiBaseUrl}/api/action/audit`, apiKey, payload);
}
export async function postGenerateResults(apiBaseUrl, apiKey, payload) {
    await postWithRetry(`${apiBaseUrl}/api/action/generate`, apiKey, payload);
}
export async function postPRAnalysisResults(apiBaseUrl, apiKey, payload) {
    await postWithRetry(`${apiBaseUrl}/api/action/pr-analysis`, apiKey, payload);
}
export async function postNightlyResults(apiBaseUrl, apiKey, payload) {
    await postWithRetry(`${apiBaseUrl}/api/action/nightly`, apiKey, payload);
}
export async function acquireLock(apiBaseUrl, apiKey, mode, githubActionRunId) {
    const url = `${apiBaseUrl}/api/action/lock`;
    const body = JSON.stringify({ mode, github_action_run_id: githubActionRunId });
    const headers = { "Content-Type": "application/json", "X-ANQA-Key": apiKey };
    // First attempt
    let response = await fetch(url, { method: "POST", headers, body });
    // If busy, wait 60s and retry once (spec requirement)
    if (response.status === 409) {
        console.log("Project busy. Waiting 60s before retry...");
        await new Promise((resolve) => setTimeout(resolve, 60_000));
        response = await fetch(url, { method: "POST", headers, body });
    }
    if (response.status === 409) {
        const data = await response.json();
        return { acquired: false, busy_mode: data.mode, busy_started_at: data.started_at };
    }
    if (!response.ok) {
        throw new Error(`Lock request failed: ${response.status}`);
    }
    const data = await response.json();
    return { acquired: true, run_id: data.run_id };
}
//# sourceMappingURL=webhook.js.map