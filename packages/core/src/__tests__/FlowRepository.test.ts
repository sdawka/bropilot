import { AppDatabase } from '../database/Database';
import { FlowRepository } from '../repositories/FlowRepository';
import { FlowSchema, ApplicationSchema } from '../database/schema';
import { ApplicationRepository } from '../repositories/ApplicationRepository';

describe('FlowRepository', () => {
  let db: AppDatabase;
  let applicationRepository: ApplicationRepository;
  let flowRepository: FlowRepository;
  let testApp: ApplicationSchema;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.migrate();
    applicationRepository = new ApplicationRepository(db.getDB());
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
  });

  afterEach(() => {
    db.close();
  });

  it('should create a new flow', async () => {
    const newFlow: Partial<FlowSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      name: 'TestFlow',
      description: 'Description for TestFlow',
      steps: JSON.stringify(['step1', 'step2']),
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
      name: 'Flow1',
      description: 'Description 1',
      steps: '[]',
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
      name: 'FlowA',
      description: 'Description A',
      steps: '[]',
    };
    const flowB: Partial<FlowSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      name: 'FlowB',
      description: 'Description B',
      steps: '[]',
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
      name: 'OriginalFlow',
      description: 'Original Description',
      steps: '[]',
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
      name: 'FlowToDelete',
      description: 'To be deleted',
      steps: '[]',
    };
    await flowRepository.create(flow);

    let found = await flowRepository.findById(flow.id!);
    expect(found).toBeDefined();

    await flowRepository.delete(flow.id!);
    found = await flowRepository.findById(flow.id!);
    expect(found).toBeNull();
  });
});
