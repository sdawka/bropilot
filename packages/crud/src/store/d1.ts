import type { CrudStore, D1Database, Record } from "../types.js";

/**
 * D1-backed store using prepared statements.
 * Designed for Cloudflare Workers D1 (SQLite-compatible).
 *
 * Each collection maps to a database table. Records are stored as
 * JSON in a `data` column alongside the `id` primary key.
 *
 * Table schema (auto-created if needed):
 *   CREATE TABLE IF NOT EXISTS {collection} (
 *     id TEXT PRIMARY KEY,
 *     data TEXT NOT NULL
 *   );
 */
export class D1Store implements CrudStore {
  constructor(private db: D1Database) {}

  private async ensureTable(collection: string): Promise<void> {
    const stmt = this.db.prepare(
      `CREATE TABLE IF NOT EXISTS "${collection}" (id TEXT PRIMARY KEY, data TEXT NOT NULL)`
    );
    await stmt.run();
  }

  async create(collection: string, record: Record): Promise<void> {
    await this.ensureTable(collection);
    const stmt = this.db.prepare(
      `INSERT INTO "${collection}" (id, data) VALUES (?, ?)`
    );
    await stmt.bind(record.id, JSON.stringify(record)).run();
  }

  async read(collection: string, id: string): Promise<Record | null> {
    await this.ensureTable(collection);
    const stmt = this.db.prepare(
      `SELECT data FROM "${collection}" WHERE id = ?`
    );
    const row = await stmt.bind(id).first<string>("data");
    if (row === null) return null;
    return JSON.parse(row) as Record;
  }

  async update(collection: string, id: string, record: Record): Promise<boolean> {
    await this.ensureTable(collection);
    const stmt = this.db.prepare(
      `UPDATE "${collection}" SET data = ? WHERE id = ?`
    );
    const result = await stmt.bind(JSON.stringify(record), id).run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async delete(collection: string, id: string): Promise<boolean> {
    await this.ensureTable(collection);
    const stmt = this.db.prepare(
      `DELETE FROM "${collection}" WHERE id = ?`
    );
    const result = await stmt.bind(id).run();
    return (result.meta?.changes ?? 0) > 0;
  }

  async list(collection: string): Promise<Record[]> {
    await this.ensureTable(collection);
    const stmt = this.db.prepare(
      `SELECT data FROM "${collection}" ORDER BY id`
    );
    const result = await stmt.all<{ data: string }>();
    return result.results.map((row) => JSON.parse(row.data) as Record);
  }
}
