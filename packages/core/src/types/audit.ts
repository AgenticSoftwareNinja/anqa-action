export interface RepoAnalysis {
  framework: FrameworkInfo;
  existingTests: ExistingTestFile[];
  ciConfig: CIConfigInfo;
  aiSetup: AISetupInfo;
  analyzedAt: string;
}

export interface FrameworkInfo {
  name: string;
  version: string;
  language: "typescript" | "javascript" | "unknown";
  testFramework?: string;
  testFrameworkVersion?: string;
  hasPlaywright: boolean;
  hasCypress: boolean;
}

export interface ExistingTestFile {
  path: string;
  type: "e2e" | "integration" | "unit" | "unknown";
  framework: string;
  descriptions: string[];
}

export interface CIConfigInfo {
  hasGitHubActions: boolean;
  workflowFiles: string[];
  hasTestStep: boolean;
  hasDeployStep: boolean;
}

export interface AISetupInfo {
  hasClaude: boolean;
  hasCopilot: boolean;
  hasCursor: boolean;
  configFiles: string[];
}

export interface CoverageMap {
  flows: FlowCoverage[];
  summary: CoverageSummary;
  evaluatedAt: string;
}

export interface FlowCoverage {
  flowId: string;
  flowName: string;
  priority: "critical" | "high" | "medium" | "low";
  status: "covered" | "partial" | "uncovered";
  matchedTests: string[];
  confidence: number;
}

export interface CoverageSummary {
  totalFlows: number;
  coveredFlows: number;
  partialFlows: number;
  uncoveredFlows: number;
  coveragePercent: number;
}

export interface AuditReport {
  projectId?: string;
  repoAnalysis: RepoAnalysis;
  flowInventory: import("./test-plan.js").TestFlow[];
  coverageMap: CoverageMap;
  gaps: AuditGap[];
  proposedTests: ProposedTest[];
  createdAt: string;
}

export interface AuditGap {
  flowId: string;
  flowName: string;
  priority: "critical" | "high" | "medium" | "low";
  reason: string;
}

export interface ProposedTest {
  flowId: string;
  flowName: string;
  priority: "critical" | "high" | "medium" | "low";
  description: string;
  estimatedComplexity: "simple" | "moderate" | "complex";
}
