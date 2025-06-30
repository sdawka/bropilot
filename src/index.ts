#!/usr/bin/env node
import { Command } from 'commander';
import { version } from '../package.json';
import { error } from './lib/logger';
import { initCommand } from './commands/init';
import { commitCommand } from './commands/commit';

const main = async () => {
  try {
    const program = new Command();

    program
      .name('bro')
      .version(version)
      .description('A CLI for everything a bro needs');

    // Add commands
    program.addCommand(initCommand);
    program.addCommand(commitCommand);

    program.parse(process.argv);
  } catch (e: any) {
    error(e.message);
    process.exit(1);
  }
};

main();