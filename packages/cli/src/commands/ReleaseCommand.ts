// ReleaseCommand: CLI interface for release management

import { Command } from 'commander';
import {
  ReleaseManager,
  ReleaseManagerOptions,
} from 'bropilot-core/ReleaseManager';
import { KnowledgeGraph } from 'bropilot-core/knowledgeGraph/KnowledgeGraph';
import { ReleaseRepository } from 'bropilot-core/repositories/ReleaseRepository';

export class ReleaseCommand {
  kg: KnowledgeGraph;
  releaseRepo: ReleaseRepository;
  releaseManager: ReleaseManager;

  constructor(kg: KnowledgeGraph, releaseRepo: ReleaseRepository) {
    this.kg = kg;
    this.releaseRepo = releaseRepo;
    this.releaseManager = new ReleaseManager(kg, releaseRepo);
  }

  register(program: Command) {
    program
      .command('release <action> [version]')
      .description(
        'Manage releases (create, list, show, compare, finalize, rollback)',
      )
      .option('-f, --force', 'Force operation')
      .option('--tag', 'Create git tag')
      .option('--with <otherVersion>', 'For compare: version to compare with')
      .action(async (action: string, version?: string, options?: any) => {
        await this.execute(action, version, options);
      });
  }

  async execute(
    action: string,
    version?: string,
    options?: ReleaseManagerOptions,
  ): Promise<void> {
    switch (action) {
      case 'create':
        await this.releaseManager.createRelease(version!, options || {});
        break;
      case 'compare':
        if (!options?.with)
          throw new Error('Specify --with <otherVersion> for compare');
        await this.releaseManager.compareReleases(version!, options.with);
        break;
      case 'finalize':
        await this.releaseManager.finalizeRelease(version!);
        break;
      case 'rollback':
        await this.releaseManager.rollbackRelease(version!);
        break;
      default:
        throw new Error(`Unknown release action: ${action}`);
    }
  }
}
