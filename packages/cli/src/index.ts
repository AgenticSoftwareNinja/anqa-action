#!/usr/bin/env node

import { Command } from 'commander';
import { planCommand } from './commands/plan.js';
import { generateCommand } from './commands/generate.js';
import { healCommand } from './commands/heal.js';
import { runCommand } from './commands/run.js';
import { improveCommand } from './commands/improve.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('anqa')
  .description('Agentic Ninja QA — AI-powered Playwright test platform')
  .version('0.1.0');

program.addCommand(planCommand);
program.addCommand(generateCommand);
program.addCommand(healCommand);
program.addCommand(runCommand);
program.addCommand(improveCommand);
program.addCommand(statusCommand);

program.parse();
