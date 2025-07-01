import { Command } from 'commander';
import { log, error } from '../lib/logger';
import { BropilotDatabase } from '../lib/database';
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
      log(`\n🚀 Your application is ready!`);
      log(`\nNext steps:`);
      log(`  cd ${appName}`);
      log(`  export OPENAI_API_KEY=your_api_key_here  # Required for AI processing`);
      log(`  bro chat "project-planning"               # Start describing your app`);
      log(`  bro status                                # Check project status anytime`);
      log(`\n💡 Tip: Use 'bro chat' to describe what you want to build, then run`);
      log(`   'bro process' → 'bro tasks' → 'bro code' to generate your application!`);
      
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
  log('🗄️ Initializing database...');
  const db = new BropilotDatabase(dbPath);
  
  // Create the initial application record
  const app = db.createApplication(appName, `Initial application created via 'bro init'`);
  log(`📊 Created application record: ${app.id}`);
  
  // Create default processing prompts
  await createDefaultPrompts(db);
  
  // Set default configuration
  db.setConfig('agent_provider', 'openai');
  db.setConfig('agent_model', 'gpt-4');
  db.setConfig('default_language', 'javascript');
  db.setConfig('default_framework', 'none');
  log('⚙️ Created default configuration');
  
  db.close();
  log('✅ Database initialized successfully');

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
    } else if (dir === 'tests') {
      fs.writeFileSync(path.join(dirPath, '.gitkeep'), '# Test files will be generated here by bro commands\n');
    } else if (dir === 'docs') {
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

  log('📁 Created project structure');
}

async function createDefaultPrompts(db: BropilotDatabase): Promise<void> {
  // Create default processing prompts for AI workflows
  db.createProcessingPrompt(
    'chat_to_features',
    'Extract features from chat',
    `You are an expert system analyst. Analyze the following chat conversation and extract distinct features/capabilities that should be implemented.

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
- Return only valid JSON`
  );

  db.createProcessingPrompt(
    'features_to_tasks',
    'Generate implementation tasks from features',
    `You are a senior software architect. Break down the following feature into specific, actionable implementation tasks.

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
- Return only valid JSON`
  );

  db.createProcessingPrompt(
    'task_to_code',
    'Generate code implementation from task',
    `You are an expert software engineer. Implement the following task according to the specifications.

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
- Return only valid JSON`
  );

  log('📝 Created default processing prompts');
}
