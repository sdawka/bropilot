import { AppDatabase } from '../database/Database.js';
import { FlowBehaviorRelationship } from '../relationships/FlowBehaviorRelationship.js';
import { ApplicationRepository } from '../repositories/ApplicationRepository.js';
import { FlowRepository } from '../repositories/FlowRepository.js';
import { BehaviorRepository } from '../repositories/BehaviorRepository.js';
import { ThingRepository } from '../repositories/ThingRepository.js';
import { ModuleRepository } from '../repositories/ModuleRepository.js';
import { DomainRepository } from '../repositories/DomainRepository.js';
import {
  ApplicationSchema,
  FlowSchema,
  BehaviorSchema,
  ThingSchema,
  ModuleSchema,
  DomainSchema,
} from '../database/schema.js';

describe('FlowBehaviorRelationship', () => {
  let db: AppDatabase;
  let flowBehaviorRelationship: FlowBehaviorRelationship;
  let applicationRepository: ApplicationRepository;
  let flowRepository: FlowRepository;
  let behaviorRepository: BehaviorRepository;
  let thingRepository: ThingRepository;
  let moduleRepository: ModuleRepository;
  let domainRepository: DomainRepository;

  let testApp: ApplicationSchema;
  let testDomain: DomainSchema;
  let testModule: ModuleSchema;
  let testThing: ThingSchema;
  let testFlow1: FlowSchema;
  let testFlow2: FlowSchema;
  let testBehavior1: BehaviorSchema;
  let testBehavior2: BehaviorSchema;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.migrate();
    flowBehaviorRelationship = new FlowBehaviorRelationship(db.getDB());
    applicationRepository = new ApplicationRepository(db.getDB());
    flowRepository = new FlowRepository(db.getDB());
    behaviorRepository = new BehaviorRepository(db.getDB());
    thingRepository = new ThingRepository(db.getDB());
    moduleRepository = new ModuleRepository(db.getDB());
    domainRepository = new DomainRepository(db.getDB());

    testApp = (await applicationRepository.create({
      id: db.generateId(),
      name: 'TestAppForFlowBehavior',
      purpose: 'To test flow-behavior relationship',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ApplicationSchema;

    testDomain = (await domainRepository.create({
      id: db.generateId(),
      application_id: testApp.id, // Added application_id
      name: 'TestDomainForFlowBehavior',
      description: 'Description for TestDomainForFlowBehavior',
      responsibilities: JSON.stringify(['general']), // Added responsibilities
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as DomainSchema;

    testModule = (await moduleRepository.create({
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'TestModuleForFlowBehavior',
      description: 'Description for TestModuleForFlowBehavior',
      type: 'core', // Changed from 'backend'
      interface: JSON.stringify({
        type: 'rpc_api',
        description: 'REST API for module',
      }), // Updated
      state: JSON.stringify({
        type: 'postgresql',
        schema: 'testmoduleforflowbehavior_schema',
      }), // Updated
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ModuleSchema;

    testThing = (await thingRepository.create({
      id: db.generateId(),
      module_id: testModule.id,
      name: 'TestThingForFlowBehavior',
      description: 'Description for TestThingForFlowBehavior',
      schema: JSON.stringify({ type: 'object' }),
      invariants: JSON.stringify([]),
      relationships: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ThingSchema;

    testFlow1 = (await flowRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      module_id: testModule.id,
      name: 'Flow1',
      description: 'Description 1',
      steps: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as FlowSchema;

    testFlow2 = (await flowRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      module_id: testModule.id,
      name: 'Flow2',
      description: 'Description 2',
      steps: JSON.stringify([]),
      created_at: Date.now() + 1,
      updated_at: Date.now() + 1,
    })) as FlowSchema;

    testBehavior1 = (await behaviorRepository.create({
      id: db.generateId(),
      module_id: testModule.id,
      name: 'Behavior1',
      description: 'Description 1',
      input_schema: JSON.stringify({ type: 'object' }),
      output_schema: JSON.stringify({ type: 'object' }),
      actions: JSON.stringify([]),
      trigger: 'onEvent',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as BehaviorSchema;

    testBehavior2 = (await behaviorRepository.create({
      id: db.generateId(),
      module_id: testModule.id,
      name: 'Behavior2',
      description: 'Description 2',
      input_schema: JSON.stringify({ type: 'string' }),
      output_schema: JSON.stringify({ type: 'string' }),
      actions: JSON.stringify([]),
      trigger: 'onEvent',
      created_at: Date.now() + 1,
      updated_at: Date.now() + 1,
    })) as BehaviorSchema;
  });

  afterEach(() => {
    db.close();
  });

  it('should add a flow-behavior relationship', async () => {
    const relationship = await flowBehaviorRelationship.add(
      testFlow1.id,
      testBehavior1.id,
    );
    expect(relationship).toEqual({
      flow_id: testFlow1.id,
      behavior_id: testBehavior1.id,
    });

    const behaviors = await flowBehaviorRelationship.findBehaviorsByFlow(
      testFlow1.id,
    );
    expect(behaviors).toEqual([testBehavior1.id]);
  });

  it('should remove a flow-behavior relationship', async () => {
    await flowBehaviorRelationship.add(testFlow1.id, testBehavior1.id);
    let behaviors = await flowBehaviorRelationship.findBehaviorsByFlow(
      testFlow1.id,
    );
    expect(behaviors).toEqual([testBehavior1.id]);

    await flowBehaviorRelationship.remove(testFlow1.id, testBehavior1.id);
    behaviors = await flowBehaviorRelationship.findBehaviorsByFlow(
      testFlow1.id,
    );
    expect(behaviors).toEqual([]);
  });

  it('should find behaviors by flow', async () => {
    await flowBehaviorRelationship.add(testFlow1.id, testBehavior1.id);
    await flowBehaviorRelationship.add(testFlow1.id, testBehavior2.id);

    const behaviors = await flowBehaviorRelationship.findBehaviorsByFlow(
      testFlow1.id,
    );
    expect(behaviors).toEqual(
      expect.arrayContaining([testBehavior1.id, testBehavior2.id]),
    );
    expect(behaviors.length).toBe(2);
  });

  it('should find flows by behavior', async () => {
    await flowBehaviorRelationship.add(testFlow1.id, testBehavior1.id);
    await flowBehaviorRelationship.add(testFlow2.id, testBehavior1.id);

    const flows = await flowBehaviorRelationship.findFlowsByBehavior(
      testBehavior1.id,
    );
    expect(flows).toEqual(expect.arrayContaining([testFlow1.id, testFlow2.id]));
    expect(flows.length).toBe(2);
  });
});
