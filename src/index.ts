#!/usr/bin/env node
import { Command } from 'commander';
import { version } from '../package.json';
import { error } from './lib/logger';
import { initCommand } from './commands/init';
import { commitCommand } from './commands/commit';
import { chatCommand } from './commands/chat';
import { processCommand } from './commands/process';
import { tasksCommand } from './commands/tasks';
import { codeCommand } from './commands/code';
import { statusCommand } from './commands/status';

const main = async () => {
  try {
    const program = new Command();

    program
      .name('bro')
      .version(version)
      .description('A CLI for everything a bro needs');

    // Add commands
    program.addCommand(initCommand);
    // TODO: Fix command conflicts before re-enabling
    // program.addCommand(commitCommand);
    // program.addCommand(chatCommand);
    // program.addCommand(processCommand);
    // program.addCommand(tasksCommand);
    // program.addCommand(codeCommand);
    // program.addCommand(statusCommand);
    program.addCommand(chatCommand);
    program.addCommand(processCommand);
    program.addCommand(tasksCommand);
    program.addCommand(codeCommand);
    program.addCommand(statusCommand);

    program.parse(process.argv);
  } catch (e: any) {
    error(e.message);
    process.exit(1);
  }
};

main();

// Export the main classes for external use
export { BropilotCLI } from './cli';
export { BropilotDatabase } from './lib/database';
export { ProcessingEngine } from './lib/processor';