#!/usr/bin/env node
import { Command } from 'commander';
import chalk from 'chalk';
import { ConfigManager, type BroConfig } from './config.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { InitCommand } from './commands/InitCommand.js';
import { ProcessCommand } from './commands/ProcessCommand.js';
import { GenerateCommand } from './commands/GenerateCommand.js'; // Import GenerateCommand
import { AppDatabase } from 'bropilot-core/database/Database';
import { KnowledgeGraph } from 'bropilot-core/knowledgeGraph/KnowledgeGraph';
import { PromptManager } from 'bropilot-core/llm/PromptManager';
import { PromptTemplateRepository } from 'bropilot-core/llm/PromptTemplateRepository';
import { DocsCommand } from './commands/DocsCommand.js';
import { ReleaseCommand } from './commands/ReleaseCommand.js';
import { ReleaseRepository } from 'bropilot-core/repositories/ReleaseRepository';
import { SyncCommand } from './commands/SyncCommand.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJsonPath = path.resolve(__dirname, '../package.json');
const { version } = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

interface GlobalOptions {
  verbose?: boolean;
  quiet?: boolean;
  config?: string;
}

const configManager = ConfigManager.getInstance();

interface InitCommandOptions extends GlobalOptions {
  template?: string;
  noGit?: boolean;
  force?: boolean;
}

interface ChatCommandOptions extends GlobalOptions {
  continue?: boolean;
  import?: string;
}

type DocsCommandOptions = GlobalOptions;
type ReleaseCommandOptions = GlobalOptions;
type WorkCommandOptions = GlobalOptions;
type SyncCommandOptions = GlobalOptions;
type ConfigCommandOptions = GlobalOptions;

const program = new Command();

program
  .name('bro')
  .description('Self-aware application development CLI')
  .version(version)
  .option('-v, --verbose', 'verbose output')
  .option('-q, --quiet', 'suppress non-error output')
  .option('--config <path>', 'custom config file location');

// Subcommands
program
  .command('init <app-name>')
  .alias('i')
  .description('Initialize a new Bropilot application')
  .option('-t, --template <template>', 'project template', 'default')
  .option('--no-git', 'skip git initialization')
  .option('-f, --force', 'force initialization even in existing projects')
  .action(async (appName: string, options: InitCommandOptions) => {
    const initCommand = new InitCommand();
    try {
      await initCommand.execute(appName, options);
      console.log(
        chalk.green(`Bropilot project '${appName}' initialized successfully!`),
      );
    } catch (error: any) {
      console.error(chalk.red(`Error initializing project: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('chat')
  .alias('c')
  .description('Start an interactive chat session')
  .option('--continue', 'resume previous session')
  .option('--import <file>', 'import requirements from file')
  .action(async (options: ChatCommandOptions) => {
    console.log('Starting interactive chat session...');
    if (options.continue) {
      console.log('Resuming previous session.');
    }
    if (options.import) {
      console.log(`Importing requirements from: ${options.import}`);
    }
    // Implementation
  });

// Instantiate dependencies for ProcessCommand
// Determine DB path from CLI option, env, or default
let dbPath = process.env.BRO_DB_PATH;
const globalOpts = program.opts();
if (globalOpts.dbPath) dbPath = globalOpts.dbPath;
const db = new AppDatabase(dbPath);
const kg = new KnowledgeGraph(db);
const promptTemplateRepo = new PromptTemplateRepository(db); // Assuming PromptTemplateRepository needs db
const promptManager = new PromptManager(promptTemplateRepo);

// Instantiate and register ProcessCommand
const processCommand = new ProcessCommand(db, kg, promptManager);
processCommand.register(program);

// Instantiate and register GenerateCommand
const generateCommand = new GenerateCommand(db, kg);
generateCommand.register(program);

// Instantiate and register DocsCommand
const docsCommand = new DocsCommand(db, kg, configManager);
docsCommand.register(program);

// Instantiate and register ReleaseCommand
const releaseRepo = new ReleaseRepository(db.getDB());
const releaseCommand = new ReleaseCommand(kg, releaseRepo);
releaseCommand.register(program);

// Instantiate and register SyncCommand
const syncCommand = new SyncCommand(kg);
syncCommand.register(program);

program
  .command('work <action>')
  .alias('w')
  .description('Execute work plans')
  .action(async (action: string) => {
    console.log(`Executing work plans: ${action}`);
    // Implementation
  });

program
  .command('status')
  .description('Show project status')
  .action(async () => {
    console.log('Showing project status...');
    // Implementation
  });

program
  .command('config <key> [value]')
  .description('Get/set configuration')
  .action(async (key: keyof BroConfig, value?: string) => {
    if (value) {
      try {
        let parsedValue: any = value;
        // Attempt to parse value if it's a boolean or JSON string
        if (value === 'true') parsedValue = true;
        else if (value === 'false') parsedValue = false;
        else if (value.startsWith('{') && value.endsWith('}')) {
          try {
            parsedValue = JSON.parse(value);
          } catch (e) {
            // Not a valid JSON, treat as string
          }
        }
        configManager.set(key, parsedValue);
        console.log(
          chalk.green(
            `Config key '${String(key)}' set to '${JSON.stringify(configManager.get(key))}'`,
          ),
        );
      } catch (error: any) {
        console.error(
          chalk.red(
            `Failed to set config key '${String(key)}': ${error.message}`,
          ),
        );
      }
    } else {
      const retrievedValue = configManager.get(key);
      if (retrievedValue !== undefined) {
        console.log(
          chalk.blue(
            `Config key '${String(key)}': ${JSON.stringify(retrievedValue)}`,
          ),
        );
      } else {
        console.log(chalk.yellow(`Config key '${String(key)}' not found.`));
      }
    }
  });

program
  .command('completion')
  .description('Generate shell completion script')
  .action(() => {
    program.outputHelp({ error: true }); // This will output the completion script if configured
  });

function setupGlobalErrorHandling(
  program: Command,
  configManager: ConfigManager,
  chalk: any,
) {
  process.on('unhandledRejection', (err: Error) => {
    console.error(chalk.red('Error:'), err.message);
    const globalOpts = program.opts() as GlobalOptions;
    if (globalOpts.verbose) {
      console.error(err.stack);
    }
    // Ensure config is saved on exit if autoSave is true
    if (configManager.get('autoSave')) {
      configManager.save({}); // Save current state
    }
    process.exit(1);
  });
}

// Call this function when the CLI is actually run, not when imported for testing
// setupGlobalErrorHandling(program, configManager, chalk); // Commented out for testing

export { program, setupGlobalErrorHandling };
