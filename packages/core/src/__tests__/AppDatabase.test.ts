import * as os from 'os';
import { AppDatabase } from '../database/Database.js';
import * as path from 'path';
import * as fs from 'fs';

describe('AppDatabase', () => {
  const dbPath = ':memory:'; // Use in-memory database for testing
  let db: AppDatabase;

  beforeEach(() => {
    db = new AppDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
  });

  it('should apply migrations from the migrations folder', async () => {
    // Use a temporary directory for migrations
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrations-'));
    const dummyMigrationFile = '002_dummy_migration.sql';
    const dummyMigrationPath = path.join(tempDir, dummyMigrationFile);
    const dummyMigrationContent = `CREATE TABLE dummy_table (id INTEGER PRIMARY KEY);`;
    fs.writeFileSync(dummyMigrationPath, dummyMigrationContent);

    // Use a new AppDatabase instance with the temp migrations path
    const tempDb = new AppDatabase(dbPath, tempDir);
    try {
      await tempDb.migrate();

      const dummyTable = tempDb
        .getDB()
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='dummy_table';",
        )
        .get() as { name: string };
      expect(dummyTable).toBeDefined();
      expect(dummyTable.name).toBe('dummy_table');

      const appliedMigration = tempDb
        .getDB()
        .prepare('SELECT name FROM migrations WHERE name = ?')
        .get(dummyMigrationFile) as { name: string };
      expect(appliedMigration).toBeDefined();
      expect(appliedMigration.name).toBe(dummyMigrationFile);
    } finally {
      // Clean up the dummy migration file and temp dir
      fs.unlinkSync(dummyMigrationPath);
      fs.rmdirSync(tempDir);
      tempDb.close();
    }
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

  it('should handle transactions correctly', () => {
    // Create the table outside the transaction
    db.getDB()
      .prepare('CREATE TABLE test_tx (id INTEGER PRIMARY KEY, name TEXT)')
      .run();

    const testTransaction = db.transaction(() => {
      db.getDB().prepare('INSERT INTO test_tx (name) VALUES (?)').run('test1');
      throw new Error('Rollback transaction'); // Force rollback
    });

    expect(() => testTransaction()).toThrow('Rollback transaction');

    // Table should still exist
    const tableExists = db
      .getDB()
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='test_tx';",
      )
      .get();
    expect(tableExists).toBeDefined();

    // Row should not exist due to rollback
    const row = db
      .getDB()
      .prepare('SELECT * FROM test_tx WHERE name = ?')
      .get('test1');
    expect(row).toBeUndefined();
  });

  it('should generate a valid UUID', () => {
    const id = db.generateId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });
});
