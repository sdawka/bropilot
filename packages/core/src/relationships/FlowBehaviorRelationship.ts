import Database from 'better-sqlite3';
import { FlowBehaviorSchema } from '../database/schema';

export class FlowBehaviorRelationship {
  private db: Database.Database;
  private tableName: string = 'flow_behaviors';

  constructor(db: Database.Database) {
    this.db = db;
  }

  async add(flow_id: string, behavior_id: string): Promise<FlowBehaviorSchema> {
    const stmt = this.db.prepare(
      `INSERT INTO ${this.tableName} (flow_id, behavior_id) VALUES (?, ?)`,
    );
    stmt.run(flow_id, behavior_id);
    return { flow_id, behavior_id };
  }

  async remove(flow_id: string, behavior_id: string): Promise<void> {
    const stmt = this.db.prepare(
      `DELETE FROM ${this.tableName} WHERE flow_id = ? AND behavior_id = ?`,
    );
    stmt.run(flow_id, behavior_id);
  }

  async findBehaviorsByFlow(flow_id: string): Promise<string[]> {
    const stmt = this.db.prepare(
      `SELECT behavior_id FROM ${this.tableName} WHERE flow_id = ?`,
    );
    const results = stmt.all(flow_id) as { behavior_id: string }[];
    return results.map((r) => r.behavior_id);
  }

  async findFlowsByBehavior(behavior_id: string): Promise<string[]> {
    const stmt = this.db.prepare(
      `SELECT flow_id FROM ${this.tableName} WHERE behavior_id = ?`,
    );
    const results = stmt.all(behavior_id) as { flow_id: string }[];
    return results.map((r) => r.flow_id);
  }
}
