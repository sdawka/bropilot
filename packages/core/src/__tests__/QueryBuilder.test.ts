import { AppDatabase } from '../database/Database';
import { QueryBuilder } from '../database/QueryBuilder';
import { ApplicationRepository } from '../repositories/ApplicationRepository';
import { DomainRepository } from '../repositories/DomainRepository';
import { FeatureRepository } from '../repositories/FeatureRepository';
import { ModuleRepository } from '../repositories/ModuleRepository';
import { ThingRepository } from '../repositories/ThingRepository';
import { BehaviorRepository } from '../repositories/BehaviorRepository';
import { FlowRepository } from '../repositories/FlowRepository';
import { FeatureDomainRelationship } from '../relationships/FeatureDomainRelationship';
import { FlowBehaviorRelationship } from '../relationships/FlowBehaviorRelationship';
import {
  ApplicationSchema,
  DomainSchema,
  FeatureSchema,
  ModuleSchema,
  ThingSchema,
  BehaviorSchema,
  FlowSchema,
} from '../database/schema';

describe('QueryBuilder', () => {
  let db: AppDatabase;
  let queryBuilder: QueryBuilder;
  let applicationRepository: ApplicationRepository;
  let domainRepository: DomainRepository;
  let featureRepository: FeatureRepository;
  let moduleRepository: ModuleRepository;
  let thingRepository: ThingRepository;
  let behaviorRepository: BehaviorRepository;
  let flowRepository: FlowRepository;
  let featureDomainRelationship: FeatureDomainRelationship;
  let flowBehaviorRelationship: FlowBehaviorRelationship;

  let testApp: ApplicationSchema;
  let testDomain1: DomainSchema;
  let testDomain2: DomainSchema;
  let testFeature1: FeatureSchema;
  let testFeature2: FeatureSchema;
  let testModule: ModuleSchema;
  let testThing: ThingSchema;
  let testBehavior: BehaviorSchema;
  let testFlow: FlowSchema;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.migrate();
    queryBuilder = new QueryBuilder(db.getDB());
    applicationRepository = new ApplicationRepository(db.getDB());
    domainRepository = new DomainRepository(db.getDB());
    featureRepository = new FeatureRepository(db.getDB());
    moduleRepository = new ModuleRepository(db.getDB());
    thingRepository = new ThingRepository(db.getDB());
    behaviorRepository = new BehaviorRepository(db.getDB());
    flowRepository = new FlowRepository(db.getDB());
    featureDomainRelationship = new FeatureDomainRelationship(db.getDB());
    flowBehaviorRelationship = new FlowBehaviorRelationship(db.getDB());

    testApp = (await applicationRepository.create({
      id: db.generateId(),
      name: 'TestAppForQueries',
      purpose: 'To test query builder',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ApplicationSchema;

    testDomain1 = (await domainRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'QueryDomain1',
      description: 'Description 1',
      responsibilities: '[]',
    })) as DomainSchema;

    testDomain2 = (await domainRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'QueryDomain2',
      description: 'Description 2',
      responsibilities: '[]',
    })) as DomainSchema;

    testFeature1 = (await featureRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'QueryFeature1',
      purpose: 'Purpose 1',
      requirements: '[]',
      metrics: '[]',
    })) as FeatureSchema;

    testFeature2 = (await featureRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'QueryFeature2',
      purpose: 'Purpose 2',
      requirements: '[]',
      metrics: '[]',
    })) as FeatureSchema;

    testModule = (await moduleRepository.create({
      id: db.generateId(),
      domain_id: testDomain1.id,
      name: 'QueryModule',
      description: 'Description',
      type: 'backend',
    })) as ModuleSchema;

    testThing = (await thingRepository.create({
      id: db.generateId(),
      module_id: testModule.id,
      name: 'QueryThing',
      description: 'Description',
      type: 'data_model',
      properties: '[]',
    })) as ThingSchema;

    testBehavior = (await behaviorRepository.create({
      id: db.generateId(),
      thing_id: testThing.id,
      name: 'QueryBehavior',
      description: 'Description',
      trigger_event: 'click',
      actions: '[]',
    })) as BehaviorSchema;

    testFlow = (await flowRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'QueryFlow',
      description: 'Description',
      steps: '[]',
    })) as FlowSchema;

    // Establish relationships
    await featureDomainRelationship.add(testFeature1.id, testDomain1.id);
    await featureDomainRelationship.add(testFeature1.id, testDomain2.id);
    await flowBehaviorRelationship.add(testFlow.id, testBehavior.id);
  });

  afterEach(() => {
    db.close();
  });

  it('should find domains for an application', () => {
    const stmt = queryBuilder.findDomainsForApplication(testApp.id);
    const domains = stmt.all(testApp.id) as DomainSchema[];
    expect(domains).toEqual(expect.arrayContaining([testDomain1, testDomain2]));
    expect(domains.length).toBe(2);
  });

  it('should find features for a domain', () => {
    const stmt = queryBuilder.findFeaturesForDomain(testDomain1.id);
    const features = stmt.all(testDomain1.id) as FeatureSchema[];
    expect(features).toEqual(expect.arrayContaining([testFeature1]));
    expect(features.length).toBe(1);
  });

  it('should find behaviors for a flow', () => {
    const stmt = queryBuilder.findBehaviorsForFlow(testFlow.id);
    const behaviors = stmt.all(testFlow.id) as BehaviorSchema[];
    expect(behaviors).toEqual(expect.arrayContaining([testBehavior]));
    expect(behaviors.length).toBe(1);
  });

  it('should find things for a module', () => {
    const stmt = queryBuilder.findThingsForModule(testModule.id);
    const things = stmt.all(testModule.id) as ThingSchema[];
    expect(things).toEqual(expect.arrayContaining([testThing]));
    expect(things.length).toBe(1);
  });

  it('should build a related query and find related entities', () => {
    const stmt = queryBuilder.buildRelatedQuery(
      'applications',
      'id',
      testApp.id,
      'domains',
      'application_id',
      'id',
      'domains',
      'id',
    );
    const domains = stmt.all(testApp.id) as DomainSchema[];
    expect(domains).toEqual(expect.arrayContaining([testDomain1, testDomain2]));
    expect(domains.length).toBe(2);
  });
});
