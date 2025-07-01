import { AppDatabase } from '../database/Database';
import { FlowFeatureRelationship } from '../relationships/FlowFeatureRelationship';
import { ApplicationRepository } from '../repositories/ApplicationRepository';
import { FlowRepository } from '../repositories/FlowRepository';
import { FeatureRepository } from '../repositories/FeatureRepository';
import {
  ApplicationSchema,
  FlowSchema,
  FeatureSchema,
} from '../database/schema';

describe('FlowFeatureRelationship', () => {
  let db: AppDatabase;
  let flowFeatureRelationship: FlowFeatureRelationship;
  let applicationRepository: ApplicationRepository;
  let flowRepository: FlowRepository;
  let featureRepository: FeatureRepository;

  let testApp: ApplicationSchema;
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

    testApp = (await applicationRepository.create({
      id: db.generateId(),
      name: 'TestAppForFlowFeature',
      purpose: 'To test flow-feature relationship',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ApplicationSchema;

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

    testFeature1 = (await featureRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'Feature1',
      purpose: 'Purpose 1',
      requirements: '[]',
      metrics: '[]',
    })) as FeatureSchema;

    testFeature2 = (await featureRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'Feature2',
      purpose: 'Purpose 2',
      requirements: '[]',
      metrics: '[]',
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
