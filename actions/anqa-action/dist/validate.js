export async function verifyApiKey(apiBaseUrl, apiKey) {
    const response = await fetch(`${apiBaseUrl}/api/action/verify`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-ANQA-Key": apiKey,
        },
    });
    if (response.status === 401) {
        throw new Error("Invalid API key");
    }
    if (!response.ok) {
        throw new Error(`API key verification failed: HTTP ${response.status}`);
    }
    const data = (await response.json());
    return {
        projectId: data.project_id,
        targetUrl: data.target_url,
        authConfig: data.auth_config,
        pr_analysis: data.pr_analysis ?? null,
    };
}
export async function checkSiteReachability(url) {
    try {
        const response = await fetch(url, {
            method: "HEAD",
            signal: AbortSignal.timeout(15_000),
        });
        if (!response.ok) {
            return { reachable: false, error: `HTTP ${response.status}: ${response.statusText}` };
        }
        return { reachable: true };
    }
    catch (error) {
        return {
            reachable: false,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}
//# sourceMappingURL=validate.js.map