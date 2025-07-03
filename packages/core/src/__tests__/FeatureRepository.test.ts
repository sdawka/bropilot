import { AppDatabase } from '../database/Database.js';
import { FeatureRepository } from '../repositories/FeatureRepository.js';
import { FeatureSchema, ApplicationSchema } from '../database/schema.js';
import { ApplicationRepository } from '../repositories/ApplicationRepository.js';

describe('FeatureRepository', () => {
  let db: AppDatabase;
  let applicationRepository: ApplicationRepository;
  let featureRepository: FeatureRepository;
  let testApp: ApplicationSchema;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.migrate();
    applicationRepository = new ApplicationRepository(db.getDB());
    featureRepository = new FeatureRepository(db.getDB());

    testApp = (await applicationRepository.create({
      id: db.generateId(),
      name: 'TestAppForFeatures',
      purpose: 'To test feature repository',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ApplicationSchema;
  });

  afterEach(() => {
    db.close();
  });

  it('should create a new feature', async () => {
    const now = Date.now();
    const newFeature: Partial<FeatureSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      name: 'TestFeature',
      purpose: 'Purpose of TestFeature',
      requirements: JSON.stringify(['req1', 'req2']),
      metrics: JSON.stringify(['metric1', 'metric2']),
      created_at: now,
      updated_at: now,
    };
    const createdFeature = await featureRepository.create(newFeature);
    expect(createdFeature).toEqual(newFeature);

    const foundFeature = await featureRepository.findById(newFeature.id!);
    expect(foundFeature).toEqual(newFeature);
  });

  it('should find a feature by ID', async () => {
    const now = Date.now();
    const feature1: Partial<FeatureSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      name: 'Feature1',
      purpose: 'Purpose 1',
      requirements: '[]',
      metrics: '[]',
      created_at: now,
      updated_at: now,
    };
    await featureRepository.create(feature1);

    const found = await featureRepository.findById(feature1.id!);
    expect(found).toEqual(feature1);

    const notFound = await featureRepository.findById('non-existent-id');
    expect(notFound).toBeNull();
  });

  it('should find all features', async () => {
    const now = Date.now();
    const featureA: Partial<FeatureSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      name: 'FeatureA',
      purpose: 'Purpose A',
      requirements: '[]',
      metrics: '[]',
      created_at: now,
      updated_at: now,
    };
    const featureB: Partial<FeatureSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      name: 'FeatureB',
      purpose: 'Purpose B',
      requirements: '[]',
      metrics: '[]',
      created_at: now,
      updated_at: now,
    };
    await featureRepository.create(featureA);
    await featureRepository.create(featureB);

    const allFeatures = await featureRepository.findAll();
    expect(allFeatures).toEqual(expect.arrayContaining([featureA, featureB]));
    expect(allFeatures.length).toBe(2);
  });

  it('should update a feature', async () => {
    const now = Date.now();
    const feature: Partial<FeatureSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      name: 'OriginalFeature',
      purpose: 'Original Purpose',
      requirements: '[]',
      metrics: '[]',
      created_at: now,
      updated_at: now,
    };
    await featureRepository.create(feature);

    const updatedPurpose = 'Updated Purpose';
    const updatedFeature = await featureRepository.update(feature.id!, {
      purpose: updatedPurpose,
    });
    expect(updatedFeature.purpose).toBe(updatedPurpose);
    expect(updatedFeature.name).toBe(feature.name);

    const foundFeature = await featureRepository.findById(feature.id!);
    expect(foundFeature!.purpose).toBe(updatedPurpose);
  });

  it('should delete a feature', async () => {
    const now = Date.now();
    const feature: Partial<FeatureSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      name: 'FeatureToDelete',
      purpose: 'To be deleted',
      requirements: '[]',
      metrics: '[]',
      created_at: now,
      updated_at: now,
    };
    await featureRepository.create(feature);

    let found = await featureRepository.findById(feature.id!);
    expect(found).toBeDefined();

    await featureRepository.delete(feature.id!);
    found = await featureRepository.findById(feature.id!);
    expect(found).toBeNull();
  });
});
