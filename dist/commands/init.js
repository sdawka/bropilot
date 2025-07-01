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
const database_1 = require("../lib/database");
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
        (0, logger_1.log)(`\n🚀 Your application is ready!`);
        (0, logger_1.log)(`\nNext steps:`);
        (0, logger_1.log)(`  cd ${appName}`);
        (0, logger_1.log)(`  export OPENAI_API_KEY=your_api_key_here  # Required for AI processing`);
        (0, logger_1.log)(`  bro chat "project-planning"               # Start describing your app`);
        (0, logger_1.log)(`  bro status                                # Check project status anytime`);
        (0, logger_1.log)(`\n💡 Tip: Use 'bro chat' to describe what you want to build, then run`);
        (0, logger_1.log)(`   'bro process' → 'bro tasks' → 'bro code' to generate your application!`);
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

# AI Provider settings (configure these for code generation)
# AI_PROVIDER=openai
# AI_MODEL=gpt-4
# OPENAI_API_KEY=your_openai_api_key_here

# Environment
NODE_ENV=development

# Project settings
DEFAULT_LANGUAGE=javascript
DEFAULT_FRAMEWORK=none
`;
        fs.writeFileSync(path.join(metaPath, '.meta.env'), metaEnvContent);
        // Initialize database with proper schema
        const dbPath = path.join(metaPath, 'meta.db');
        (0, logger_1.log)('🗄️ Initializing database...');
        const db = new database_1.BropilotDatabase(dbPath);
        // Create the initial application record
        const app = db.createApplication(appName, `Initial application created via 'bro init'`);
        (0, logger_1.log)(`📊 Created application record: ${app.id}`);
        // Create default processing prompts
        yield createDefaultPrompts(db);
        // Set default configuration
        db.setConfig('agent_provider', 'openai');
        db.setConfig('agent_model', 'gpt-4');
        db.setConfig('default_language', 'javascript');
        db.setConfig('default_framework', 'none');
        (0, logger_1.log)('⚙️ Created default configuration');
        db.close();
        (0, logger_1.log)('✅ Database initialized successfully');
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

### Development Workflow

1. **Define Requirements**: Use \`bro chat\` to describe what you want to build
2. **Extract Features**: Run \`bro process\` to convert conversations into features  
3. **Generate Tasks**: Use \`bro tasks\` to break features into implementation tasks
4. **Generate Code**: Run \`bro code\` to generate implementation from tasks
5. **Check Status**: Use \`bro status\` to see project progress

### Example Workflow

\`\`\`bash
# Start a conversation about your app
bro chat "main-features"

# Process the chat into structured features
bro process

# Generate implementation tasks
bro tasks

# Generate code for tasks
bro code

# Check overall status
bro status
\`\`\`

## Project Structure

\`\`\`
${appName}/
├── .meta/                  # Bropilot metadata and configuration
│   ├── meta.db            # SQLite database with project state
│   ├── app.yaml           # Application metadata
│   ├── .meta.env          # Environment configuration
│   └── migrations/        # Database migrations
├── src/                   # Source code (generated by bro)
├── tests/                 # Test files
├── docs/                  # Documentation
└── README.md              # This file
\`\`\`

## Meta Directory

The \`.meta/\` directory contains configuration and metadata for your application.
Check \`.meta/README.md\` for more information.

## Environment Setup

Before using bro commands, ensure you have your preferred development environment set up and:

1. **OpenAI API Key** (for AI processing):
   \`\`\`bash
   export OPENAI_API_KEY=your_api_key_here
   \`\`\`

2. **Language-specific setup**: Bropilot can generate code in any language. 
   Configure your preferred language and framework in \`.meta/.meta.env\`

## Next Steps

1. Set up your OpenAI API key
2. Configure your preferred language/framework in \`.meta/.meta.env\`
3. Start a chat session: \`bro chat\`
4. Describe what you want to build
5. Let bro generate your application structure
`;
        fs.writeFileSync(path.join(targetPath, 'README.md'), readmeContent);
        // Create basic project directories
        const directories = ['src', 'tests', 'docs'];
        directories.forEach(dir => {
            const dirPath = path.join(targetPath, dir);
            fs.mkdirSync(dirPath, { recursive: true });
            // Create placeholder files
            if (dir === 'src') {
                fs.writeFileSync(path.join(dirPath, '.gitkeep'), '# Source code will be generated here by bro commands\n');
            }
            else if (dir === 'tests') {
                fs.writeFileSync(path.join(dirPath, '.gitkeep'), '# Test files will be generated here by bro commands\n');
            }
            else if (dir === 'docs') {
                fs.writeFileSync(path.join(dirPath, '.gitkeep'), '# Documentation will be generated here by bro commands\n');
            }
        });
        // Create .gitignore
        const gitignoreContent = `# Dependencies
node_modules/
*.pnp
.pnp.js

# Testing
/coverage

# Production builds
/build
/dist

# Environment variables
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*

# Runtime data
pids
*.pid
*.seed
*.pid.lock

# Coverage directory used by tools like istanbul
coverage/
*.lcov

# OS generated files
.DS_Store
.DS_Store?
._*
.Spotlight-V100
.Trashes
ehthumbs.db
Thumbs.db

# IDE files
.vscode/
.idea/
*.swp
*.swo
*~

# Meta files (keep structure but ignore sensitive data)
.meta/meta.db
.meta/.meta.env
`;
        fs.writeFileSync(path.join(targetPath, '.gitignore'), gitignoreContent);
        (0, logger_1.log)('📁 Created project structure');
    });
}
function createDefaultPrompts(db) {
    return __awaiter(this, void 0, void 0, function* () {
        // Create default processing prompts for AI workflows
        db.createProcessingPrompt('chat_to_features', 'Extract features from chat', `You are an expert system analyst. Analyze the following chat conversation and extract distinct features/capabilities that should be implemented.

Chat Content:
{{chat_content}}

Return your response as a JSON object with this structure:
{
  "features": [
    {
      "name": "Feature Name",
      "description": "Clear description of what this feature does and why it's needed"
    }
  ]
}

Guidelines:
- Each feature should be a distinct capability or functionality
- Features should be implementation-agnostic (focus on WHAT, not HOW)
- Descriptions should be clear and actionable
- Combine related requests into cohesive features
- Return only valid JSON`);
        db.createProcessingPrompt('features_to_tasks', 'Generate implementation tasks from features', `You are a senior software architect. Break down the following feature into specific, actionable implementation tasks.

Feature: {{feature_name}}
Description: {{feature_description}}

Return your response as a JSON object with this structure:
{
  "tasks": [
    {
      "title": "Task Title",
      "description": "Detailed description of what needs to be implemented",
      "task_type": "code|test|documentation|infrastructure",
      "dependencies": ["list", "of", "task", "titles", "this", "depends", "on"],
      "files_to_modify": ["path/to/file1.ts", "path/to/file2.ts"],
      "estimated_complexity": "low|medium|high"
    }
  ]
}

Guidelines:
- Break features into small, manageable tasks (1-4 hours each)
- Each task should have a clear definition of done
- Include appropriate task types
- Consider dependencies between tasks
- Be specific about files that need modification
- Return only valid JSON`);
        db.createProcessingPrompt('task_to_code', 'Generate code implementation from task', `You are an expert software engineer. Implement the following task according to the specifications.

Task: {{task_title}}
Description: {{task_description}}
Files to modify: {{files_to_modify}}
Current codebase context: {{codebase_context}}

Return your response as a JSON object with this structure:
{
  "implementation": {
    "files": [
      {
        "path": "relative/path/to/file.ts",
        "action": "create|modify|delete",
        "content": "full file content or modification instructions",
        "explanation": "what this change accomplishes"
      }
    ],
    "commands": [
      {
        "command": "npm install package-name",
        "explanation": "why this command is needed"
      }
    ]
  }
}

Guidelines:
- Write clean, maintainable, well-documented code
- Follow existing code patterns and conventions
- Include proper error handling
- Add appropriate types (if TypeScript)
- Return only valid JSON`);
        (0, logger_1.log)('📝 Created default processing prompts');
    });
}
