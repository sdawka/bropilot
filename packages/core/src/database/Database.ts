import Database from 'better-sqlite3';
import * as path from 'path';
import { fileURLToPath } from 'url';
import * as fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

interface Migration {
  id: number;
  name: string;
  created_at: number;
}

export class AppDatabase {
  private db: Database.Database;
  private migrationsPath: string;

  constructor(dbPath: string = ':memory:', migrationsPath?: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.migrationsPath = migrationsPath || path.join(__dirname, 'migrations');
    this.initMigrationsTable();
  }

  private initMigrationsTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      );
    `);
  }

  async migrate() {
    const appliedMigrations = this.db
      .prepare('SELECT name FROM migrations')
      .all() as { name: string }[];
    const appliedMigrationNames = new Set(appliedMigrations.map((m) => m.name));

    const migrationFiles = fs
      .readdirSync(this.migrationsPath)
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of migrationFiles) {
      if (!appliedMigrationNames.has(file)) {
        const migrationSql = fs.readFileSync(
          path.join(this.migrationsPath, file),
          'utf8',
        );
        try {
          this.db.exec(migrationSql);
          this.db
            .prepare('INSERT INTO migrations (name, created_at) VALUES (?, ?)')
            .run(file, Date.now());
          console.log(`Applied migration: ${file}`);
        } catch (error) {
          console.error(`Failed to apply migration ${file}:`, error);
          throw error;
        }
      }
    }
  }

  getDB(): Database.Database {
    return this.db;
  }

  close(): void {
    this.db.close();
  }

  transaction<T>(fn: (...args: any[]) => T): (...args: any[]) => T {
    const func = this.db.transaction(fn);
    return (...args: any[]) => func(...args);
  }

  // Helper for UUID generation
  generateId(): string {
    return uuidv4();
  }
}
