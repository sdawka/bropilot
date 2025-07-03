import Database from 'better-sqlite3';
import { FlowThingSchema } from '../database/schema.js';

export class FlowThingRelationship {
  private db: Database.Database;
  private tableName: string = 'flow_things';

  constructor(db: Database.Database) {
    this.db = db;
  }

  async add(flow_id: string, thing_id: string): Promise<FlowThingSchema> {
    const stmt = this.db.prepare(
      `INSERT INTO ${this.tableName} (flow_id, thing_id) VALUES (?, ?)`,
    );
    stmt.run(flow_id, thing_id);
    return { flow_id, thing_id };
  }

  async remove(flow_id: string, thing_id: string): Promise<void> {
    const stmt = this.db.prepare(
      `DELETE FROM ${this.tableName} WHERE flow_id = ? AND thing_id = ?`,
    );
    stmt.run(flow_id, thing_id);
  }

  async findThingsByFlow(flow_id: string): Promise<string[]> {
    const stmt = this.db.prepare(
      `SELECT thing_id FROM ${this.tableName} WHERE flow_id = ?`,
    );
    const results = stmt.all(flow_id) as { thing_id: string }[];
    return results.map((r) => r.thing_id);
  }

  async findFlowsByThing(thing_id: string): Promise<string[]> {
    const stmt = this.db.prepare(
      `SELECT flow_id FROM ${this.tableName} WHERE thing_id = ?`,
    );
    const results = stmt.all(thing_id) as { flow_id: string }[];
    return results.map((r) => r.flow_id);
  }
}
