import Database from 'better-sqlite3';
import { FlowFeatureSchema } from '../database/schema.js';

export class FlowFeatureRelationship {
  private db: Database.Database;
  private tableName: string = 'flow_features';

  constructor(db: Database.Database) {
    this.db = db;
  }

  async add(flow_id: string, feature_id: string): Promise<FlowFeatureSchema> {
    const stmt = this.db.prepare(
      `INSERT INTO ${this.tableName} (flow_id, feature_id) VALUES (?, ?)`,
    );
    stmt.run(flow_id, feature_id);
    return { flow_id, feature_id };
  }

  async remove(flow_id: string, feature_id: string): Promise<void> {
    const stmt = this.db.prepare(
      `DELETE FROM ${this.tableName} WHERE flow_id = ? AND feature_id = ?`,
    );
    stmt.run(flow_id, feature_id);
  }

  async findFeaturesByFlow(flow_id: string): Promise<string[]> {
    const stmt = this.db.prepare(
      `SELECT feature_id FROM ${this.tableName} WHERE flow_id = ?`,
    );
    const results = stmt.all(flow_id) as { feature_id: string }[];
    return results.map((r) => r.feature_id);
  }

  async findFlowsByFeature(feature_id: string): Promise<string[]> {
    const stmt = this.db.prepare(
      `SELECT flow_id FROM ${this.tableName} WHERE feature_id = ?`,
    );
    const results = stmt.all(feature_id) as { flow_id: string }[];
    return results.map((r) => r.flow_id);
  }
}
