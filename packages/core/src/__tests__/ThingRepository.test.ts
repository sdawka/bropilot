import { AppDatabase } from '../database/Database';
import { ThingRepository } from '../repositories/ThingRepository';
import {
  ThingSchema,
  ModuleSchema,
  DomainSchema,
  ApplicationSchema,
} from '../database/schema';
import { ApplicationRepository } from '../repositories/ApplicationRepository';
import { DomainRepository } from '../repositories/DomainRepository';
import { ModuleRepository } from '../repositories/ModuleRepository';

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
      responsibilities: JSON.stringify([]),
    })) as DomainSchema;

    testModule = (await moduleRepository.create({
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'TestModuleForThings',
      description: 'Description for TestModuleForThings',
      type: 'backend',
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
      type: 'data_model',
      properties: JSON.stringify([{ key: 'prop1', value: 'value1' }]),
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
      type: 'ui_component',
      properties: '[]',
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
      type: 'service',
      properties: '[]',
    };
    const thingB: Partial<ThingSchema> = {
      id: db.generateId(),
      module_id: testModule.id,
      name: 'ThingB',
      description: 'Description B',
      type: 'data_model',
      properties: '[]',
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
      type: 'ui_component',
      properties: '[]',
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
      type: 'service',
      properties: '[]',
    };
    await thingRepository.create(thing);

    let found = await thingRepository.findById(thing.id!);
    expect(found).toBeDefined();

    await thingRepository.delete(thing.id!);
    found = await thingRepository.findById(thing.id!);
    expect(found).toBeNull();
  });
});
