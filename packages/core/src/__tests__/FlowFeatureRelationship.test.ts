import { AppDatabase } from '../database/Database.js';
import { FlowFeatureRelationship } from '../relationships/FlowFeatureRelationship.js';
import { ApplicationRepository } from '../repositories/ApplicationRepository.js';
import { FlowRepository } from '../repositories/FlowRepository.js';
import { FeatureRepository } from '../repositories/FeatureRepository.js';
import { DomainRepository } from '../repositories/DomainRepository.js';
import { ModuleRepository } from '../repositories/ModuleRepository.js';
import {
  ApplicationSchema,
  FlowSchema,
  FeatureSchema,
  DomainSchema,
  ModuleSchema,
} from '../database/schema.js';

describe('FlowFeatureRelationship', () => {
  let db: AppDatabase;
  let flowFeatureRelationship: FlowFeatureRelationship;
  let applicationRepository: ApplicationRepository;
  let flowRepository: FlowRepository;
  let featureRepository: FeatureRepository;
  let domainRepository: DomainRepository;
  let moduleRepository: ModuleRepository;

  let testApp: ApplicationSchema;
  let testDomain: DomainSchema;
  let testModule: ModuleSchema;
  let testFlow1: FlowSchema;
  let testFlow2: FlowSchema;
  let testFeature1: FeatureSchema;
  let testFeature2: FeatureSchema;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.migrate();
    flowFeatureRelationship = new FlowFeatureRelationship(db.getDB());
    applicationRepository = new ApplicationRepository(db.getDB());
    flowRepository = new FlowRepository(db.getDB());
    featureRepository = new FeatureRepository(db.getDB());
    domainRepository = new DomainRepository(db.getDB());
    moduleRepository = new ModuleRepository(db.getDB());

    testApp = (await applicationRepository.create({
      id: db.generateId(),
      name: 'TestAppForFlowFeature',
      purpose: 'To test flow-feature relationship',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ApplicationSchema;

    testDomain = (await domainRepository.create({
      id: db.generateId(),
      application_id: testApp.id, // Added application_id
      name: 'TestDomainForFlowFeature',
      description: 'Description for TestDomainForFlowFeature',
      responsibilities: JSON.stringify(['general']), // Added responsibilities
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as DomainSchema;

    testModule = (await moduleRepository.create({
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'TestModuleForFlowFeature',
      description: 'Description for TestModuleForFlowFeature',
      type: 'core', // Changed from 'backend'
      interface: JSON.stringify({
        type: 'rpc_api',
        description: 'REST API for module',
      }), // Updated
      state: JSON.stringify({
        type: 'postgresql',
        schema: 'testmoduleforflowfeature_schema',
      }), // Updated
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ModuleSchema;

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

    testFeature1 = (await featureRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'Feature1',
      purpose: 'Purpose 1',
      requirements: JSON.stringify([]),
      metrics: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as FeatureSchema;

    testFeature2 = (await featureRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'Feature2',
      purpose: 'Purpose 2',
      requirements: JSON.stringify([]),
      metrics: JSON.stringify([]),
      created_at: Date.now() + 1,
      updated_at: Date.now() + 1,
    })) as FeatureSchema;
  });

  afterEach(() => {
    db.close();
  });

  it('should add a flow-feature relationship', async () => {
    const relationship = await flowFeatureRelationship.add(
      testFlow1.id,
      testFeature1.id,
    );
    expect(relationship).toEqual({
      flow_id: testFlow1.id,
      feature_id: testFeature1.id,
    });

    const features = await flowFeatureRelationship.findFeaturesByFlow(
      testFlow1.id,
    );
    expect(features).toEqual([testFeature1.id]);
  });

  it('should remove a flow-feature relationship', async () => {
    await flowFeatureRelationship.add(testFlow1.id, testFeature1.id);
    let features = await flowFeatureRelationship.findFeaturesByFlow(
      testFlow1.id,
    );
    expect(features).toEqual([testFeature1.id]);

    await flowFeatureRelationship.remove(testFlow1.id, testFeature1.id);
    features = await flowFeatureRelationship.findFeaturesByFlow(testFlow1.id);
    expect(features).toEqual([]);
  });

  it('should find features by flow', async () => {
    await flowFeatureRelationship.add(testFlow1.id, testFeature1.id);
    await flowFeatureRelationship.add(testFlow1.id, testFeature2.id);

    const features = await flowFeatureRelationship.findFeaturesByFlow(
      testFlow1.id,
    );
    expect(features).toEqual(
      expect.arrayContaining([testFeature1.id, testFeature2.id]),
    );
    expect(features.length).toBe(2);
  });

  it('should find flows by feature', async () => {
    await flowFeatureRelationship.add(testFlow1.id, testFeature1.id);
    await flowFeatureRelationship.add(testFlow2.id, testFeature1.id);

    const flows = await flowFeatureRelationship.findFlowsByFeature(
      testFeature1.id,
    );
    expect(flows).toEqual(expect.arrayContaining([testFlow1.id, testFlow2.id]));
    expect(flows.length).toBe(2);
  });
});
