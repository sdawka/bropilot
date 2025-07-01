import { readFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';
import type { 
  Application, Feature, Task, ChatSession, ChatMessage, 
  ProcessingPrompt, KnowledgeNode, KnowledgeEdge 
} from '../types';

export class BropilotDatabase {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string = join(process.cwd(), 'meta.db')) {
    this.dbPath = dbPath;
    
    // Ensure directory exists
    const dbDir = dirname(dbPath);
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true });
    }
    
    // Initialize database
    this.db = new Database(dbPath);
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('journal_mode = WAL');
    
    // Always run schema migration on initialization
    this.init();
  }

  init(): void {
    try {
      // Read schema file from the bropilot installation directory
      // First try the project root (for development), then try relative to this file (for installed package)
      let schemaPath = join(process.cwd(), 'schema.sql');
      if (!existsSync(schemaPath)) {
        schemaPath = join(__dirname, '../../schema.sql');
      }
      if (!existsSync(schemaPath)) {
        // Try one more location - in case we're in dist directory
        schemaPath = join(__dirname, '../../../schema.sql');
      }
      
      if (!existsSync(schemaPath)) {
        throw new Error(`Schema file not found. Searched in:\n- ${join(process.cwd(), 'schema.sql')}\n- ${join(__dirname, '../../schema.sql')}\n- ${join(__dirname, '../../../schema.sql')}`);
      }
      
      const schema = readFileSync(schemaPath, 'utf8');
      
      // Run schema in a transaction
      const transaction = this.db.transaction(() => {
        this.db.exec(schema);
      });
      
      transaction();
      
      console.log(`Database initialized at ${this.dbPath}`);
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  // Applications
  createApplication(name: string, purpose?: string): Application {
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    
    const stmt = this.db.prepare(`
      INSERT INTO applications (id, name, purpose, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, name, purpose || '', now, now);
    
    return {
      id,
      name,
      purpose,
      current_version: '0.1.0',
      created_at: now,
      updated_at: now
    };
  }

  getApplication(): Application | null {
    const stmt = this.db.prepare('SELECT * FROM applications LIMIT 1');
    return stmt.get() as Application | null;
  }

  // Features
  createFeature(name: string, description: string, applicationId: string): Feature {
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    
    const stmt = this.db.prepare(`
      INSERT INTO features (id, name, description, application_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, name, description, applicationId, now, now);
    
    return {
      id,
      name,
      description,
      application_id: applicationId,
      status: 'planned',
      created_at: now,
      updated_at: now
    };
  }

  getFeatures(): Feature[] {
    const stmt = this.db.prepare('SELECT * FROM features ORDER BY created_at');
    return stmt.all() as Feature[];
  }

  getFeaturesByStatus(status: Feature['status']): Feature[] {
    const stmt = this.db.prepare('SELECT * FROM features WHERE status = ? ORDER BY created_at');
    return stmt.all(status) as Feature[];
  }

  updateFeatureStatus(id: string, status: Feature['status']): void {
    const stmt = this.db.prepare('UPDATE features SET status = ?, updated_at = ? WHERE id = ?');
    stmt.run(status, Math.floor(Date.now() / 1000), id);
  }

  // Tasks
  createTask(
    title: string, 
    description: string, 
    featureId: string, 
    taskType: Task['task_type'],
    filePath?: string
  ): Task {
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    
    const stmt = this.db.prepare(`
      INSERT INTO tasks (id, title, description, feature_id, task_type, file_path, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, title, description, featureId, taskType, filePath || null, now, now);
    
    return {
      id,
      title,
      description,
      feature_id: featureId,
      task_type: taskType,
      status: 'pending',
      file_path: filePath,
      created_at: now,
      updated_at: now
    };
  }

  getTasks(): Task[] {
    const stmt = this.db.prepare('SELECT * FROM tasks ORDER BY created_at');
    return stmt.all() as Task[];
  }

  getTasksByStatus(status: Task['status']): Task[] {
    const stmt = this.db.prepare('SELECT * FROM tasks WHERE status = ? ORDER BY created_at');
    return stmt.all(status) as Task[];
  }

  updateTaskStatus(id: string, status: Task['status']): void {
    const stmt = this.db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?');
    stmt.run(status, Math.floor(Date.now() / 1000), id);
  }

  updateTaskContent(id: string, content: string): void {
    const stmt = this.db.prepare('UPDATE tasks SET generated_content = ?, updated_at = ? WHERE id = ?');
    stmt.run(content, Math.floor(Date.now() / 1000), id);
  }

  // Chat Sessions
  createChatSession(sessionName?: string): ChatSession {
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    
    const stmt = this.db.prepare(`
      INSERT INTO chat_sessions (id, session_name, started_at)
      VALUES (?, ?, ?)
    `);
    
    stmt.run(id, sessionName || `session-${new Date().toISOString().slice(0, 16)}`, now);
    
    return {
      id,
      session_name: sessionName,
      started_at: now,
      status: 'active',
      total_messages: 0
    };
  }

  getChatSessions(): ChatSession[] {
    const stmt = this.db.prepare('SELECT * FROM chat_sessions ORDER BY started_at DESC');
    return stmt.all() as ChatSession[];
  }

  addChatMessage(sessionId: string, role: ChatMessage['role'], content: string): ChatMessage {
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    
    // Get next message order
    const orderStmt = this.db.prepare('SELECT COALESCE(MAX(message_order), 0) + 1 as next_order FROM chat_messages WHERE session_id = ?');
    const { next_order } = orderStmt.get(sessionId) as { next_order: number };
    
    const stmt = this.db.prepare(`
      INSERT INTO chat_messages (id, session_id, role, content, timestamp, message_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(id, sessionId, role, content, now, next_order);
    
    // Update session message count
    const updateStmt = this.db.prepare('UPDATE chat_sessions SET total_messages = total_messages + 1 WHERE id = ?');
    updateStmt.run(sessionId);
    
    return {
      id,
      session_id: sessionId,
      role,
      content,
      timestamp: now,
      message_order: next_order
    };
  }

  getChatMessages(sessionId: string): ChatMessage[] {
    const stmt = this.db.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY message_order');
    return stmt.all(sessionId) as ChatMessage[];
  }

  getActiveChatSessions(): ChatSession[] {
    const stmt = this.db.prepare('SELECT * FROM chat_sessions WHERE status = "active" ORDER BY started_at DESC');
    return stmt.all() as ChatSession[];
  }

  // Processing Prompts
  createProcessingPrompt(stepName: string, description: string, promptTemplate: string): ProcessingPrompt {
    const id = randomUUID();
    const now = Math.floor(Date.now() / 1000);
    
    const stmt = this.db.prepare(`
      INSERT INTO processing_prompts (id, step_name, description, prompt_template, active, created_at, updated_at)
      VALUES (?, ?, ?, ?, TRUE, ?, ?)
    `);
    
    stmt.run(id, stepName, description, promptTemplate, now, now);
    
    return {
      id,
      step_name: stepName,
      description,
      prompt_template: promptTemplate,
      active: true,
      created_at: now,
      updated_at: now
    };
  }

  getProcessingPrompt(stepName: string): ProcessingPrompt | null {
    const stmt = this.db.prepare('SELECT * FROM processing_prompts WHERE step_name = ? AND active = TRUE');
    return stmt.get(stepName) as ProcessingPrompt | null;
  }

  // Knowledge Graph
  getKnowledgeNodes(): KnowledgeNode[] {
    const stmt = this.db.prepare('SELECT * FROM knowledge_nodes ORDER BY created_at');
    return stmt.all() as KnowledgeNode[];
  }

  getKnowledgeEdges(): KnowledgeEdge[] {
    const stmt = this.db.prepare('SELECT * FROM knowledge_edges ORDER BY created_at');
    return stmt.all() as KnowledgeEdge[];
  }

  // Configuration
  getConfig(key: string): string | null {
    const stmt = this.db.prepare('SELECT value FROM config WHERE key = ?');
    const result = stmt.get(key) as { value: string } | undefined;
    return result?.value || null;
  }

  setConfig(key: string, value: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO config (key, value, updated_at) 
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = ?
    `);
    const now = Math.floor(Date.now() / 1000);
    stmt.run(key, value, now, value, now);
  }

  close(): void {
    this.db.close();
  }
}
