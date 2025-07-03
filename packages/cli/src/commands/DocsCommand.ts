import { Command } from 'commander';
import chalk from 'chalk';
import { AppDatabase } from 'bropilot-core/database/Database';
import { KnowledgeGraph } from 'bropilot-core/knowledgeGraph/KnowledgeGraph';
import { DocsManager, GenerateOptions } from 'bropilot-core/yamlgen/index';
import { ConfigManager } from '../config.js';
import * as path from 'path';
import * as fs from 'fs-extra';

export class DocsCommand {
  private db: AppDatabase;
  private kg: KnowledgeGraph;
  private docsManager: DocsManager;
  private configManager: ConfigManager;

  constructor(
    db: AppDatabase,
    kg: KnowledgeGraph,
    configManager: ConfigManager,
  ) {
    this.db = db;
    this.kg = kg;
    this.configManager = configManager;
    const docsDir =
      process.env.BRO_DOCS_DIR || path.join(process.cwd(), '.bro', 'docs'); // Allow override for tests
    this.docsManager = new DocsManager(docsDir);
  }

  register(program: Command) {
    program
      .command('docs <action>')
      .alias('d')
      .description('Manage documentation')
      .option(
        '-o, --only <types...>',
        'Generate only specific document types (e.g., application, modules)',
      )
      .option('-f, --force', 'Force generation even if no changes detected')
      .option('-d, --dry-run', 'Perform a dry run without writing files')
      .option('--diff', 'Show a diff preview before writing changes')
      .option('-b, --backup', 'Backup previous versions before overwriting')
      .option(
        '-p, --parallel',
        'Enable parallel generation for better performance',
      )
      .option('--docs-dir <path>', 'Override the docs directory (for testing)')
      .option('--db-path <path>', 'Override the database path (for testing)')
      .action(
        async (
          action: string,
          options: GenerateOptions & { docsDir?: string; dbPath?: string },
        ) => {
          try {
            if (options.docsDir) {
              // Re-initialize docsManager with the provided directory
              this.docsManager = new DocsManager(options.docsDir);
            }
            if (options.dbPath) {
              process.env.BRO_DB_PATH = options.dbPath;
            }
            await this.execute(action, options);
          } catch (error: any) {
            console.error(
              chalk.red(`Error executing docs command: ${error.message}`),
            );
            process.exit(1);
          }
        },
      );
  }

  async execute(action: string, options: GenerateOptions): Promise<void> {
    switch (action) {
      case 'generate':
        await this.generate(options);
        break;
      case 'validate':
        await this.validateDocs(options);
        break;
      case 'status':
        await this.showStatus();
        break;
      default:
        throw new Error(`Unknown docs action: ${action}`);
    }
  }

  private async generate(options: GenerateOptions): Promise<void> {
    console.log(chalk.blue(`Generating documents...`));
    const results = await this.docsManager.generate(this.kg, options);
    this.displayResults(results);
  }

  private async validateDocs(options: GenerateOptions): Promise<void> {
    console.log(chalk.blue(`Validating documents...`));
    const results = await this.docsManager.validate();
    console.log(chalk.cyan('\n--- Document Validation Results ---'));
    results.forEach((result) => {
      let statusStr: string;
      let statusColor: (str: string) => string;
      if (result.missing) {
        statusStr = 'missing';
        statusColor = chalk.yellow;
      } else if (result.valid) {
        statusStr = 'valid';
        statusColor = chalk.green;
      } else {
        statusStr = 'invalid';
        statusColor = chalk.red;
      }
      console.log(
        `${statusColor(result.type.padEnd(15))} ${statusColor(statusStr)}`,
      );
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach((error) =>
          console.error(chalk.red(`  - ${error}`)),
        );
      }
    });
    console.log(chalk.cyan('-----------------------------------\n'));
  }

  private async showStatus(): Promise<void> {
    // Debug: print docsDir and file paths being checked
    if (typeof (this.docsManager as any).getDocsDir === 'function') {
      console.log(
        'DocsCommand: docsDir =',
        (this.docsManager as any).getDocsDir(),
      );
      for (const filePath of (this.docsManager as any).getAllDocumentPaths()) {
        console.log('DocsCommand: checking', filePath);
      }
    }
    console.log(chalk.blue(`Showing document status...`));
    // Implement document status logic (show changed, unchanged, missing)
    const statuses = await this.docsManager.getStatus(this.kg);
    for (const { type, status } of statuses) {
      let color = chalk.gray;
      let statusLabel = status;
      if (status === 'changed') {
        color = chalk.yellow;
        statusLabel = 'changed';
      } else if (status === 'missing') {
        color = chalk.red;
        statusLabel = 'missing';
      } else if (status === 'unchanged') {
        color = chalk.green;
        statusLabel = 'unchanged';
      }
      // Always print the status label in plain text for test matching
      console.log(`${type.padEnd(15)} ${statusLabel}`);
    }
  }

  private displayResults(results: {
    results: Array<{ type: string; status: string; errors?: string[] }>;
    timestamp: number;
  }) {
    console.log(chalk.cyan('\n--- Document Generation Summary ---'));
    results.results.forEach((result) => {
      const statusColor = result.status === 'success' ? chalk.green : chalk.red;
      console.log(`${statusColor(result.type.padEnd(15))} ${result.status}`);
      if (result.errors && result.errors.length > 0) {
        result.errors.forEach((error) =>
          console.error(chalk.red(`  - ${error}`)),
        );
      }
    });
    console.log(chalk.cyan('-----------------------------------\n'));
  }
}
