import { readFile } from 'node:fs/promises';
import { Command } from 'commander';
import { createAgentContext } from '../setup.js';

export const statusCommand = new Command('status')
  .description('Show platform status, metrics, and experiment history')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    console.log('=== Agentic Ninja QA Platform — v0.1.0 ===\n');

    console.log('Agents:');
    console.log('  playwright-planner    App discovery → test plan');
    console.log(
      '  playwright-generator  Test plan → .spec.ts files (self-verifying)',
    );
    console.log('  playwright-healer     Auto-heal failing tests\n');

    console.log('Stack:');
    console.log(
      '  Browser:   playwright-cli (primary) + @playwright/mcp (fallback)',
    );
    console.log('  RAG:       Supabase pgvector');
    console.log('  LLM:       Anthropic Claude (Opus + Sonnet)');
    console.log('  Framework: Playwright Test 1.59\n');

    // Try to read last checkpoint
    try {
      const checkpoint = JSON.parse(
        await readFile('.anqa-checkpoint.json', 'utf-8'),
      );
      console.log('Last Improvement Run:');
      console.log(`  Cycle: ${checkpoint.currentCycle}`);
      console.log(`  Saved: ${checkpoint.savedAt}`);
      console.log(
        `  Baseline pass rate: ${(checkpoint.baselineMetrics?.passRate * 100).toFixed(1)}%\n`,
      );
    } catch {
      console.log('No improvement checkpoint found.\n');
    }

    console.log('Commands:');
    console.log('  anqa plan --url <url>         Analyze app → test plan');
    console.log('  anqa generate --plan <json>   Generate Playwright tests');
    console.log('  anqa heal --report <json>     Auto-heal failures');
    console.log('  anqa run --target <url>       Full pipeline');
    console.log(
      '  anqa improve --cycles <N>     Autoresearch improvement loop',
    );
    console.log('  anqa improve --overnight      Overnight mode (8h budget)');

    if (options.json) {
      try {
        const ctx = createAgentContext();
        const metrics = ctx.metrics.snapshot();
        console.log('\nMetrics (JSON):');
        console.log(JSON.stringify(metrics, null, 2));
      } catch {
        // Supabase not available
      }
    }
  });
