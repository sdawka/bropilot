import Database from 'better-sqlite3';

export interface Repository<T> {
  create(data: Partial<T>): Promise<T>;
  findById(id: string): Promise<T | null>;
  findAll(filters?: Partial<T>): Promise<T[]>;
  update(id: string, data: Partial<T>): Promise<T>;
  delete(id: string): Promise<void>;
}

export abstract class BaseRepository<T extends { id: string }>
  implements Repository<T>
{
  protected db: Database.Database;
  protected tableName: string;

  constructor(db: Database.Database, tableName: string) {
    this.db = db;
    this.tableName = tableName;
  }

  async create(data: Partial<T>): Promise<T> {
    const columns = Object.keys(data).join(', ');
    const placeholders = Object.keys(data)
      .map(() => '?')
      .join(', ');
    const values = Object.values(data);

    const stmt = this.db.prepare(
      `INSERT INTO ${this.tableName} (${columns}) VALUES (${placeholders}) RETURNING *`,
    );
    const result = stmt.get(...values) as T;
    return result;
  }

  async findById(id: string): Promise<T | null> {
    const stmt = this.db.prepare(
      `SELECT * FROM ${this.tableName} WHERE id = ?`,
    );
    const result = stmt.get(id) as T | undefined;
    return result || null;
  }

  async findAll(filters?: Partial<T>): Promise<T[]> {
    let query = `SELECT * FROM ${this.tableName}`;
    const values: any[] = [];

    if (filters && Object.keys(filters).length > 0) {
      const conditions = Object.keys(filters)
        .map((key) => {
          values.push((filters as any)[key]);
          return `${key} = ?`;
        })
        .join(' AND ');
      query += ` WHERE ${conditions}`;
    }

    const stmt = this.db.prepare(query);
    const results = stmt.all(...values) as T[];
    return results;
  }

  async update(id: string, data: Partial<T>): Promise<T> {
    const updates = Object.keys(data)
      .map((key) => `${key} = ?`)
      .join(', ');
    const values = Object.values(data);

    const stmt = this.db.prepare(
      `UPDATE ${this.tableName} SET ${updates} WHERE id = ? RETURNING *`,
    );
    const result = stmt.get(...values, id) as T;
    return result;
  }

  async delete(id: string): Promise<void> {
    const stmt = this.db.prepare(`DELETE FROM ${this.tableName} WHERE id = ?`);
    stmt.run(id);
  }
}
