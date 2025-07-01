import { PromptTemplate } from './PromptTemplate';
import { AppDatabase } from '../database/Database';

export class PromptTemplateRepository {
  private db: AppDatabase;

  constructor(db: AppDatabase) {
    this.db = db;
  }

  async getLatestByName(name: string): Promise<PromptTemplate | null> {
    const stmt = this.db
      .getDB()
      .prepare(
        `SELECT * FROM prompt_templates WHERE name = ? ORDER BY version DESC LIMIT 1`,
      );
    const row = stmt.get(name) as any;
    return row
      ? ({ ...row, variables: JSON.parse(row.variables) } as PromptTemplate)
      : null;
  }

  async getById(id: string): Promise<PromptTemplate | null> {
    const stmt = this.db
      .getDB()
      .prepare(`SELECT * FROM prompt_templates WHERE id = ?`);
    const row = stmt.get(id) as any;
    return row
      ? ({ ...row, variables: JSON.parse(row.variables) } as PromptTemplate)
      : null;
  }

  async insert(
    template: Omit<PromptTemplate, 'id' | 'created_at'>,
  ): Promise<string> {
    const createdAt = Date.now();
    const stmt = this.db.getDB().prepare(
      `INSERT INTO prompt_templates (name, version, template, variables, system_prompt, output_format, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    const result = stmt.run(
      template.name,
      template.version,
      template.template,
      JSON.stringify(template.variables),
      template.system_prompt ?? null,
      template.output_format ?? null,
      createdAt,
    );
    return result.lastInsertRowid?.toString() ?? '';
  }

  async listAll(): Promise<PromptTemplate[]> {
    const stmt = this.db
      .getDB()
      .prepare(`SELECT * FROM prompt_templates ORDER BY name, version DESC`);
    const rows = stmt.all();
    return rows.map((row: any) => ({
      ...row,
      variables: JSON.parse(row.variables),
    }));
  }
}
