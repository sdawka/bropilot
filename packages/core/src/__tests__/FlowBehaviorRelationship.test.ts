import { AppDatabase } from '../database/Database';
import { FlowBehaviorRelationship } from '../relationships/FlowBehaviorRelationship';
import { ApplicationRepository } from '../repositories/ApplicationRepository';
import { FlowRepository } from '../repositories/FlowRepository';
import { BehaviorRepository } from '../repositories/BehaviorRepository';
import { ThingRepository } from '../repositories/ThingRepository';
import { ModuleRepository } from '../repositories/ModuleRepository';
import { DomainRepository } from '../repositories/DomainRepository';
import {
  ApplicationSchema,
  FlowSchema,
  BehaviorSchema,
  ThingSchema,
  ModuleSchema,
  DomainSchema,
} from '../database/schema';

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
      application_id: testApp.id,
      name: 'TestDomainForFlowBehavior',
      description: 'Description for TestDomainForFlowBehavior',
      responsibilities: JSON.stringify([]),
    })) as DomainSchema;

    testModule = (await moduleRepository.create({
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'TestModuleForFlowBehavior',
      description: 'Description for TestModuleForFlowBehavior',
      type: 'backend',
    })) as ModuleSchema;

    testThing = (await thingRepository.create({
      id: db.generateId(),
      module_id: testModule.id,
      name: 'TestThingForFlowBehavior',
      description: 'Description for TestThingForFlowBehavior',
      type: 'data_model',
      properties: JSON.stringify([]),
    })) as ThingSchema;

    testFlow1 = (await flowRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'Flow1',
      description: 'Description 1',
      steps: '[]',
    })) as FlowSchema;

    testFlow2 = (await flowRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'Flow2',
      description: 'Description 2',
      steps: '[]',
    })) as FlowSchema;

    testBehavior1 = (await behaviorRepository.create({
      id: db.generateId(),
      thing_id: testThing.id,
      name: 'Behavior1',
      description: 'Description 1',
      trigger_event: 'click',
      actions: '[]',
    })) as BehaviorSchema;

    testBehavior2 = (await behaviorRepository.create({
      id: db.generateId(),
      thing_id: testThing.id,
      name: 'Behavior2',
      description: 'Description 2',
      trigger_event: 'load',
      actions: '[]',
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
