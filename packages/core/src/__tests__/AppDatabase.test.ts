import { AppDatabase } from '../database/Database';
import path from 'path';
import fs from 'fs';

describe('AppDatabase', () => {
  const dbPath = ':memory:'; // Use in-memory database for testing
  let db: AppDatabase;

  beforeEach(() => {
    db = new AppDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
  });

  it('should initialize the migrations table', () => {
    const migrationsTable = db
      .getDB()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='migrations';",
      )
      .get() as { name: string };
    expect(migrationsTable).toBeDefined();
    expect(migrationsTable.name).toBe('migrations');
  });

  it('should apply migrations from the migrations folder', async () => {
    // Create a dummy migration file for testing
    const migrationsDir = path.join(__dirname, '../database/migrations');
    const dummyMigrationFile = '002_dummy_migration.sql';
    const dummyMigrationPath = path.join(migrationsDir, dummyMigrationFile);
    const dummyMigrationContent = `CREATE TABLE dummy_table (id INTEGER PRIMARY KEY);`;
    fs.writeFileSync(dummyMigrationPath, dummyMigrationContent);

    try {
      await db.migrate();

      const dummyTable = db
        .getDB()
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='dummy_table';",
        )
        .get() as { name: string };
      expect(dummyTable).toBeDefined();
      expect(dummyTable.name).toBe('dummy_table');

      const appliedMigration = db
        .getDB()
        .prepare('SELECT name FROM migrations WHERE name = ?')
        .get(dummyMigrationFile) as { name: string };
      expect(appliedMigration).toBeDefined();
      expect(appliedMigration.name).toBe(dummyMigrationFile);
    } finally {
      // Clean up the dummy migration file
      fs.unlinkSync(dummyMigrationPath);
    }
  });

  it('should handle transactions correctly', () => {
    const testTransaction = db.transaction(() => {
      db.getDB()
        .prepare('CREATE TABLE test_tx (id INTEGER PRIMARY KEY, name TEXT)')
        .run();
      db.getDB().prepare('INSERT INTO test_tx (name) VALUES (?)').run('test1');
      throw new Error('Rollback transaction'); // Force rollback
    });

    expect(() => testTransaction()).toThrow('Rollback transaction');

    const tableExists = db
      .getDB()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='test_tx';",
      )
      .get();
    expect(tableExists).toBeUndefined(); // Table should not exist due to rollback
  });

  it('should generate a valid UUID', () => {
    const id = db.generateId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
