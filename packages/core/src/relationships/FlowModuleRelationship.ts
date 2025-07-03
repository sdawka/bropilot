import Database from 'better-sqlite3';
import { FlowModuleSchema } from '../database/schema.js';

export class FlowModuleRelationship {
  private db: Database.Database;
  private tableName: string = 'flow_modules';

  constructor(db: Database.Database) {
    this.db = db;
  }

  async add(flow_id: string, module_id: string): Promise<FlowModuleSchema> {
    const stmt = this.db.prepare(
      `INSERT INTO ${this.tableName} (flow_id, module_id) VALUES (?, ?)`,
    );
    stmt.run(flow_id, module_id);
    return { flow_id, module_id };
  }

  async remove(flow_id: string, module_id: string): Promise<void> {
    const stmt = this.db.prepare(
      `DELETE FROM ${this.tableName} WHERE flow_id = ? AND module_id = ?`,
    );
    stmt.run(flow_id, module_id);
  }

  async findModulesByFlow(flow_id: string): Promise<string[]> {
    const stmt = this.db.prepare(
      `SELECT module_id FROM ${this.tableName} WHERE flow_id = ?`,
    );
    const results = stmt.all(flow_id) as { module_id: string }[];
    return results.map((r) => r.module_id);
  }

  async findFlowsByModule(module_id: string): Promise<string[]> {
    const stmt = this.db.prepare(
      `SELECT flow_id FROM ${this.tableName} WHERE module_id = ?`,
    );
    const results = stmt.all(module_id) as { flow_id: string }[];
    return results.map((r) => r.flow_id);
  }
}
