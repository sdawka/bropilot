import { Command } from 'commander';

export const commitCommand = new Command()
  .name('commit')
  .description('Create a new commit')
  .action(() => {
    console.log('Commit command is not implemented yet');
  });
