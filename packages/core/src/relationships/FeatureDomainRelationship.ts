import Database from 'better-sqlite3';
import { FeatureDomainSchema } from '../database/schema.js';

export class FeatureDomainRelationship {
  private db: Database.Database;
  private tableName: string = 'feature_domains';

  constructor(db: Database.Database) {
    this.db = db;
  }

  async add(
    feature_id: string,
    domain_id: string,
  ): Promise<FeatureDomainSchema> {
    const stmt = this.db.prepare(
      `INSERT INTO ${this.tableName} (feature_id, domain_id) VALUES (?, ?)`,
    );
    stmt.run(feature_id, domain_id);
    return { feature_id, domain_id };
  }

  async remove(feature_id: string, domain_id: string): Promise<void> {
    const stmt = this.db.prepare(
      `DELETE FROM ${this.tableName} WHERE feature_id = ? AND domain_id = ?`,
    );
    stmt.run(feature_id, domain_id);
  }

  async findDomainsByFeature(feature_id: string): Promise<string[]> {
    const stmt = this.db.prepare(
      `SELECT domain_id FROM ${this.tableName} WHERE feature_id = ?`,
    );
    const results = stmt.all(feature_id) as { domain_id: string }[];
    return results.map((r) => r.domain_id);
  }

  async findFeaturesByDomain(domain_id: string): Promise<string[]> {
    const stmt = this.db.prepare(
      `SELECT feature_id FROM ${this.tableName} WHERE domain_id = ?`,
    );
    const results = stmt.all(domain_id) as { feature_id: string }[];
    return results.map((r) => r.feature_id);
  }
}
