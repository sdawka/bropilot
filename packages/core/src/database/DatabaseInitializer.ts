import * as path from 'path';
import Database from 'better-sqlite3';
import { MigrationRunner } from './migrations/MigrationRunner.js';
import {
  DEFAULT_CHAT_TO_KG_PROMPT,
  DEFAULT_KG_TO_DOCS_PROMPT,
} from '../llm/defaultPrompts.js';

export class DatabaseInitializer {
  async initialize(projectPath: string): Promise<void> {
    const dbPath = path.join(projectPath, '.bro', 'meta.db');
    const db = new Database(dbPath);

    // Run migrations
    const migrationRunner = new MigrationRunner(db);
    await migrationRunner.runAll();

    // Insert default data
    await this.insertDefaults(db);

    db.close();
  }

  private async insertDefaults(db: Database.Database): Promise<void> {
    // Insert default prompt templates
    const prompts = [
      {
        name: 'chat_to_kg',
        version: 1,
        template: DEFAULT_CHAT_TO_KG_PROMPT,
        variables: ['chat_content'],
      },
      {
        name: 'kg_to_docs',
        version: 1,
        template: DEFAULT_KG_TO_DOCS_PROMPT,
        variables: ['entities', 'relationships'],
      },
    ];

    const stmt = db.prepare(`
      INSERT INTO prompt_templates (name, version, template, variables)
      VALUES (?, ?, ?, ?)
    `);

    for (const prompt of prompts) {
      stmt.run(
        prompt.name,
        prompt.version,
        prompt.template,
        JSON.stringify(prompt.variables),
      );
    }
  }
}
