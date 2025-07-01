import { Command } from 'commander';
import { BropilotCLI } from '../cli';

export const processCommand = new Command('process')
  .description('Process chats into features')
  .action(async () => {
    const cli = new BropilotCLI();
    await cli.process();
  });
