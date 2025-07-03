import { AppDatabase } from '../database/Database.js';
import { BehaviorRepository } from '../repositories/BehaviorRepository.js';
import {
  BehaviorSchema,
  ThingSchema,
  ModuleSchema,
  DomainSchema,
  ApplicationSchema,
} from '../database/schema.js';
import { ApplicationRepository } from '../repositories/ApplicationRepository.js';
import { DomainRepository } from '../repositories/DomainRepository.js';
import { ModuleRepository } from '../repositories/ModuleRepository.js';
import { ThingRepository } from '../repositories/ThingRepository.js';

describe('BehaviorRepository', () => {
  let db: AppDatabase;
  let applicationRepository: ApplicationRepository;
  let domainRepository: DomainRepository;
  let moduleRepository: ModuleRepository;
  let thingRepository: ThingRepository;
  let behaviorRepository: BehaviorRepository;
  let testApp: ApplicationSchema;
  let testDomain: DomainSchema;
  let testModule: ModuleSchema;
  let testThing: ThingSchema;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.migrate();
    applicationRepository = new ApplicationRepository(db.getDB());
    domainRepository = new DomainRepository(db.getDB());
    moduleRepository = new ModuleRepository(db.getDB());
    thingRepository = new ThingRepository(db.getDB());
    behaviorRepository = new BehaviorRepository(db.getDB());

    testApp = (await applicationRepository.create({
      id: db.generateId(),
      name: 'TestAppForBehaviors',
      purpose: 'To test behavior repository',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ApplicationSchema;

    testDomain = (await domainRepository.create({
      id: db.generateId(),
      application_id: testApp.id, // Added application_id
      name: 'TestDomainForBehaviors',
      description: 'Description for TestDomainForBehaviors',
      responsibilities: JSON.stringify(['general']), // Added responsibilities
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as DomainSchema;

    testModule = (await moduleRepository.create({
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'TestModuleForBehaviors',
      description: 'Description for TestModuleForBehaviors',
      type: 'core', // Changed from 'backend'
      interface: JSON.stringify({
        type: 'rpc_api',
        description: 'REST API for module',
      }), // Updated
      state: JSON.stringify({
        type: 'postgresql',
        schema: 'testmoduleforbehaviors_schema',
      }), // Updated
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ModuleSchema;

    testThing = (await thingRepository.create({
      id: db.generateId(),
      module_id: testModule.id,
      name: 'TestThingForBehaviors',
      description: 'Description for TestThingForBehaviors',
      schema: JSON.stringify({ type: 'object' }),
      invariants: JSON.stringify([]),
      relationships: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ThingSchema;
  });

  afterEach(() => {
    db.close();
  });

  it('should create a new behavior', async () => {
    const newBehavior: Partial<BehaviorSchema> = {
      id: db.generateId(),
      module_id: testModule.id,
      name: 'TestBehavior',
      description: 'Description for TestBehavior',
      input_schema: JSON.stringify({ type: 'object' }),
      output_schema: JSON.stringify({ type: 'object' }),
      actions: JSON.stringify(['action1', 'action2']),
      trigger: 'onEvent',
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const createdBehavior = await behaviorRepository.create(newBehavior);
    expect(createdBehavior).toEqual(newBehavior);

    const foundBehavior = await behaviorRepository.findById(newBehavior.id!);
    expect(foundBehavior).toEqual(newBehavior);
  });

  it('should find a behavior by ID', async () => {
    const behavior1: Partial<BehaviorSchema> = {
      id: db.generateId(),
      module_id: testModule.id,
      name: 'Behavior1',
      description: 'Description 1',
      input_schema: JSON.stringify({ type: 'string' }),
      output_schema: JSON.stringify({ type: 'string' }),
      actions: JSON.stringify([]),
      trigger: 'onEvent',
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await behaviorRepository.create(behavior1);

    const found = await behaviorRepository.findById(behavior1.id!);
    expect(found).toEqual(behavior1);

    const notFound = await behaviorRepository.findById('non-existent-id');
    expect(notFound).toBeNull();
  });

  it('should find all behaviors', async () => {
    const behaviorA: Partial<BehaviorSchema> = {
      id: db.generateId(),
      module_id: testModule.id,
      name: 'BehaviorA',
      description: 'Description A',
      input_schema: JSON.stringify({ type: 'number' }),
      output_schema: JSON.stringify({ type: 'number' }),
      actions: JSON.stringify([]),
      trigger: 'onEvent',
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const behaviorB: Partial<BehaviorSchema> = {
      id: db.generateId(),
      module_id: testModule.id,
      name: 'BehaviorB',
      description: 'Description B',
      input_schema: JSON.stringify({ type: 'boolean' }),
      output_schema: JSON.stringify({ type: 'boolean' }),
      actions: JSON.stringify([]),
      trigger: 'onEvent',
      created_at: Date.now() + 1,
      updated_at: Date.now() + 1,
    };
    await behaviorRepository.create(behaviorA);
    await behaviorRepository.create(behaviorB);

    const allBehaviors = await behaviorRepository.findAll();
    expect(allBehaviors).toEqual(
      expect.arrayContaining([behaviorA, behaviorB]),
    );
    expect(allBehaviors.length).toBe(2);
  });

  it('should update a behavior', async () => {
    const behavior: Partial<BehaviorSchema> = {
      id: db.generateId(),
      module_id: testModule.id,
      name: 'OriginalBehavior',
      description: 'Original Description',
      input_schema: JSON.stringify({ type: 'array' }),
      output_schema: JSON.stringify({ type: 'array' }),
      actions: JSON.stringify([]),
      trigger: 'onEvent',
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await behaviorRepository.create(behavior);

    const updatedDescription = 'Updated Description';
    const updatedBehavior = await behaviorRepository.update(behavior.id!, {
      description: updatedDescription,
    });
    expect(updatedBehavior.description).toBe(updatedDescription);
    expect(updatedBehavior.name).toBe(behavior.name);

    const foundBehavior = await behaviorRepository.findById(behavior.id!);
    expect(foundBehavior!.description).toBe(updatedDescription);
  });

  it('should delete a behavior', async () => {
    const behavior: Partial<BehaviorSchema> = {
      id: db.generateId(),
      module_id: testModule.id,
      name: 'BehaviorToDelete',
      description: 'To be deleted',
      input_schema: JSON.stringify({ type: 'null' }),
      output_schema: JSON.stringify({ type: 'null' }),
      actions: JSON.stringify([]),
      trigger: 'onEvent',
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await behaviorRepository.create(behavior);

    let found = await behaviorRepository.findById(behavior.id!);
    expect(found).toBeDefined();

    await behaviorRepository.delete(behavior.id!);
    found = await behaviorRepository.findById(behavior.id!);
    expect(found).toBeNull();
  });
});
