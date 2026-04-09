import { readFile, readdir } from "node:fs/promises";
import { join, extname } from "node:path";
import type { RAGClient, KnowledgeType, Logger } from "@agentic-nqa/core";

export interface IngestionOptions {
  rag: RAGClient;
  logger?: Logger;
}

/**
 * Ingest markdown files from a directory into the RAG knowledge base.
 * Used to seed patterns, strategies, and app docs from the knowledge/ directory.
 */
export async function ingestDirectory(
  dirPath: string,
  type: KnowledgeType,
  options: IngestionOptions,
): Promise<number> {
  const { rag, logger } = options;
  let count = 0;

  const files = await readdir(dirPath, { recursive: true });

  for (const file of files) {
    const filePath = String(file);
    if (extname(filePath) !== ".md") continue;

    const fullPath = join(dirPath, filePath);
    const content = await readFile(fullPath, "utf-8");

    if (content.trim().length === 0) continue;

    // Split large files into chunks at heading boundaries
    const chunks = splitByHeadings(content);

    for (const chunk of chunks) {
      await rag.ingest({
        type,
        content: chunk.content,
        metadata: {
          source: filePath,
          heading: chunk.heading,
        },
      });
      count++;
    }

    logger?.info("Ingested file", { file: filePath, chunks: chunks.length });
  }

  logger?.info("Directory ingestion complete", {
    dir: dirPath,
    type,
    totalChunks: count,
  });

  return count;
}

interface ContentChunk {
  heading: string;
  content: string;
}

function splitByHeadings(markdown: string): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  const lines = markdown.split("\n");
  let currentHeading = "untitled";
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headingMatch) {
      if (currentContent.length > 0) {
        const content = currentContent.join("\n").trim();
        if (content.length > 0) {
          chunks.push({ heading: currentHeading, content });
        }
      }
      currentHeading = headingMatch[1];
      currentContent = [line];
    } else {
      currentContent.push(line);
    }
  }

  if (currentContent.length > 0) {
    const content = currentContent.join("\n").trim();
    if (content.length > 0) {
      chunks.push({ heading: currentHeading, content });
    }
  }

  return chunks;
}
