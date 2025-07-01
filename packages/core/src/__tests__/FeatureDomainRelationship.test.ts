import { AppDatabase } from '../database/Database';
import { FeatureDomainRelationship } from '../relationships/FeatureDomainRelationship';
import { ApplicationRepository } from '../repositories/ApplicationRepository';
import { FeatureRepository } from '../repositories/FeatureRepository';
import { DomainRepository } from '../repositories/DomainRepository';
import {
  ApplicationSchema,
  FeatureSchema,
  DomainSchema,
} from '../database/schema';

describe('FeatureDomainRelationship', () => {
  let db: AppDatabase;
  let featureDomainRelationship: FeatureDomainRelationship;
  let applicationRepository: ApplicationRepository;
  let featureRepository: FeatureRepository;
  let domainRepository: DomainRepository;
  let testApp: ApplicationSchema;
  let testFeature1: FeatureSchema;
  let testFeature2: FeatureSchema;
  let testDomain1: DomainSchema;
  let testDomain2: DomainSchema;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.migrate();
    featureDomainRelationship = new FeatureDomainRelationship(db.getDB());
    applicationRepository = new ApplicationRepository(db.getDB());
    featureRepository = new FeatureRepository(db.getDB());
    domainRepository = new DomainRepository(db.getDB());

    testApp = (await applicationRepository.create({
      id: db.generateId(),
      name: 'TestAppForRelationships',
      purpose: 'To test relationships',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ApplicationSchema;

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

    testDomain1 = (await domainRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'Domain1',
      description: 'Description 1',
      responsibilities: '[]',
    })) as DomainSchema;

    testDomain2 = (await domainRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'Domain2',
      description: 'Description 2',
      responsibilities: '[]',
    })) as DomainSchema;
  });

  afterEach(() => {
    db.close();
  });

  it('should add a feature-domain relationship', async () => {
    const relationship = await featureDomainRelationship.add(
      testFeature1.id,
      testDomain1.id,
    );
    expect(relationship).toEqual({
      feature_id: testFeature1.id,
      domain_id: testDomain1.id,
    });

    const domains = await featureDomainRelationship.findDomainsByFeature(
      testFeature1.id,
    );
    expect(domains).toEqual([testDomain1.id]);
  });

  it('should remove a feature-domain relationship', async () => {
    await featureDomainRelationship.add(testFeature1.id, testDomain1.id);
    let domains = await featureDomainRelationship.findDomainsByFeature(
      testFeature1.id,
    );
    expect(domains).toEqual([testDomain1.id]);

    await featureDomainRelationship.remove(testFeature1.id, testDomain1.id);
    domains = await featureDomainRelationship.findDomainsByFeature(
      testFeature1.id,
    );
    expect(domains).toEqual([]);
  });

  it('should find domains by feature', async () => {
    await featureDomainRelationship.add(testFeature1.id, testDomain1.id);
    await featureDomainRelationship.add(testFeature1.id, testDomain2.id);

    const domains = await featureDomainRelationship.findDomainsByFeature(
      testFeature1.id,
    );
    expect(domains).toEqual(
      expect.arrayContaining([testDomain1.id, testDomain2.id]),
    );
    expect(domains.length).toBe(2);
  });

  it('should find features by domain', async () => {
    await featureDomainRelationship.add(testFeature1.id, testDomain1.id);
    await featureDomainRelationship.add(testFeature2.id, testDomain1.id);

    const features = await featureDomainRelationship.findFeaturesByDomain(
      testDomain1.id,
    );
    expect(features).toEqual(
      expect.arrayContaining([testFeature1.id, testFeature2.id]),
    );
    expect(features.length).toBe(2);
  });
});
