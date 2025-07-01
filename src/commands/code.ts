import { Command } from 'commander';
import { BropilotCLI } from '../cli';

export const codeCommand = new Command('code')
  .option('-t, --task <id>', 'Specific task ID')
  .description('Generate code from tasks')
  .action(async (options) => {
    const cli = new BropilotCLI();
    await cli.code(options.task);
  });
