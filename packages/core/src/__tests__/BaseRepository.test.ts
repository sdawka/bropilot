import { AppDatabase } from '../database/Database.js';
import { BaseRepository } from '../repositories/BaseRepository.js';
import Database from 'better-sqlite3';

interface TestEntity {
  id: string;
  name: string;
  value: number;
}

class TestRepository extends BaseRepository<TestEntity> {
  constructor(db: Database.Database) {
    super(db, 'test_entities');
    db.exec(`
      CREATE TABLE IF NOT EXISTS test_entities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        value INTEGER NOT NULL
      );
    `);
  }
}

describe('BaseRepository', () => {
  let db: AppDatabase;
  let repository: TestRepository;

  beforeEach(() => {
    db = new AppDatabase(':memory:');
    repository = new TestRepository(db.getDB());
  });

  afterEach(() => {
    db.close();
  });

  it('should create a new entity', async () => {
    const newEntity: Partial<TestEntity> = {
      id: db.generateId(),
      name: 'Test1',
      value: 100,
    };
    const createdEntity = await repository.create(newEntity);
    expect(createdEntity).toEqual(newEntity);

    const foundEntity = await repository.findById(newEntity.id!);
    expect(foundEntity).toEqual(newEntity);
  });

  it('should find an entity by ID', async () => {
    const entity1: Partial<TestEntity> = {
      id: db.generateId(),
      name: 'Entity1',
      value: 10,
    };
    await repository.create(entity1);

    const found = await repository.findById(entity1.id!);
    expect(found).toEqual(entity1);

    const notFound = await repository.findById('non-existent-id');
    expect(notFound).toBeNull();
  });

  it('should find all entities', async () => {
    const entity1: Partial<TestEntity> = {
      id: db.generateId(),
      name: 'EntityA',
      value: 1,
    };
    const entity2: Partial<TestEntity> = {
      id: db.generateId(),
      name: 'EntityB',
      value: 2,
    };
    await repository.create(entity1);
    await repository.create(entity2);

    const allEntities = await repository.findAll();
    expect(allEntities).toEqual(expect.arrayContaining([entity1, entity2]));
    expect(allEntities.length).toBe(2);
  });

  it('should find entities with filters', async () => {
    const entity1: Partial<TestEntity> = {
      id: db.generateId(),
      name: 'Filter1',
      value: 10,
    };
    const entity2: Partial<TestEntity> = {
      id: db.generateId(),
      name: 'Filter2',
      value: 20,
    };
    const entity3: Partial<TestEntity> = {
      id: db.generateId(),
      name: 'Filter1',
      value: 30,
    };
    await repository.create(entity1);
    await repository.create(entity2);
    await repository.create(entity3);

    const filteredEntities = await repository.findAll({ name: 'Filter1' });
    expect(filteredEntities).toEqual(
      expect.arrayContaining([entity1, entity3]),
    );
    expect(filteredEntities.length).toBe(2);
  });

  it('should update an entity', async () => {
    const entity: Partial<TestEntity> = {
      id: db.generateId(),
      name: 'Original',
      value: 50,
    };
    await repository.create(entity);

    const updatedName = 'Updated';
    const updatedEntity = await repository.update(entity.id!, {
      name: updatedName,
    });
    expect(updatedEntity.name).toBe(updatedName);
    expect(updatedEntity.value).toBe(entity.value); // Value should remain unchanged

    const foundEntity = await repository.findById(entity.id!);
    expect(foundEntity!.name).toBe(updatedName);
  });

  it('should delete an entity', async () => {
    const entity: Partial<TestEntity> = {
      id: db.generateId(),
      name: 'ToDelete',
      value: 99,
    };
    await repository.create(entity);

    let found = await repository.findById(entity.id!);
    expect(found).toBeDefined();

    await repository.delete(entity.id!);
    found = await repository.findById(entity.id!);
    expect(found).toBeNull();
  });
});
