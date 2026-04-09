// actions/anqa-action/src/diff-mapper.ts
import Anthropic from "@anthropic-ai/sdk";
import type {
  AffectedFlow,
  FlowInventoryItem,
  PRAnalysisMappingStats,
} from "./types.js";

interface ChangedFile {
  filename: string;
  patch: string;
}

interface HeuristicResult {
  matched: Array<{ filename: string; flow_ids: string[] }>;
  uncertain: ChangedFile[];
}

interface MapDiffOptions {
  changedFiles: ChangedFile[];
  fileToFlowIndex: Record<string, string[]> | null;
  flowInventory: FlowInventoryItem[];
  dryRun: boolean;
  anthropicApiKey: string;
}

interface MapDiffResult {
  affectedFlows: AffectedFlow[];
  stats: PRAnalysisMappingStats;
  mappingTimeMs: number;
}

const MAX_DIFF_LINES = 200;
const MAX_UNCERTAIN_PER_BATCH = 20;
const MAPPING_TIMEOUT_MS = 90_000;

export function truncateDiff(patch: string, maxLines: number): string {
  const lines = patch.split("\n");
  if (lines.length <= maxLines) return patch;
  return lines.slice(0, maxLines).join("\n") + "\n[truncated]";
}

export function heuristicMatch(
  changedFiles: ChangedFile[],
  index: Record<string, string[]>
): HeuristicResult {
  const matched: HeuristicResult["matched"] = [];
  const uncertain: ChangedFile[] = [];

  for (const file of changedFiles) {
    // Exact match
    if (index[file.filename]) {
      matched.push({ filename: file.filename, flow_ids: index[file.filename] });
      continue;
    }

    // Directory prefix match: check if any index key shares a directory prefix
    const fileDir = file.filename.substring(0, file.filename.lastIndexOf("/") + 1);
    const dirMatches: string[] = [];
    for (const [indexPath, flowIds] of Object.entries(index)) {
      const indexDir = indexPath.substring(0, indexPath.lastIndexOf("/") + 1);
      if (fileDir && indexDir && (fileDir.startsWith(indexDir) || indexDir.startsWith(fileDir))) {
        dirMatches.push(...flowIds);
      }
    }

    if (dirMatches.length > 0) {
      matched.push({ filename: file.filename, flow_ids: [...new Set(dirMatches)] });
    } else {
      uncertain.push(file);
    }
  }

  return { matched, uncertain };
}

async function llmEscalation(
  uncertainFiles: ChangedFile[],
  flowInventory: FlowInventoryItem[],
  anthropicApiKey: string
): Promise<Array<{ flow_id: string; reason: string }>> {
  const client = new Anthropic({ apiKey: anthropicApiKey });

  const fileDiffs = uncertainFiles
    .slice(0, MAX_UNCERTAIN_PER_BATCH)
    .map((f) => `### ${f.filename}\n\`\`\`\n${truncateDiff(f.patch, MAX_DIFF_LINES)}\n\`\`\``)
    .join("\n\n");

  const inventoryText = flowInventory
    .map((f) => `- ${f.id}: ${f.name} — ${f.description}`)
    .join("\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `Given the following code changes and application flow inventory, identify which flows are likely affected by these changes.\n\n## Changed Files\n${fileDiffs}\n\n## Flow Inventory\n${inventoryText}\n\nRespond with a JSON array of { "flow_id": string, "reason": string } objects. Only include flows that are likely affected. Be conservative.`,
      },
    ],
  });

  const text = response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }
}

export async function mapDiffToFlows(
  options: MapDiffOptions
): Promise<MapDiffResult> {
  const startTime = Date.now();
  const { changedFiles, fileToFlowIndex, flowInventory, dryRun, anthropicApiKey } = options;

  const index = fileToFlowIndex ?? {};
  const { matched, uncertain } = heuristicMatch(changedFiles, index);

  // Collect definite flows from heuristic matches
  const flowMap = new Map<string, AffectedFlow>();
  for (const m of matched) {
    for (const flowId of m.flow_ids) {
      const flow = flowInventory.find((f) => f.id === flowId);
      if (!flow) continue;
      if (!flowMap.has(flowId)) {
        flowMap.set(flowId, {
          flow_id: flowId,
          flow_name: flow.name,
          confidence: "definite",
          test_file: flow.test_file,
          matched_files: [],
        });
      }
      flowMap.get(flowId)!.matched_files.push(m.filename);
    }
  }

  let llmEscalations = 0;
  let unanalyzedFiles = 0;

  // LLM escalation for uncertain files (skip in dry-run and when no uncertain files)
  if (uncertain.length > 0 && !dryRun) {
    const elapsed = Date.now() - startTime;
    if (elapsed < MAPPING_TIMEOUT_MS) {
      try {
        const llmResults = await Promise.race([
          llmEscalation(uncertain, flowInventory, anthropicApiKey),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("mapping_timeout")), MAPPING_TIMEOUT_MS - elapsed)
          ),
        ]);

        llmEscalations = llmResults.length;

        for (const r of llmResults) {
          const flow = flowInventory.find((f) => f.id === r.flow_id);
          if (!flow) continue;
          if (!flowMap.has(r.flow_id)) {
            flowMap.set(r.flow_id, {
              flow_id: r.flow_id,
              flow_name: flow.name,
              confidence: "likely",
              test_file: flow.test_file,
              matched_files: [],
            });
          }
        }
        // Files beyond the batch limit are unanalyzed
        unanalyzedFiles = Math.max(0, uncertain.length - MAX_UNCERTAIN_PER_BATCH);
      } catch {
        // Timeout or error — mark all uncertain as unanalyzed
        unanalyzedFiles = uncertain.length;
      }
    } else {
      unanalyzedFiles = uncertain.length;
    }
  } else if (uncertain.length > 0 && dryRun) {
    // In dry-run, uncertain files stay unanalyzed (no LLM call)
    unanalyzedFiles = uncertain.length;
  }

  const heuristicMatches = matched.reduce((sum, m) => sum + m.flow_ids.length, 0);
  const totalIndexEntries = Object.keys(index).length;

  return {
    affectedFlows: Array.from(flowMap.values()),
    stats: {
      heuristic_matches: heuristicMatches,
      llm_escalations: llmEscalations,
      unanalyzed_files: unanalyzedFiles,
      index_hit_rate: totalIndexEntries > 0
        ? Math.round((matched.length / changedFiles.length) * 100)
        : 0,
    },
    mappingTimeMs: Date.now() - startTime,
  };
}
