"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initCommand = void 0;
const commander_1 = require("commander");
const logger_1 = require("../lib/logger");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const readline = __importStar(require("readline"));
exports.initCommand = new commander_1.Command()
    .name('init')
    .description('Initialize a new application')
    .argument('<app_name>', 'Name of the application to create')
    .action((appName) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        (0, logger_1.log)(`Initializing new application: ${appName}`);
        // Validate app name
        if (!isValidAppName(appName)) {
            (0, logger_1.error)('Invalid app name. Use only letters, numbers, hyphens, and underscores.');
            process.exit(1);
        }
        // Check if directory already exists
        const targetPath = path.resolve(process.cwd(), appName);
        if (fs.existsSync(targetPath)) {
            (0, logger_1.error)(`Directory "${appName}" already exists.`);
            process.exit(1);
        }
        // Create the application
        yield createApplication(appName, targetPath);
        // Prompt for app purpose and create app.yaml
        const purpose = yield promptForPurpose();
        yield createAppYaml(appName, purpose, targetPath);
        (0, logger_1.log)(`✅ Successfully created ${appName}!`);
        (0, logger_1.log)(`\nNext steps:`);
        (0, logger_1.log)(`  cd ${appName}`);
        (0, logger_1.log)(`  # Start building your application`);
    }
    catch (err) {
        (0, logger_1.error)(`Failed to initialize application: ${err.message}`);
        process.exit(1);
    }
}));
function isValidAppName(name) {
    return /^[a-zA-Z0-9_-]+$/.test(name);
}
function promptForPurpose() {
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
function createAppYaml(appName, purpose, targetPath) {
    return __awaiter(this, void 0, void 0, function* () {
        const metaPath = path.join(targetPath, '.meta');
        const appYamlContent = `application:
  name: ${appName}
  purpose: ${purpose}
`;
        fs.writeFileSync(path.join(metaPath, 'app.yaml'), appYamlContent);
        (0, logger_1.log)(`📝 Created app.yaml with purpose: "${purpose}"`);
    });
}
function createApplication(appName, targetPath) {
    return __awaiter(this, void 0, void 0, function* () {
        // Create main directory
        fs.mkdirSync(targetPath, { recursive: true });
        // Create .meta directory and files
        yield createMetaFolder(appName, targetPath);
        // Create basic application structure
        yield createBasicApp(appName, targetPath);
    });
}
function createMetaFolder(appName, targetPath) {
    return __awaiter(this, void 0, void 0, function* () {
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
    });
}
function createBasicApp(appName, targetPath) {
    return __awaiter(this, void 0, void 0, function* () {
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
    });
}
