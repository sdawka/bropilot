// packages/cli/src/commands/ChatCommand.ts

import * as fs from 'fs-extra';
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { marked } from 'marked';

interface ChatSession {
  id: string;
  startedAt: Date;
  lastMessageAt: Date;
  messages: ChatMessage[];
  metadata: {
    totalTokens: number;
    estimatedCost: number;
    messageCount: number;
    duration?: number;
  };
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  tokens?: number;
}

interface ChatOptions {
  continue?: boolean;
  import?: string;
}

interface SessionSummary {
  id: string;
  startedAt: Date;
  lastMessageAt: Date;
  messageCount: number;
  totalTokens: number;
}

const SESSIONS_DIR = path.resolve('.bro/chats');

export class ChatCommand {
  private session!: ChatSession;
  private rl!: readline.Interface;

  async execute(options: ChatOptions): Promise<void> {
    // Ensure sessions directory exists
    await fs.mkdirp(SESSIONS_DIR);

    // Load or create session
    this.session = options.continue
      ? await this.loadLastSession()
      : await this.createNewSession();

    // Import file if specified
    if (options.import) {
      await this.importFile(options.import);
    }

    // Setup readline interface
    this.setupInterface();

    // Display welcome message
    this.displayWelcome();

    // Start chat loop
    await this.chatLoop();
  }

  // Main chat loop: just keeps the process alive and prompts for input
  private async chatLoop(): Promise<void> {
    this.rl.prompt();
    // The readline event listeners handle the rest
    await new Promise<void>(() => {}); // Keeps the process alive
  }

  private setupInterface(): void {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: chalk.green('You> '),
      terminal: true,
      historySize: 100,
    });

    // Multi-line support
    let multilineBuffer = '';
    let inMultiline = false;

    this.rl.on('line', async (line) => {
      if (line.endsWith('\\')) {
        inMultiline = true;
        multilineBuffer += line.slice(0, -1) + '\n';
        this.rl.setPrompt(chalk.gray('...> '));
        this.rl.prompt();
        return;
      }

      const input = inMultiline ? multilineBuffer + line : line;
      multilineBuffer = '';
      inMultiline = false;
      this.rl.setPrompt(chalk.green('You> '));

      await this.processInput(input);
    });

    // Graceful shutdown
    this.rl.on('SIGINT', async () => {
      console.log('\n' + chalk.yellow('Saving session...'));
      await this.saveSession();
      process.exit(0);
    });
  }

  private async processInput(input: string): Promise<void> {
    // Special commands
    if (input.startsWith('/')) {
      await this.handleCommand(input);
      return;
    }

    // Add user message
    const userMessage: ChatMessage = {
      role: 'user',
      content: input,
      timestamp: new Date(),
    };
    this.session.messages.push(userMessage);

    // Show typing indicator
    const spinner = ora('Thinking...').start();

    try {
      // Process with LLM (stub)
      const response = await this.processWithLLM(input);

      // Add assistant message
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.content,
        timestamp: new Date(),
        tokens: response.usage.totalTokens,
      };
      this.session.messages.push(assistantMessage);

      // Update metadata
      this.updateSessionMetadata(response.usage);

      spinner.stop();

      // Display response
      console.log('\n' + chalk.blue('Bro>'), response.content);
      console.log(
        chalk.gray(
          `[Tokens: ${response.usage.totalTokens} | Cost: ${response.cost.toFixed(4)}]`,
        ),
      );
    } catch (error: any) {
      spinner.fail('Failed to process');
      console.error(chalk.red('Error:'), error.message);
    }

    this.rl.prompt();
  }

  private async handleCommand(command: string): Promise<void> {
    const [cmd, ...args] = command.slice(1).split(' ');

    switch (cmd) {
      case 'save':
        await this.saveSession();
        console.log(chalk.green('Session saved'));
        break;

      case 'export': {
        const filename = args[0] || `chat-${this.session.id}.md`;
        await this.exportSession(filename);
        console.log(chalk.green(`Exported to ${filename}`));
        break;
      }

      case 'stats':
        this.displayStats();
        break;

      case 'clear':
        console.clear();
        break;

      case 'help':
        this.displayHelp();
        break;

      case 'exit':
      case 'quit':
        await this.saveSession();
        process.exit(0);
        break;

      default:
        console.log(chalk.red(`Unknown command: ${cmd}`));
    }
    this.rl.prompt();
  }

  private displayWelcome(): void {
    console.log(
      chalk.cyanBright(
        'Welcome to Bro Chat! Type your message or /help for commands.',
      ),
    );
    this.rl.prompt();
  }

  private displayHelp(): void {
    console.log(chalk.yellowBright('\nChat Commands:'));
    console.log('/save         - Save current session');
    console.log('/export [file] - Export session to markdown');
    console.log('/stats        - Show session statistics');
    console.log('/clear        - Clear screen');
    console.log('/help         - Show available commands');
    console.log('/exit         - Save and exit\n');
  }

  private displayStats(): void {
    const { totalTokens, estimatedCost, messageCount } = this.session.metadata;
    const duration =
      (new Date(this.session.lastMessageAt).getTime() -
        new Date(this.session.startedAt).getTime()) /
      1000;
    console.log(chalk.magentaBright('\nSession Stats:'));
    console.log(`Messages: ${messageCount}`);
    console.log(`Tokens: ${totalTokens}`);
    console.log(`Estimated Cost: $${estimatedCost.toFixed(4)}`);
    console.log(`Duration: ${duration.toFixed(1)}s\n`);
  }

  // --- Session Management ---

  private async createNewSession(): Promise<ChatSession> {
    const id = Date.now().toString(36);
    const now = new Date();
    return {
      id,
      startedAt: now,
      lastMessageAt: now,
      messages: [],
      metadata: {
        totalTokens: 0,
        estimatedCost: 0,
        messageCount: 0,
      },
    };
  }

  private async loadLastSession(): Promise<ChatSession> {
    const files = await fs.readdir(SESSIONS_DIR);
    const jsonFiles = files.filter((f) => f.endsWith('.json'));
    if (jsonFiles.length === 0) {
      return this.createNewSession();
    }
    const latest = jsonFiles
      .map((f) => ({
        file: f,
        mtime: fs.statSync(path.join(SESSIONS_DIR, f)).mtime.getTime(),
      }))
      .sort((a, b) => b.mtime - a.mtime)[0].file;
    return this.loadSession(latest);
  }

  private async loadSession(filename: string): Promise<ChatSession> {
    const filePath = path.join(SESSIONS_DIR, filename);
    const data = await fs.readFile(filePath, 'utf-8');
    const session = JSON.parse(data);
    // Convert date strings to Date objects
    session.startedAt = new Date(session.startedAt);
    session.lastMessageAt = new Date(session.lastMessageAt);
    session.messages = session.messages.map((m: any) => ({
      ...m,
      timestamp: new Date(m.timestamp),
    }));
    return session;
  }

  private async saveSession(): Promise<void> {
    this.session.lastMessageAt = new Date();
    this.session.metadata.messageCount = this.session.messages.length;
    const filePath = path.join(SESSIONS_DIR, `${this.session.id}.json`);
    await fs.writeFile(
      filePath,
      JSON.stringify(this.session, null, 2),
      'utf-8',
    );
  }

  private async importFile(filePath: string): Promise<void> {
    const absPath = path.resolve(filePath);
    if (!(await fs.pathExists(absPath))) {
      console.log(chalk.red(`File not found: ${filePath}`));
      return;
    }
    const content = await fs.readFile(absPath, 'utf-8');
    const userMessage: ChatMessage = {
      role: 'user',
      content,
      timestamp: new Date(),
    };
    this.session.messages.push(userMessage);
    console.log(chalk.green(`Imported file: ${filePath}`));
  }

  private async exportSession(filename: string): Promise<void> {
    const md = this.session.messages
      .map(
        (msg) =>
          `**${msg.role.toUpperCase()}** [${msg.timestamp.toLocaleString()}]:\n\n${msg.content}\n`,
      )
      .join('\n---\n');
    await fs.writeFile(filename, md, 'utf-8');
  }

  private updateSessionMetadata(usage: { totalTokens: number; cost: number }) {
    this.session.metadata.totalTokens += usage.totalTokens;
    this.session.metadata.estimatedCost += usage.cost;
    this.session.metadata.messageCount = this.session.messages.length;
    this.session.lastMessageAt = new Date();
  }

  // --- LLM Processing Stub ---
  private async processWithLLM(input: string): Promise<any> {
    // TODO: Integrate with actual LLM provider
    // For now, echo the input and fake token/cost usage
    return {
      content: `Echo: ${input}`,
      usage: {
        totalTokens: Math.max(1, Math.floor(input.length / 4)),
        cost: 0.0001 * Math.max(1, Math.floor(input.length / 4)),
      },
      cost: 0.0001 * Math.max(1, Math.floor(input.length / 4)),
    };
  }

  // --- Session Management Utilities (list, delete, resume) ---

  static async listSessions(): Promise<SessionSummary[]> {
    await fs.mkdirp(SESSIONS_DIR);
    const files = await fs.readdir(SESSIONS_DIR);
    const sessions: SessionSummary[] = [];
    for (const file of files) {
      if (file.endsWith('.json')) {
        const data = await fs.readFile(path.join(SESSIONS_DIR, file), 'utf-8');
        const session = JSON.parse(data);
        sessions.push({
          id: session.id,
          startedAt: new Date(session.startedAt),
          lastMessageAt: new Date(session.lastMessageAt),
          messageCount: session.messages.length,
          totalTokens: session.metadata.totalTokens,
        });
      }
    }
    return sessions.sort(
      (a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime(),
    );
  }

  static async deleteSession(id: string): Promise<void> {
    const filePath = path.join(SESSIONS_DIR, `${id}.json`);
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
    }
  }
}
