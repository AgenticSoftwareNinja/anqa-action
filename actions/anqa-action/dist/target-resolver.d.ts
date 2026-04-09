interface ResolveOptions {
    inputTargetUrl: string;
    projectTargetUrl: string;
    githubToken: string;
    owner: string;
    repo: string;
    headSha: string;
    skipDeploymentCheck?: boolean;
}
interface ResolveResult {
    url: string;
    source: "explicit_override" | "deployment_status" | "project_fallback";
    warning?: string;
}
export declare function resolveTargetUrl(options: ResolveOptions): Promise<ResolveResult>;
export {};
//# sourceMappingURL=target-resolver.d.ts.map