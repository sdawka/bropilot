import { AppDatabase } from '../database/Database';
import { FlowModuleRelationship } from '../relationships/FlowModuleRelationship';
import { ApplicationRepository } from '../repositories/ApplicationRepository';
import { FlowRepository } from '../repositories/FlowRepository';
import { ModuleRepository } from '../repositories/ModuleRepository';
import { DomainRepository } from '../repositories/DomainRepository';
import {
  ApplicationSchema,
  FlowSchema,
  ModuleSchema,
  DomainSchema,
} from '../database/schema';

describe('FlowModuleRelationship', () => {
  let db: AppDatabase;
  let flowModuleRelationship: FlowModuleRelationship;
  let applicationRepository: ApplicationRepository;
  let flowRepository: FlowRepository;
  let moduleRepository: ModuleRepository;
  let domainRepository: DomainRepository;

  let testApp: ApplicationSchema;
  let testDomain: DomainSchema;
  let testFlow1: FlowSchema;
  let testFlow2: FlowSchema;
  let testModule1: ModuleSchema;
  let testModule2: ModuleSchema;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.migrate();
    flowModuleRelationship = new FlowModuleRelationship(db.getDB());
    applicationRepository = new ApplicationRepository(db.getDB());
    flowRepository = new FlowRepository(db.getDB());
    moduleRepository = new ModuleRepository(db.getDB());
    domainRepository = new DomainRepository(db.getDB());

    testApp = (await applicationRepository.create({
      id: db.generateId(),
      name: 'TestAppForFlowModule',
      purpose: 'To test flow-module relationship',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ApplicationSchema;

    testDomain = (await domainRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'TestDomainForFlowModule',
      description: 'Description for TestDomainForFlowModule',
      responsibilities: JSON.stringify([]),
    })) as DomainSchema;

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

    testModule1 = (await moduleRepository.create({
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'Module1',
      description: 'Description 1',
      type: 'frontend',
    })) as ModuleSchema;

    testModule2 = (await moduleRepository.create({
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'Module2',
      description: 'Description 2',
      type: 'backend',
    })) as ModuleSchema;
  });

  afterEach(() => {
    db.close();
  });

  it('should add a flow-module relationship', async () => {
    const relationship = await flowModuleRelationship.add(
      testFlow1.id,
      testModule1.id,
    );
    expect(relationship).toEqual({
      flow_id: testFlow1.id,
      module_id: testModule1.id,
    });

    const modules = await flowModuleRelationship.findModulesByFlow(
      testFlow1.id,
    );
    expect(modules).toEqual([testModule1.id]);
  });

  it('should remove a flow-module relationship', async () => {
    await flowModuleRelationship.add(testFlow1.id, testModule1.id);
    let modules = await flowModuleRelationship.findModulesByFlow(testFlow1.id);
    expect(modules).toEqual([testModule1.id]);

    await flowModuleRelationship.remove(testFlow1.id, testModule1.id);
    modules = await flowModuleRelationship.findModulesByFlow(testFlow1.id);
    expect(modules).toEqual([]);
  });

  it('should find modules by flow', async () => {
    await flowModuleRelationship.add(testFlow1.id, testModule1.id);
    await flowModuleRelationship.add(testFlow1.id, testModule2.id);

    const modules = await flowModuleRelationship.findModulesByFlow(
      testFlow1.id,
    );
    expect(modules).toEqual(
      expect.arrayContaining([testModule1.id, testModule2.id]),
    );
    expect(modules.length).toBe(2);
  });

  it('should find flows by module', async () => {
    await flowModuleRelationship.add(testFlow1.id, testModule1.id);
    await flowModuleRelationship.add(testFlow2.id, testModule1.id);

    const flows = await flowModuleRelationship.findFlowsByModule(
      testModule1.id,
    );
    expect(flows).toEqual(expect.arrayContaining([testFlow1.id, testFlow2.id]));
    expect(flows.length).toBe(2);
  });
});
