import * as path from 'path';
import * as fs from 'fs-extra';
/* @ts-ignore: validate-npm-package-name has no default export in CJS, so import as any */
import * as validateNpmPackageName from 'validate-npm-package-name';
import { simpleGit } from 'simple-git';
import { DatabaseInitializer } from 'bropilot-core/database/DatabaseInitializer';

interface InitOptions {
  template?: string;
  noGit?: boolean;
  force?: boolean;
}

export class InitCommand {
  async execute(appName: string, options: InitOptions): Promise<void> {
    // Log initialization steps for CLI UX and test expectations
    console.log(`Initializing new Bropilot application: ${appName}`);
    console.log(`Template: ${options.template || 'default'}`);

    // Validate app name
    if (!this.isValidAppName(appName)) {
      throw new Error(`Invalid app name: ${appName}`);
    }

    // Interactive mode stub
    if ((options as any).interactive) {
      // Placeholder: prompt user for config values
      // e.g., inquirer.prompt([...])
      // For now, just log
      console.log('Interactive mode is not yet implemented.');
    }

    // Project type template stub
    if (options.template) {
      // Placeholder: handle different project templates
      // e.g., webapp, api, cli, etc.
      console.log(
        `Project template "${options.template}" is not yet implemented.`,
      );
    }

    // Check if already in a bro project (recursively)
    if ((await this.isExistingProject()) && !options.force) {
      throw new Error('Already in a Bropilot project');
    }

    // Create directory structure and initial YAML docs
    await this.createProjectStructure(appName, options);

    // Initialize database
    await this.initializeDatabase(appName);

    // Generate initial files
    await this.generateInitialFiles(appName);

    // Optional git init
    if (!options.noGit) {
      await this.initializeGit(appName);
    }
  }

  private isValidAppName(appName: string): boolean {
    const validationResult = validateNpmPackageName(appName);
    return validationResult.validForNewPackages && !appName.includes(' ');
  }

  // Recursively check for .bro in current and parent directories
  private async isExistingProject(): Promise<boolean> {
    let dir = process.cwd();
    while (true) {
      if (await fs.pathExists(path.join(dir, '.bro'))) {
        return true;
      }
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    return false;
  }

  private async createProjectStructure(
    appName: string,
    options?: InitOptions,
  ): Promise<void> {
    // Spinner/progress bar placeholder
    // e.g., ora('Creating project structure...').start();

    const structure = {
      [appName]: {
        '.bro': {
          chats: {},
          docs: {},
          releases: {},
          'config.yaml': this.generateProjectConfig(appName),
        },
        src: {},
        docs: {},
        tests: {},
        infrastructure: {},
        'README.md': this.generateReadme(appName),
        '.gitignore': this.generateGitignore(),
      },
    };

    await this.createDirectoryTree(structure, process.cwd());

    // Create initial YAML document templates in .bro/docs/
    const docsPath = path.join(process.cwd(), appName, '.bro', 'docs');
    await fs.mkdirp(docsPath);
    await fs.writeFile(
      path.join(docsPath, 'entities.yaml'),
      `# Example entities YAML
entities:
 - name: ExampleEntity
   type: Feature
   description: This is an example entity.
`,
    );
    await fs.writeFile(
      path.join(docsPath, 'project.yaml'),
      `# Example project YAML
project:
 name: ${appName}
 description: Initial project YAML template.
`,
    );
  }

  private async createDirectoryTree(
    structure: any,
    currentPath: string,
  ): Promise<void> {
    for (const key in structure) {
      const itemPath = path.join(currentPath, key);
      if (
        typeof structure[key] === 'object' &&
        structure[key] !== null &&
        !Array.isArray(structure[key])
      ) {
        await fs.mkdirp(itemPath);
        await this.createDirectoryTree(structure[key], itemPath);
      } else if (typeof structure[key] === 'string') {
        await fs.writeFile(itemPath, structure[key]);
      }
    }
  }

  private generateProjectConfig(appName: string): string {
    return `
# Bropilot Project Configuration
project:
  name: ${appName}
  version: 0.0.0
  created: ${new Date().toISOString()}
  phase: 1

ai:
  provider: openai
  model: gpt-4
  temperature: 0.7

workflow:
  methodology: test_driven_development
  qa_mode: automated_with_human_checkpoints
  pr_granularity: task_level

generation:
  auto_regenerate: true
  preserve_custom_code: true
    `.trim();
  }

  private generateReadme(appName: string): string {
    return `# ${appName}

This is a Bropilot project.
`;
  }

  private generateGitignore(): string {
    return `
# Logs
logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*
lerna-debug.log*
.pnpm-debug.log*

# Diagnostic reports (https://nodejs.org/api/report.html)
.report/

# Node.js
node_modules/
dist/
build/
.env
.env.local
.env.development.local
.env.test.local
.env.production.local

# Editor directories and files
.vscode/
.idea/
*.iml
*.ipr
*.iws

# Bropilot specific
.bro/
`;
  }

  private async initializeDatabase(appName: string): Promise<void> {
    const projectPath = path.join(process.cwd(), appName);
    const initializer = new DatabaseInitializer();
    await initializer.initialize(projectPath);
  }

  private async generateInitialFiles(appName: string): Promise<void> {
    // Files are generated as part of createProjectStructure
  }

  private async initializeGit(appName: string): Promise<void> {
    const projectPath = path.join(process.cwd(), appName);
    const git = simpleGit(projectPath);
    await git.init();
    await git.add('.');
    await git.commit('Initial Bropilot project setup');
  }
}
