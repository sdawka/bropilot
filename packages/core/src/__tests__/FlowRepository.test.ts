import { AppDatabase } from '../database/Database.js';
import { FlowRepository } from '../repositories/FlowRepository.js';
import {
  FlowSchema,
  ModuleSchema,
  DomainSchema,
  ApplicationSchema,
} from '../database/schema.js';
import { ApplicationRepository } from '../repositories/ApplicationRepository.js';
import { DomainRepository } from '../repositories/DomainRepository.js';
import { ModuleRepository } from '../repositories/ModuleRepository.js';

describe('FlowRepository', () => {
  let db: AppDatabase;
  let applicationRepository: ApplicationRepository;
  let domainRepository: DomainRepository;
  let moduleRepository: ModuleRepository;
  let flowRepository: FlowRepository;
  let testApp: ApplicationSchema;
  let testDomain: DomainSchema;
  let testModule: ModuleSchema;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.migrate();
    applicationRepository = new ApplicationRepository(db.getDB());
    domainRepository = new DomainRepository(db.getDB());
    moduleRepository = new ModuleRepository(db.getDB());
    flowRepository = new FlowRepository(db.getDB());

    testApp = (await applicationRepository.create({
      id: db.generateId(),
      name: 'TestAppForFlows',
      purpose: 'To test flow repository',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ApplicationSchema;

    testDomain = (await domainRepository.create({
      id: db.generateId(),
      application_id: testApp.id, // Added application_id
      name: 'TestDomainForFlows',
      description: 'Description for TestDomainForFlows',
      responsibilities: JSON.stringify(['general']), // Added responsibilities
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as DomainSchema;

    testModule = (await moduleRepository.create({
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'TestModuleForFlows',
      description: 'Description for TestModuleForFlows',
      type: 'core', // Changed from 'backend'
      interface: JSON.stringify({
        type: 'rpc_api',
        description: 'REST API for module',
      }), // Updated
      state: JSON.stringify({
        type: 'postgresql',
        schema: 'testmoduleforflows_schema',
      }), // Updated
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ModuleSchema;
  });

  afterEach(() => {
    db.close();
  });

  it('should create a new flow', async () => {
    const newFlow: Partial<FlowSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      module_id: testModule.id, // Assuming testModule is available or created
      name: 'TestFlow',
      description: 'Description for TestFlow',
      steps: JSON.stringify(['step1', 'step2']),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const createdFlow = await flowRepository.create(newFlow);
    expect(createdFlow).toEqual(newFlow);

    const foundFlow = await flowRepository.findById(newFlow.id!);
    expect(foundFlow).toEqual(newFlow);
  });

  it('should find a flow by ID', async () => {
    const flow1: Partial<FlowSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      module_id: testModule.id, // Assuming testModule is available or created
      name: 'Flow1',
      description: 'Description 1',
      steps: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await flowRepository.create(flow1);

    const found = await flowRepository.findById(flow1.id!);
    expect(found).toEqual(flow1);

    const notFound = await flowRepository.findById('non-existent-id');
    expect(notFound).toBeNull();
  });

  it('should find all flows', async () => {
    const flowA: Partial<FlowSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      module_id: testModule.id, // Assuming testModule is available or created
      name: 'FlowA',
      description: 'Description A',
      steps: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const flowB: Partial<FlowSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      module_id: testModule.id, // Assuming testModule is available or created
      name: 'FlowB',
      description: 'Description B',
      steps: JSON.stringify([]),
      created_at: Date.now() + 1,
      updated_at: Date.now() + 1,
    };
    await flowRepository.create(flowA);
    await flowRepository.create(flowB);

    const allFlows = await flowRepository.findAll();
    expect(allFlows).toEqual(expect.arrayContaining([flowA, flowB]));
    expect(allFlows.length).toBe(2);
  });

  it('should update a flow', async () => {
    const flow: Partial<FlowSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      module_id: testModule.id, // Assuming testModule is available or created
      name: 'OriginalFlow',
      description: 'Original Description',
      steps: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await flowRepository.create(flow);

    const updatedDescription = 'Updated Description';
    const updatedFlow = await flowRepository.update(flow.id!, {
      description: updatedDescription,
    });
    expect(updatedFlow.description).toBe(updatedDescription);
    expect(updatedFlow.name).toBe(flow.name);

    const foundFlow = await flowRepository.findById(flow.id!);
    expect(foundFlow!.description).toBe(updatedDescription);
  });

  it('should delete a flow', async () => {
    const flow: Partial<FlowSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      module_id: testModule.id, // Assuming testModule is available or created
      name: 'FlowToDelete',
      description: 'To be deleted',
      steps: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await flowRepository.create(flow);

    let found = await flowRepository.findById(flow.id!);
    expect(found).toBeDefined();

    await flowRepository.delete(flow.id!);
    found = await flowRepository.findById(flow.id!);
    expect(found).toBeNull();
  });
});
