import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { Command } from 'commander';
import { deriveAppName, parsePlaywrightReport } from '@agentic-nqa/core';
import { PlannerAgent } from '@agentic-nqa/planner';
import { GeneratorAgent } from '@agentic-nqa/generator';
import { HealerAgent } from '@agentic-nqa/healer';
import { createAgentContext } from '../setup.js';
const exec = promisify(execFile);
export const runCommand = new Command('run')
    .description('Run full pipeline: plan → generate → test → heal')
    .requiredOption('-t, --target <url>', 'Target app URL')
    .option('-n, --name <name>', 'Target app name')
    .option('--skip-heal', 'Skip healing step on failures')
    .option('--depth <number>', 'Crawl depth', '3')
    .action(async (options) => {
    const appName = options.name ?? deriveAppName(options.target);
    console.log(`\n=== Agentic Ninja QA Pipeline ===`);
    console.log(`Target: ${options.target} (${appName})\n`);
    const ctx = createAgentContext();
    // Step 1: Plan
    console.log('--- Step 1: Planning ---');
    const planner = new PlannerAgent();
    await planner.init(ctx);
    const planTask = {
        id: `plan-${Date.now()}`,
        type: 'plan',
        targetApp: { name: appName, url: options.target },
        input: { maxDepth: parseInt(options.depth, 10) },
    };
    const planResult = await planner.execute(await planner.plan(planTask));
    if (planResult.status === 'failure') {
        console.error('Planning failed:', planResult.errors?.[0]?.message);
        process.exit(1);
    }
    const testPlan = planResult.outputs.testPlan;
    console.log(`Planned ${testPlan.flows.length} test flows\n`);
    // Save plan
    await mkdir('plans', { recursive: true });
    const planPath = join('plans', `${appName}.json`);
    await writeFile(planPath, JSON.stringify(testPlan, null, 2));
    // Step 2: Generate
    console.log('--- Step 2: Generating Tests ---');
    const generator = new GeneratorAgent();
    await generator.init(ctx);
    const genTask = {
        id: `gen-${Date.now()}`,
        type: 'generate',
        targetApp: { name: appName, url: options.target },
        input: { testPlan },
    };
    const genResult = await generator.execute(await generator.plan(genTask));
    console.log(`Generated: ${genResult.outputs.totalPassed}/${genResult.outputs.totalGenerated} passing\n`);
    // Step 3: Run tests
    console.log('--- Step 3: Running Tests ---');
    try {
        const testDir = join('generated', 'tests', appName);
        const { stdout } = await exec('npx', [
            'playwright',
            'test',
            testDir,
            '--reporter=json',
            `--output=test-results`,
        ], {
            timeout: 120_000,
            env: { ...process.env, TARGET_URL: options.target },
        });
        const resultsPath = 'test-results/results.json';
        await writeFile(resultsPath, stdout);
        console.log(`Test results saved to ${resultsPath}\n`);
    }
    catch (error) {
        console.log('Some tests failed\n');
    }
    // Step 4: Heal (optional)
    if (!options.skipHeal) {
        console.log('--- Step 4: Healing Failures ---');
        try {
            const resultsContent = await readFile('test-results/results.json', 'utf-8');
            const report = JSON.parse(resultsContent);
            const healer = new HealerAgent();
            await healer.init(ctx);
            const healTask = {
                id: `heal-${Date.now()}`,
                type: 'heal',
                targetApp: { name: appName, url: options.target },
                input: {
                    failedTests: parsePlaywrightReport(report).filter((r) => r.status === 'failed'),
                },
            };
            const healResult = await healer.execute(await healer.plan(healTask));
            console.log(`Healed: ${healResult.outputs.healed}, App bugs: ${healResult.outputs.appBugs}\n`);
        }
        catch {
            console.log('No failures to heal or results unavailable\n');
        }
    }
    console.log('=== Pipeline Complete ===');
    await ctx.browser.close();
});
//# sourceMappingURL=run.js.map