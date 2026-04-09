import type { AuditReport } from "@agentic-nqa/core";
export interface ActionConfig {
    mode: "audit" | "generate" | "pr-analysis" | "nightly";
    anqaApiKey: string;
    anthropicApiKey: string;
    targetUrl: string;
    apiBaseUrl: string;
    githubToken: string;
    githubRepository: string;
    githubRunId: string;
    dryRun: boolean;
    prNumber: number;
    prUrl: string;
    prBaseBranch: string;
    prHeadBranch: string;
    prHeadSha: string;
    prIsFork: boolean;
    prIsDraft: boolean;
    eventName: string;
}
export interface ProjectConfig {
    projectId: string;
    targetUrl: string;
    authConfig: AuthConfig | null;
    pr_analysis?: {
        enabled: boolean;
        target_branches: string[];
        skip_drafts: boolean;
        auto_commit_heals: boolean;
        min_tests_required: number;
    } | null;
    nightly?: NightlyConfig | null;
}
export interface AuthConfig {
    method: "none" | "credentials" | "setup_file";
    username?: string;
    password?: string;
    path?: string;
}
export interface StatusPayload {
    status: "running" | "completed" | "failed" | "skipped";
    github_action_run_id: string;
    mode: string;
    trigger: string;
    error?: string;
}
export interface AuditPayload {
    audit: AuditReport;
    github_action_run_id: string;
    mode: "audit";
    trigger: string;
}
export interface GeneratePayload {
    github_action_run_id: string;
    mode: "generate";
    trigger: "manual" | "schedule" | "auto";
    pr_url: string | null;
    pr_number: number | null;
    summary: GenerateSummary;
    tests: GenerateTestResult[];
}
export interface GenerateSummary {
    flows_attempted: number;
    tests_generated: number;
    tests_passing: number;
    tests_failed: number;
    total_heal_attempts: number;
    generation_time_ms: number;
    estimated_token_cost_usd: number;
}
export interface GenerateTestResult {
    flow_id: string;
    flow_name: string;
    priority: string;
    file_path: string;
    status: "passing" | "failed" | "excluded";
    heal_attempts: number;
    error?: string;
    normalized_error?: string;
}
export interface GenerateOptions {
    repoPath: string;
    targetUrl: string;
    anthropicApiKey: string;
    projectId: string;
    authConfig: AuthConfig | null;
    githubToken: string;
    githubRepository: string;
    maxFlows: number;
    auditData?: import("@agentic-nqa/core").AuditReport;
    apiBaseUrl: string;
    apiKey: string;
}
export interface PRAnalysisPayload {
    github_action_run_id: string;
    mode: "pr-analysis";
    trigger: "pr";
    pr_url: string;
    pr_number: number;
    summary: PRAnalysisSummary;
    tests: PRAnalysisTestResult[];
    mapping: PRAnalysisMappingStats;
}
export interface PRAnalysisSummary {
    files_changed: number;
    flows_affected: number;
    flows_definite: number;
    flows_likely: number;
    flows_unanalyzed: number;
    tests_run: number;
    tests_passed: number;
    tests_healed: number;
    tests_failed: number;
    total_heal_attempts: number;
    mapping_time_ms: number;
    execution_time_ms: number;
    healing_time_ms: number;
    total_time_ms: number;
    estimated_token_cost_usd: number;
}
export interface PRAnalysisTestResult {
    flow_id: string;
    flow_name: string;
    confidence: "definite" | "likely";
    file_path: string;
    status: "passed" | "healed" | "failed" | "skipped";
    heal_attempts: number;
    error?: string;
    normalized_error?: string;
    healed_diff?: string;
}
export interface PRAnalysisMappingStats {
    heuristic_matches: number;
    llm_escalations: number;
    unanalyzed_files: number;
    index_hit_rate: number;
}
export interface PRAnalysisConfig {
    enabled: boolean;
    target_branches: string[];
    skip_drafts: boolean;
    auto_commit_heals: boolean;
    min_tests_required: number;
}
export interface PRAnalysisOptions {
    targetUrl: string;
    anthropicApiKey: string;
    projectId: string;
    authConfig: AuthConfig | null;
    githubToken: string;
    githubRepository: string;
    apiBaseUrl: string;
    apiKey: string;
    prNumber: number;
    prUrl: string;
    prBaseBranch: string;
    prHeadBranch: string;
    prHeadSha: string;
    prIsFork: boolean;
    prIsDraft: boolean;
    dryRun: boolean;
}
export interface AffectedFlow {
    flow_id: string;
    flow_name: string;
    confidence: "definite" | "likely";
    test_file: string | null;
    matched_files: string[];
}
export interface FlowInventoryItem {
    id: string;
    name: string;
    description: string;
    priority: string;
    test_file: string | null;
}
export interface AuditDataExtended {
    gaps: object;
    coverage_map: object;
    last_audit_age_hours: number;
    generated_test_count: number;
    file_to_flow_index: Record<string, string[]> | null;
    flow_inventory: FlowInventoryItem[];
}
export interface NightlyConfig {
    enabled: boolean;
    schedule: string;
    max_flows: number;
    max_heal_attempts: number;
    timeout_minutes: number;
    learning_enabled: boolean;
}
export interface NightlyOptions {
    repoPath: string;
    targetUrl: string;
    anthropicApiKey: string;
    projectId: string;
    authConfig: AuthConfig | null;
    githubToken: string;
    githubRepository: string;
    apiBaseUrl: string;
    apiKey: string;
    config: NightlyConfig;
}
export interface NightlyPayload {
    github_action_run_id: string;
    mode: "nightly";
    trigger: "schedule" | "manual";
    pr_url: string | null;
    pr_number: number | null;
    summary: NightlySummary;
    healed_tests: NightlyHealResult[];
    new_tests: NightlyGenResult[];
}
export interface NightlySummary {
    tests_run: number;
    tests_passed: number;
    tests_healed: number;
    tests_failed: number;
    tests_generated: number;
    tests_generated_passing: number;
    flows_discovered: number;
    flows_new: number;
    total_heal_attempts: number;
    healing_time_ms: number;
    crawl_time_ms: number;
    generation_time_ms: number;
    total_time_ms: number;
    estimated_token_cost_usd: number;
    skipped_reason?: string;
}
export interface NightlyHealResult {
    flow_id: string;
    flow_name: string;
    file_path: string;
    status: "healed" | "failed";
    attempts: number;
    error?: string;
    normalized_error?: string;
}
export interface NightlyGenResult {
    flow_id: string;
    flow_name: string;
    file_path: string;
    priority: string;
    status: "passing" | "failed" | "excluded";
    heal_attempts: number;
    error?: string;
    normalized_error?: string;
}
export interface LockResult {
    acquired: boolean;
    run_id?: string;
    busy_mode?: string;
    busy_started_at?: string;
}
//# sourceMappingURL=types.d.ts.map