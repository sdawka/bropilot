import { readFileSync } from 'fs';
import { BropilotDatabase } from './database';
import type { Feature, Task } from '../types';

export interface AIProvider {
  call(prompt: string): Promise<string>;
}

export class ProcessingEngine {
  constructor(
    private db: BropilotDatabase,
    private aiProvider: AIProvider
  ) {}

  async processChatsToFeatures(): Promise<Feature[]> {
    const sessions = this.db.getActiveChatSessions();
    const app = this.db.getApplication();
    
    if (!app) {
      throw new Error('No application found');
    }

    const prompt = this.db.getProcessingPrompt('chat_to_features');
    if (!prompt) {
      throw new Error('No chat_to_features prompt found');
    }

    const extractedFeatures: Feature[] = [];

    for (const session of sessions) {
      const messages = this.db.getChatMessages(session.id);
      const userMessages = messages.filter(m => m.role === 'user');
      const chatContent = userMessages.map(m => m.content).join('\n\n');

      if (!chatContent.trim()) continue;

      const processedPrompt = prompt.prompt_template.replace('{{chat_content}}', chatContent);
      
      try {
        const response = await this.aiProvider.call(processedPrompt);
        const parsed = JSON.parse(response);
        
        if (parsed.features && Array.isArray(parsed.features)) {
          for (const featureData of parsed.features) {
            const feature = this.db.createFeature(
              featureData.name,
              featureData.description,
              app.id
            );
            extractedFeatures.push(feature);
          }
        }
      } catch (error) {
        console.error(`Failed to process session ${session.session_name}:`, error);
      }
    }

    return extractedFeatures;
  }

  async generateTasksFromFeatures(featureName?: string): Promise<Task[]> {
    const features = featureName 
      ? this.db.getFeatures().filter(f => f.name === featureName)
      : this.db.getFeaturesByStatus('planned');

    const prompt = this.db.getProcessingPrompt('features_to_tasks');
    if (!prompt) {
      throw new Error('No features_to_tasks prompt found');
    }

    const generatedTasks: Task[] = [];

    for (const feature of features) {
      let processedPrompt = prompt.prompt_template
        .replace('{{feature_name}}', feature.name)
        .replace('{{feature_description}}', feature.description || '');

      try {
        const response = await this.aiProvider.call(processedPrompt);
        const parsed = JSON.parse(response);
        
        if (parsed.tasks && Array.isArray(parsed.tasks)) {
          for (const taskData of parsed.tasks) {
            const task = this.db.createTask(
              taskData.title,
              taskData.description,
              feature.id,
              taskData.type || 'implementation',
              taskData.file_path
            );
            generatedTasks.push(task);
          }
          
          this.db.updateFeatureStatus(feature.id, 'in_progress');
        }
      } catch (error) {
        console.error(`Failed to generate tasks for feature ${feature.name}:`, error);
      }
    }

    return generatedTasks;
  }

  async generateCodeFromTasks(taskId?: string): Promise<void> {
    const tasks = taskId 
      ? this.db.getTasks().filter(t => t.id === taskId)
      : this.db.getTasksByStatus('pending').filter(t => t.task_type === 'implementation');

    const prompt = this.db.getProcessingPrompt('task_to_code');
    if (!prompt) {
      throw new Error('No task_to_code prompt found');
    }

    for (const task of tasks) {
      // Read existing file if it exists
      let existingCode = '';
      if (task.file_path) {
        try {
          existingCode = readFileSync(task.file_path, 'utf8');
        } catch {
          // File doesn't exist, that's fine
        }
      }

      let processedPrompt = prompt.prompt_template
        .replace('{{task_title}}', task.title)
        .replace('{{task_description}}', task.description || '')
        .replace('{{file_path}}', task.file_path || '')
        .replace('{{existing_code}}', existingCode);

      try {
        const generatedCode = await this.aiProvider.call(processedPrompt);
        
        this.db.updateTaskContent(task.id, generatedCode);
        this.db.updateTaskStatus(task.id, 'completed');
        
        // Write to file if path specified
        if (task.file_path) {
          const { dirname } = await import('path');
          const { mkdir, writeFile } = await import('fs/promises');
          
          await mkdir(dirname(task.file_path), { recursive: true });
          await writeFile(task.file_path, generatedCode);
        }
        
      } catch (error) {
        console.error(`Failed to generate code for task ${task.title}:`, error);
        this.db.updateTaskStatus(task.id, 'blocked');
      }
    }
  }
}
