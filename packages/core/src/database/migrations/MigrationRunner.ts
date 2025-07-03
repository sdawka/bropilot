import Database from 'better-sqlite3';
import fs from 'fs-extra';
import * as path from 'path';
import { fileURLToPath } from 'url';

export class MigrationRunner {
  private db: Database.Database;
  private migrationsPath: string;

  constructor(db: Database.Database) {
    this.db = db;
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    this.migrationsPath = path.join(__dirname, './'); // Current directory for migrations
  }

  async runAll(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const appliedMigrations = this.db
      .prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
      .all()
      .map((row: any) => row.version);

    const migrationFiles = (await fs.readdir(this.migrationsPath))
      .filter((file) => file.match(/^\d{3}_.*\.sql$/))
      .sort();

    for (const file of migrationFiles) {
      const version = parseInt(file.substring(0, 3), 10);
      const name = file.substring(4, file.length - 4); // Remove '000_' and '.sql'

      if (!appliedMigrations.includes(version)) {
        const migrationSql = await fs.readFile(
          path.join(this.migrationsPath, file),
          'utf8',
        );
        this.db.transaction(() => {
          this.db.exec(migrationSql);
          this.db
            .prepare(
              'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
            )
            .run(version, name);
          console.log(`Applied migration: ${file}`);
        })();
      }
    }
  }
}
