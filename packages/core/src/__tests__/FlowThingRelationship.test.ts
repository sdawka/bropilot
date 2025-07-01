import { AppDatabase } from '../database/Database';
import { FlowThingRelationship } from '../relationships/FlowThingRelationship';
import { ApplicationRepository } from '../repositories/ApplicationRepository';
import { FlowRepository } from '../repositories/FlowRepository';
import { ThingRepository } from '../repositories/ThingRepository';
import { ModuleRepository } from '../repositories/ModuleRepository';
import { DomainRepository } from '../repositories/DomainRepository';
import {
  ApplicationSchema,
  FlowSchema,
  ThingSchema,
  ModuleSchema,
  DomainSchema,
} from '../database/schema';

describe('FlowThingRelationship', () => {
  let db: AppDatabase;
  let flowThingRelationship: FlowThingRelationship;
  let applicationRepository: ApplicationRepository;
  let flowRepository: FlowRepository;
  let thingRepository: ThingRepository;
  let moduleRepository: ModuleRepository;
  let domainRepository: DomainRepository;

  let testApp: ApplicationSchema;
  let testDomain: DomainSchema;
  let testModule: ModuleSchema;
  let testFlow1: FlowSchema;
  let testFlow2: FlowSchema;
  let testThing1: ThingSchema;
  let testThing2: ThingSchema;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.migrate();
    flowThingRelationship = new FlowThingRelationship(db.getDB());
    applicationRepository = new ApplicationRepository(db.getDB());
    flowRepository = new FlowRepository(db.getDB());
    thingRepository = new ThingRepository(db.getDB());
    moduleRepository = new ModuleRepository(db.getDB());
    domainRepository = new DomainRepository(db.getDB());

    testApp = (await applicationRepository.create({
      id: db.generateId(),
      name: 'TestAppForFlowThing',
      purpose: 'To test flow-thing relationship',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ApplicationSchema;

    testDomain = (await domainRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'TestDomainForFlowThing',
      description: 'Description for TestDomainForFlowThing',
      responsibilities: JSON.stringify([]),
    })) as DomainSchema;

    testModule = (await moduleRepository.create({
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'TestModuleForFlowThing',
      description: 'Description for TestModuleForFlowThing',
      type: 'backend',
    })) as ModuleSchema;

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

    testThing1 = (await thingRepository.create({
      id: db.generateId(),
      module_id: testModule.id,
      name: 'Thing1',
      description: 'Description 1',
      type: 'data_model',
      properties: '[]',
    })) as ThingSchema;

    testThing2 = (await thingRepository.create({
      id: db.generateId(),
      module_id: testModule.id,
      name: 'Thing2',
      description: 'Description 2',
      type: 'ui_component',
      properties: '[]',
    })) as ThingSchema;
  });

  afterEach(() => {
    db.close();
  });

  it('should add a flow-thing relationship', async () => {
    const relationship = await flowThingRelationship.add(
      testFlow1.id,
      testThing1.id,
    );
    expect(relationship).toEqual({
      flow_id: testFlow1.id,
      thing_id: testThing1.id,
    });

    const things = await flowThingRelationship.findThingsByFlow(testFlow1.id);
    expect(things).toEqual([testThing1.id]);
  });

  it('should remove a flow-thing relationship', async () => {
    await flowThingRelationship.add(testFlow1.id, testThing1.id);
    let things = await flowThingRelationship.findThingsByFlow(testFlow1.id);
    expect(things).toEqual([testThing1.id]);

    await flowThingRelationship.remove(testFlow1.id, testThing1.id);
    things = await flowThingRelationship.findThingsByFlow(testFlow1.id);
    expect(things).toEqual([]);
  });

  it('should find things by flow', async () => {
    await flowThingRelationship.add(testFlow1.id, testThing1.id);
    await flowThingRelationship.add(testFlow1.id, testThing2.id);

    const things = await flowThingRelationship.findThingsByFlow(testFlow1.id);
    expect(things).toEqual(
      expect.arrayContaining([testThing1.id, testThing2.id]),
    );
    expect(things.length).toBe(2);
  });

  it('should find flows by thing', async () => {
    await flowThingRelationship.add(testFlow1.id, testThing1.id);
    await flowThingRelationship.add(testFlow2.id, testThing1.id);

    const flows = await flowThingRelationship.findFlowsByThing(testThing1.id);
    expect(flows).toEqual(expect.arrayContaining([testFlow1.id, testFlow2.id]));
    expect(flows.length).toBe(2);
  });
});
