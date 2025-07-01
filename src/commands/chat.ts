import { Command } from 'commander';
import { createInterface } from 'readline';
import { resolve, join } from 'path';
import { existsSync } from 'fs';
import { BropilotDatabase } from '../lib/database';
import { log, error } from '../lib/logger';

export const chatCommand = new Command('chat')
  .option('-s, --session <n>', 'Session name')
  .description('Start interactive chat session')
  .action(async (options) => {
    try {
      const projectRoot = resolve(process.cwd());
      const metaDir = join(projectRoot, '.meta');
      const dbPath = join(metaDir, 'meta.db');
      
      if (!existsSync(dbPath)) {
        error('No bropilot project found. Run "bro init <app-name>" first.');
        process.exit(1);
      }
      
      const db = new BropilotDatabase(dbPath);
      const session = db.createChatSession(options.session);
      
      log(`💬 Starting chat session: ${session.session_name}`);
      log('Enter your requirements. Type "exit" when done.\n');

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
              db.addChatMessage(session.id, 'user', input.trim());
            }
            
            askQuestion().then(resolve);
          });
        });
      };

      await askQuestion();
      db.close();
      log('\n✅ Chat session saved. Run "bro process" to extract features.');
      
    } catch (err: any) {
      error(`Chat session failed: ${err.message}`);
      process.exit(1);
    }
  });
