import { readFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";
import type {
  AgentContext,
  AISetupInfo,
  CIConfigInfo,
  ExistingTestFile,
  FrameworkInfo,
  RepoAnalysis,
  Skill,
} from "@agentic-nqa/core";

// ---------------------------------------------------------------------------
// Framework detection
// ---------------------------------------------------------------------------

async function detectFramework(repoPath: string): Promise<FrameworkInfo> {
  const pkgPath = join(repoPath, "package.json");
  let pkg: Record<string, unknown> = {};

  try {
    const raw = await readFile(pkgPath, "utf-8");
    pkg = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // No package.json or unreadable — return unknown
    return {
      name: "unknown",
      version: "unknown",
      language: "unknown",
      hasPlaywright: false,
      hasCypress: false,
    };
  }

  const allDeps: Record<string, string> = {
    ...((pkg["dependencies"] as Record<string, string>) ?? {}),
    ...((pkg["devDependencies"] as Record<string, string>) ?? {}),
  };

  const has = (dep: string) => dep in allDeps;

  // Detect primary framework (order matters — more specific first)
  const frameworkCandidates: Array<[string, string]> = [
    ["next", "next"],
    ["react", "react"],
    ["@angular/core", "angular"],
    ["vue", "vue"],
    ["svelte", "svelte"],
    ["fastify", "fastify"],
    ["hono", "hono"],
    ["express", "express"],
  ];

  let frameworkName = "unknown";
  let frameworkVersion = "unknown";

  for (const [dep, name] of frameworkCandidates) {
    if (has(dep)) {
      frameworkName = name;
      frameworkVersion = allDeps[dep] ?? "unknown";
      break;
    }
  }

  // Detect language
  const language: FrameworkInfo["language"] = has("typescript")
    ? "typescript"
    : "javascript";

  // Detect test framework
  const testFrameworkCandidates: Array<[string, string]> = [
    ["vitest", "vitest"],
    ["jest", "jest"],
    ["mocha", "mocha"],
    ["@playwright/test", "playwright"],
    ["playwright", "playwright"],
    ["cypress", "cypress"],
  ];

  let testFramework: string | undefined;
  let testFrameworkVersion: string | undefined;

  for (const [dep, name] of testFrameworkCandidates) {
    if (has(dep)) {
      testFramework = name;
      testFrameworkVersion = allDeps[dep];
      break;
    }
  }

  const hasPlaywright =
    has("@playwright/test") || has("playwright") || has("playwright-core");
  const hasCypress = has("cypress");

  return {
    name: frameworkName,
    version: frameworkVersion,
    language,
    ...(testFramework !== undefined ? { testFramework } : {}),
    ...(testFrameworkVersion !== undefined ? { testFrameworkVersion } : {}),
    hasPlaywright,
    hasCypress,
  };
}

// ---------------------------------------------------------------------------
// Test file discovery
// ---------------------------------------------------------------------------

const TEST_PATTERNS = [
  /\.spec\.ts$/,
  /\.test\.ts$/,
  /\.spec\.js$/,
  /\.test\.js$/,
];

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".turbo", ".next"]);

async function walkDir(
  dir: string,
  depth: number,
  maxDepth: number,
): Promise<string[]> {
  if (depth > maxDepth) return [];

  let entries: Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }>;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const results: string[] = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const subResults = await walkDir(join(dir, entry.name), depth + 1, maxDepth);
      results.push(...subResults);
    } else if (entry.isFile()) {
      const isTestFile = TEST_PATTERNS.some((p) => p.test(entry.name));
      if (isTestFile) {
        results.push(join(dir, entry.name));
      }
    }
  }

  return results;
}

function extractDescriptions(content: string): string[] {
  const descriptions: string[] = [];
  // Match describe(...), test.describe(...), it(...), test(...)
  const regex =
    /(?:describe|test\.describe|it|test)\s*\(\s*["'`]([^"'`]+)["'`]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match[1]) {
      descriptions.push(match[1]);
    }
  }
  return descriptions;
}

function classifyTestFile(filePath: string): ExistingTestFile["type"] {
  const lower = filePath.toLowerCase();
  if (lower.includes("/e2e/") || lower.includes(".e2e.")) return "e2e";
  if (
    lower.includes("/integration/") ||
    lower.includes(".integration.")
  )
    return "integration";
  if (lower.includes("/unit/") || lower.includes(".unit.")) return "unit";
  return "unknown";
}

async function discoverTests(repoPath: string): Promise<ExistingTestFile[]> {
  const filePaths = await walkDir(repoPath, 0, 5);
  const results: ExistingTestFile[] = [];

  for (const filePath of filePaths) {
    let content = "";
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      // skip unreadable files
    }

    const descriptions = extractDescriptions(content);
    const type = classifyTestFile(filePath);

    // Detect framework from imports/requires in the file
    let framework = "unknown";
    if (content.includes("@playwright/test") || content.includes("playwright")) {
      framework = "playwright";
    } else if (content.includes("cypress")) {
      framework = "cypress";
    } else if (content.includes("vitest")) {
      framework = "vitest";
    } else if (content.includes("jest") || content.includes("@jest/")) {
      framework = "jest";
    } else if (content.includes("mocha")) {
      framework = "mocha";
    }

    results.push({ path: filePath, type, framework, descriptions });
  }

  return results;
}

// ---------------------------------------------------------------------------
// CI config detection
// ---------------------------------------------------------------------------

async function detectCIConfig(repoPath: string): Promise<CIConfigInfo> {
  const workflowsDir = join(repoPath, ".github", "workflows");

  let hasGitHubActions = false;
  let workflowFiles: string[] = [];
  let hasTestStep = false;
  let hasDeployStep = false;

  try {
    await access(workflowsDir);
    hasGitHubActions = true;

    const entries = await readdir(workflowsDir, { withFileTypes: true });
    const ymlFiles = entries
      .filter(
        (e) =>
          e.isFile() &&
          (e.name.endsWith(".yml") || e.name.endsWith(".yaml")),
      )
      .map((e) => e.name);

    workflowFiles = ymlFiles;

    for (const fileName of ymlFiles) {
      try {
        const content = await readFile(join(workflowsDir, fileName), "utf-8");
        if (content.includes("test")) hasTestStep = true;
        if (content.includes("deploy")) hasDeployStep = true;
      } catch {
        // skip unreadable workflow files
      }
    }
  } catch {
    // .github/workflows doesn't exist
  }

  return { hasGitHubActions, workflowFiles, hasTestStep, hasDeployStep };
}

// ---------------------------------------------------------------------------
// AI setup detection
// ---------------------------------------------------------------------------

async function detectAISetup(repoPath: string): Promise<AISetupInfo> {
  const candidates: Array<{ path: string; type: "claude" | "copilot" | "cursor" }> = [
    { path: join(repoPath, ".claude"), type: "claude" },
    { path: join(repoPath, "CLAUDE.md"), type: "claude" },
    { path: join(repoPath, ".copilot"), type: "copilot" },
    {
      path: join(repoPath, ".github", "copilot-instructions.md"),
      type: "copilot",
    },
    { path: join(repoPath, ".cursor"), type: "cursor" },
    { path: join(repoPath, ".cursorrules"), type: "cursor" },
  ];

  let hasClaude = false;
  let hasCopilot = false;
  let hasCursor = false;
  const configFiles: string[] = [];

  for (const candidate of candidates) {
    try {
      await access(candidate.path);
      if (candidate.type === "claude") hasClaude = true;
      if (candidate.type === "copilot") hasCopilot = true;
      if (candidate.type === "cursor") hasCursor = true;
      configFiles.push(candidate.path);
    } catch {
      // path does not exist
    }
  }

  return { hasClaude, hasCopilot, hasCursor, configFiles };
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function scanRepository(repoPath: string): Promise<RepoAnalysis> {
  const [framework, existingTests, ciConfig, aiSetup] = await Promise.all([
    detectFramework(repoPath),
    discoverTests(repoPath),
    detectCIConfig(repoPath),
    detectAISetup(repoPath),
  ]);

  return {
    framework,
    existingTests,
    ciConfig,
    aiSetup,
    analyzedAt: new Date().toISOString(),
  };
}

export const repoScannerSkill: Skill = {
  name: "repo-scanner",
  description:
    "Scan a repository for framework, tests, CI config, and AI setup",
  async execute(_ctx: AgentContext, input: unknown): Promise<RepoAnalysis> {
    const { repoPath } = input as { repoPath: string };
    return scanRepository(repoPath);
  },
};
