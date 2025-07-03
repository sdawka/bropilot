import { AppDatabase } from '../database/Database.js';
import { ThingRepository } from '../repositories/ThingRepository.js';
import {
  ThingSchema,
  ModuleSchema,
  DomainSchema,
  ApplicationSchema,
} from '../database/schema.js';
import { ApplicationRepository } from '../repositories/ApplicationRepository.js';
import { DomainRepository } from '../repositories/DomainRepository.js';
import { ModuleRepository } from '../repositories/ModuleRepository.js';

describe('ThingRepository', () => {
  let db: AppDatabase;
  let applicationRepository: ApplicationRepository;
  let domainRepository: DomainRepository;
  let moduleRepository: ModuleRepository;
  let thingRepository: ThingRepository;
  let testApp: ApplicationSchema;
  let testDomain: DomainSchema;
  let testModule: ModuleSchema;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.migrate();
    applicationRepository = new ApplicationRepository(db.getDB());
    domainRepository = new DomainRepository(db.getDB());
    moduleRepository = new ModuleRepository(db.getDB());
    thingRepository = new ThingRepository(db.getDB());

    testApp = (await applicationRepository.create({
      id: db.generateId(),
      name: 'TestAppForThings',
      purpose: 'To test thing repository',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ApplicationSchema;

    testDomain = (await domainRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'TestDomainForThings',
      description: 'Description for TestDomainForThings',
      responsibilities: JSON.stringify(['general']),
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as DomainSchema;

    testModule = (await moduleRepository.create({
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'TestModuleForThings',
      description: 'Description for TestModuleForThings',
      type: 'core', // Changed from 'backend'
      interface: JSON.stringify({
        type: 'rpc_api',
        description: 'REST API for module',
      }), // Updated
      state: JSON.stringify({
        type: 'postgresql',
        schema: 'testmoduleforthings_schema',
      }), // Updated
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ModuleSchema;
  });

  afterEach(() => {
    db.close();
  });

  it('should create a new thing', async () => {
    const newThing: Partial<ThingSchema> = {
      id: db.generateId(),
      module_id: testModule.id,
      name: 'TestThing',
      description: 'Description for TestThing',
      schema: JSON.stringify({ type: 'object' }),
      invariants: JSON.stringify([]),
      relationships: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const createdThing = await thingRepository.create(newThing);
    expect(createdThing).toEqual(newThing);

    const foundThing = await thingRepository.findById(newThing.id!);
    expect(foundThing).toEqual(newThing);
  });

  it('should find a thing by ID', async () => {
    const thing1: Partial<ThingSchema> = {
      id: db.generateId(),
      module_id: testModule.id,
      name: 'Thing1',
      description: 'Description 1',
      schema: JSON.stringify({ type: 'string' }),
      invariants: JSON.stringify([]),
      relationships: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await thingRepository.create(thing1);

    const found = await thingRepository.findById(thing1.id!);
    expect(found).toEqual(thing1);

    const notFound = await thingRepository.findById('non-existent-id');
    expect(notFound).toBeNull();
  });

  it('should find all things', async () => {
    const thingA: Partial<ThingSchema> = {
      id: db.generateId(),
      module_id: testModule.id,
      name: 'ThingA',
      description: 'Description A',
      schema: JSON.stringify({ type: 'number' }),
      invariants: JSON.stringify([]),
      relationships: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const thingB: Partial<ThingSchema> = {
      id: db.generateId(),
      module_id: testModule.id,
      name: 'ThingB',
      description: 'Description B',
      schema: JSON.stringify({ type: 'boolean' }),
      invariants: JSON.stringify([]),
      relationships: JSON.stringify([]),
      created_at: Date.now() + 1,
      updated_at: Date.now() + 1,
    };
    await thingRepository.create(thingA);
    await thingRepository.create(thingB);

    const allThings = await thingRepository.findAll();
    expect(allThings).toEqual(expect.arrayContaining([thingA, thingB]));
    expect(allThings.length).toBe(2);
  });

  it('should update a thing', async () => {
    const thing: Partial<ThingSchema> = {
      id: db.generateId(),
      module_id: testModule.id,
      name: 'OriginalThing',
      description: 'Original Description',
      schema: JSON.stringify({ type: 'array' }),
      invariants: JSON.stringify([]),
      relationships: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await thingRepository.create(thing);

    const updatedDescription = 'Updated Description';
    const updatedThing = await thingRepository.update(thing.id!, {
      description: updatedDescription,
    });
    expect(updatedThing.description).toBe(updatedDescription);
    expect(updatedThing.name).toBe(thing.name);

    const foundThing = await thingRepository.findById(thing.id!);
    expect(foundThing!.description).toBe(updatedDescription);
  });

  it('should delete a thing', async () => {
    const thing: Partial<ThingSchema> = {
      id: db.generateId(),
      module_id: testModule.id,
      name: 'ThingToDelete',
      description: 'To be deleted',
      schema: JSON.stringify({ type: 'null' }),
      invariants: JSON.stringify([]),
      relationships: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await thingRepository.create(thing);

    let found = await thingRepository.findById(thing.id!);
    expect(found).toBeDefined();

    await thingRepository.delete(thing.id!);
    found = await thingRepository.findById(thing.id!);
    expect(found).toBeNull();
  });
});
