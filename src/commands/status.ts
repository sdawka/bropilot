import { Command } from 'commander';
import { BropilotCLI } from '../cli';

export const statusCommand = new Command('status')
  .description('Show project status')
  .action(async () => {
    const cli = new BropilotCLI();
    await cli.status();
  });
