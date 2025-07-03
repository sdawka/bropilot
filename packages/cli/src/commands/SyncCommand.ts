/**
 * SyncCommand: CLI command for bidirectional sync between code and knowledge graph.
 * Supports: status, pull, push, history, rollback
 */

import { Command } from 'commander';
import { KnowledgeGraph } from 'bropilot-core/knowledgeGraph/KnowledgeGraph';
import { SyncManager, SyncOptions } from 'bropilot-core/sync/SyncManager';

export class SyncCommand {
  private kg: KnowledgeGraph;
  private syncManager: SyncManager;

  constructor(kg: KnowledgeGraph) {
    this.kg = kg;
    this.syncManager = new SyncManager(kg);
  }

  public register(program: Command) {
    program
      .command('sync <action>')
      .description('Bidirectional sync between code and knowledge graph')
      .option('--dry-run', 'Show changes without applying')
      .option('--force', 'Force apply changes')
      .option(
        '--modules <modules>',
        'Comma-separated list of modules/entities to sync',
      )
      .option('--to <syncPoint>', 'Rollback to a specific sync point')
      .action(async (action: string, options: any) => {
        await this.execute(action, options);
      });
  }

  public async execute(action: string, options: any): Promise<void> {
    const syncOptions: SyncOptions = {
      dryRun: options.dryRun,
      force: options.force,
      modules: options.modules ? options.modules.split(',') : undefined,
      to: options.to,
    };

    switch (action) {
      case 'status':
        await this.syncManager.getStatus(syncOptions);
        break;
      case 'pull':
        await this.syncManager.pull(syncOptions);
        break;
      case 'push':
        await this.syncManager.push(syncOptions);
        break;
      case 'history':
        await this.syncManager.showHistory(syncOptions);
        break;
      case 'rollback':
        if (!syncOptions.to) {
          console.error('Please specify --to <syncPoint> for rollback.');
          return;
        }
        await this.syncManager.rollback(syncOptions.to);
        break;
      default:
        console.error(`Unknown sync action: ${action}`);
    }
  }
}
