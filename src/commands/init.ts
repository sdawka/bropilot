import { Command } from 'commander';
import { log, error } from '../lib/logger';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

export const initCommand = new Command()
  .name('init')
  .description('Initialize a new application')
  .argument('<app_name>', 'Name of the application to create')
  .action(async (appName: string) => {
    try {
      log(`Initializing new application: ${appName}`);
      
      // Validate app name
      if (!isValidAppName(appName)) {
        error('Invalid app name. Use only letters, numbers, hyphens, and underscores.');
        process.exit(1);
      }

      // Check if directory already exists
      const targetPath = path.resolve(process.cwd(), appName);
      if (fs.existsSync(targetPath)) {
        error(`Directory "${appName}" already exists.`);
        process.exit(1);
      }

      // Create the application
      await createApplication(appName, targetPath);
      
      // Prompt for app purpose and create app.yaml
      const purpose = await promptForPurpose();
      await createAppYaml(appName, purpose, targetPath);
      
      log(`✅ Successfully created ${appName}!`);
      log(`\nNext steps:`);
      log(`  cd ${appName}`);
      log(`  # Start building your application`);
      
    } catch (err: any) {
      error(`Failed to initialize application: ${err.message}`);
      process.exit(1);
    }
  });

function isValidAppName(name: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(name);
}

function promptForPurpose(): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question('What is the purpose of this app? ', (answer) => {
      rl.close();
      resolve(answer.trim() || 'No purpose specified');
    });
  });
}

async function createAppYaml(appName: string, purpose: string, targetPath: string): Promise<void> {
  const metaPath = path.join(targetPath, '.meta');
  const appYamlContent = `application:
  name: ${appName}
  purpose: ${purpose}
`;

  fs.writeFileSync(path.join(metaPath, 'app.yaml'), appYamlContent);
  log(`📝 Created app.yaml with purpose: "${purpose}"`);
}

async function createApplication(appName: string, targetPath: string): Promise<void> {
  // Create main directory
  fs.mkdirSync(targetPath, { recursive: true });
  
  // Create .meta directory and files
  await createMetaFolder(appName, targetPath);
  
  // Create basic application structure
  await createBasicApp(appName, targetPath);
}

async function createMetaFolder(appName: string, targetPath: string): Promise<void> {
  // Create .meta directory
  const metaPath = path.join(targetPath, '.meta');
  fs.mkdirSync(metaPath, { recursive: true });

  // Create .meta.env file
  const metaEnvContent = `# Meta configuration for ${appName}
APP_NAME=${appName}
CREATED_AT=${new Date().toISOString()}
BRO_VERSION=1.0.0

# Database settings
DB_PATH=.meta/meta.db

# Environment
NODE_ENV=development
`;

  fs.writeFileSync(path.join(metaPath, '.meta.env'), metaEnvContent);

  // Create meta.db (SQLite database file) - we'll create an empty file for now
  fs.writeFileSync(path.join(metaPath, 'meta.db'), '');

  // Create migrations directory
  const migrationsPath = path.join(metaPath, 'migrations');
  fs.mkdirSync(migrationsPath, { recursive: true });

  // Create initial migration file
  const timestamp = new Date().toISOString().replace(/[-:T]/g, '').split('.')[0];
  const migrationFileName = `${timestamp}_initial_setup.sql`;
  
  const migrationContent = `-- Migration: Initial setup for ${appName}
-- Created: ${new Date().toISOString()}
-- Description: Sets up the initial database schema

-- TODO: Add your database schema here
-- Example:
-- CREATE TABLE IF NOT EXISTS projects (
--   id INTEGER PRIMARY KEY AUTOINCREMENT,
--   name TEXT NOT NULL,
--   description TEXT,
--   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
--   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
-- );

-- CREATE TABLE IF NOT EXISTS tasks (
--   id INTEGER PRIMARY KEY AUTOINCREMENT,
--   project_id INTEGER,
--   title TEXT NOT NULL,
--   description TEXT,
--   status TEXT DEFAULT 'pending',
--   created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
--   updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
--   FOREIGN KEY (project_id) REFERENCES projects(id)
-- );
`;

  fs.writeFileSync(path.join(migrationsPath, migrationFileName), migrationContent);

  // Create a README for the .meta folder
  const metaReadmeContent = `# .meta Directory

This directory contains metadata and configuration files for your ${appName} application.

## Files

- \`app.yaml\` - Application metadata (name, purpose)
- \`.meta.env\` - Environment variables specific to the meta system
- \`meta.db\` - SQLite database for application metadata
- \`migrations/\` - Database migration files

## Migrations

Migration files are named with a timestamp prefix to ensure proper ordering:
- Format: \`YYYYMMDDHHMMSS_description.sql\`
- Execute migrations in chronological order

## Usage

The bro CLI will use these files to manage your application's metadata and state.
`;

  fs.writeFileSync(path.join(metaPath, 'README.md'), metaReadmeContent);
}

async function createBasicApp(appName: string, targetPath: string): Promise<void> {
  // Create basic README.md
  const readmeContent = `# ${appName}

A new application created with bro CLI.

## Getting Started

This is a basic template. Start building your application from here.

## Meta Directory

The \`.meta/\` directory contains configuration and metadata for your application.
Check \`.meta/README.md\` for more information.
`;

  fs.writeFileSync(path.join(targetPath, 'README.md'), readmeContent);

  // Create .gitignore
  const gitignoreContent = `# Dependencies
node_modules/

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# OS
.DS_Store
Thumbs.db

# Meta files (sensitive)
.meta/meta.db
.meta/.meta.env
`;

  fs.writeFileSync(path.join(targetPath, '.gitignore'), gitignoreContent);
}
