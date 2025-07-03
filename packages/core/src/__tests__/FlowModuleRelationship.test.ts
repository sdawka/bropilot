import { AppDatabase } from '../database/Database.js';
import { FlowModuleRelationship } from '../relationships/FlowModuleRelationship.js';
import { ApplicationRepository } from '../repositories/ApplicationRepository.js';
import { FlowRepository } from '../repositories/FlowRepository.js';
import { ModuleRepository } from '../repositories/ModuleRepository.js';
import { DomainRepository } from '../repositories/DomainRepository.js';
import {
  ApplicationSchema,
  FlowSchema,
  ModuleSchema,
  DomainSchema,
} from '../database/schema.js';

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
      application_id: testApp.id, // Added application_id
      name: 'TestDomainForFlowModule',
      description: 'Description for TestDomainForFlowModule',
      responsibilities: JSON.stringify(['general']), // Added responsibilities
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as DomainSchema;

    testModule1 = (await moduleRepository.create({
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'Module1',
      description: 'Description 1',
      type: 'ui', // Changed from 'frontend'
      interface: JSON.stringify({
        type: 'web_app',
        description: 'REST API for module',
      }), // Updated
      state: JSON.stringify({ type: 'nanostores', stores: [] }), // Updated
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ModuleSchema;

    testModule2 = (await moduleRepository.create({
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'Module2',
      description: 'Description 2',
      type: 'core', // Changed from 'backend'
      interface: JSON.stringify({
        type: 'rpc_api',
        description: 'GraphQL API for module',
      }), // Updated
      state: JSON.stringify({ type: 'postgresql', schema: 'module2_schema' }), // Updated
      created_at: Date.now() + 1,
      updated_at: Date.now() + 1,
    })) as ModuleSchema;

    testFlow1 = (await flowRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      module_id: testModule1.id,
      name: 'Flow1',
      description: 'Description 1',
      steps: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as FlowSchema;

    testFlow2 = (await flowRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      module_id: testModule1.id,
      name: 'Flow2',
      description: 'Description 2',
      steps: JSON.stringify([]),
      created_at: Date.now() + 1,
      updated_at: Date.now() + 1,
    })) as FlowSchema;
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
