import { Command } from 'commander';
import { BropilotCLI } from '../cli';

export const tasksCommand = new Command('tasks')
  .option('-f, --feature <name>', 'Specific feature name')
  .description('Generate tasks from features')
  .action(async (options) => {
    const cli = new BropilotCLI();
    await cli.tasks(options.feature);
  });
