import { createInterface } from 'readline';
import { resolve, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { BropilotDatabase } from './lib/database';
import { ProcessingEngine, AIProvider } from './lib/processor';
import { OpenAIProvider } from './lib/ai-provider';

export class BropilotCLI {
  private db: BropilotDatabase;
  private processor: ProcessingEngine;
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd()) {
    this.projectRoot = resolve(projectRoot);
    const broDir = join(this.projectRoot, '.bro');
    const dbPath = join(broDir, 'meta.db');
    
    this.db = new BropilotDatabase(dbPath);
    
    // Initialize AI provider from config
    const provider = this.db.getConfig('agent_provider') || 'openai';
    const model = this.db.getConfig('agent_model') || 'gpt-4';
    
    let aiProvider: AIProvider;
    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY || 'placeholder';
      aiProvider = new OpenAIProvider(apiKey, model);
    } else {
      throw new Error(`Unsupported AI provider: ${provider}`);
    }
    
    this.processor = new ProcessingEngine(this.db, aiProvider);
  }

  async init(appName: string): Promise<void> {
    console.log(`🧬 Initializing Bropilot project: ${appName}`);
    
    const broDir = join(this.projectRoot, '.bro');
    const chatsDir = join(broDir, 'chats');
    const docsDir = join(broDir, 'docs');
    
    // Create directories
    [broDir, chatsDir, docsDir, 'src', 'tests'].forEach(dir => {
      const dirPath = join(this.projectRoot, dir);
      if (!existsSync(dirPath)) {
        mkdirSync(dirPath, { recursive: true });
      }
    });
    
    // Initialize database
    this.db.init();
    
    // Create application
    this.db.createApplication(appName);
    
    console.log('✅ Project initialized');
    console.log('Next steps:');
    console.log('  bro chat    # Start requirement gathering');
    console.log('  bro status  # Check project status');
  }

  async chat(sessionName?: string): Promise<void> {
    const session = this.db.createChatSession(sessionName);
    console.log(`💬 Starting chat session: ${session.session_name}`);
    console.log('Enter your requirements. Type "exit" when done.\n');

    const rl = createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const askQuestion = (): Promise<void> => {
      return new Promise((resolve) => {
        rl.question('You: ', (input: string) => {
          if (input.toLowerCase() === 'exit') {
            rl.close();
            resolve();
            return;
          }
          
          if (input.trim()) {
            this.db.addChatMessage(session.id, 'user', input.trim());
          }
          
          askQuestion().then(resolve);
        });
      });
    };

    await askQuestion();
    console.log('\n✅ Chat session saved. Run "bro process" to extract features.');
  }

  async process(): Promise<void> {
    console.log('🤖 Processing chats into features...');
    const features = await this.processor.processChatsToFeatures();
    console.log(`✅ Extracted ${features.length} features`);
    
    features.forEach(f => {
      console.log(`  - ${f.name}: ${f.description}`);
    });
  }

  async tasks(featureName?: string): Promise<void> {
    console.log('🛠️  Generating implementation tasks...');
    const tasks = await this.processor.generateTasksFromFeatures(featureName);
    console.log(`✅ Generated ${tasks.length} tasks`);
    
    tasks.forEach(t => {
      console.log(`  - ${t.title} (${t.task_type})`);
    });
  }

  async code(taskId?: string): Promise<void> {
    console.log('💻 Generating code from tasks...');
    await this.processor.generateCodeFromTasks(taskId);
    console.log('✅ Code generation completed');
  }

  async status(): Promise<void> {
    const app = this.db.getApplication();
    
    if (!app) {
      console.log('❌ No Bropilot project found. Run "bro init <name>" first.');
      return;
    }
    
    console.log(`📱 Application: ${app.name}`);
    if (app.purpose) {
      console.log(`🎯 Purpose: ${app.purpose}`);
    }
    console.log();
    
    const features = this.db.getFeatures();
    console.log(`🎨 Features: ${features.length}`);
    
    const tasks = this.db.getTasks();
    const tasksByStatus = tasks.reduce((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    if (Object.keys(tasksByStatus).length > 0) {
      console.log('🛠️  Tasks:');
      Object.entries(tasksByStatus).forEach(([status, count]) => {
        console.log(`   ${status}: ${count}`);
      });
    }
    
    const chatSessions = this.db.getChatSessions();
    console.log(`💬 Chat sessions: ${chatSessions.length}`);
  }
}
