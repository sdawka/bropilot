import { AppDatabase } from '../database/Database.js';
import { QueryBuilder } from '../database/QueryBuilder.js';
import { ApplicationRepository } from '../repositories/ApplicationRepository.js';
import { DomainRepository } from '../repositories/DomainRepository.js';
import { FeatureRepository } from '../repositories/FeatureRepository.js';
import { ModuleRepository } from '../repositories/ModuleRepository.js';
import { ThingRepository } from '../repositories/ThingRepository.js';
import { BehaviorRepository } from '../repositories/BehaviorRepository.js';
import { FlowRepository } from '../repositories/FlowRepository.js';
import { FeatureDomainRelationship } from '../relationships/FeatureDomainRelationship.js';
import { FlowBehaviorRelationship } from '../relationships/FlowBehaviorRelationship.js';
import {
  ApplicationSchema,
  DomainSchema,
  FeatureSchema,
  ModuleSchema,
  ThingSchema,
  BehaviorSchema,
  FlowSchema,
} from '../database/schema.js';

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
      responsibilities: JSON.stringify(['general']),
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as DomainSchema;

    testDomain2 = (await domainRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'QueryDomain2',
      description: 'Description 2',
      responsibilities: JSON.stringify(['general']),
      created_at: Date.now() + 1,
      updated_at: Date.now() + 1,
    })) as DomainSchema;

    testFeature1 = (await featureRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'QueryFeature1',
      purpose: 'Purpose 1',
      requirements: '[]',
      metrics: '[]',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as FeatureSchema;

    testFeature2 = (await featureRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'QueryFeature2',
      purpose: 'Purpose 2',
      requirements: '[]',
      metrics: '[]',
      created_at: Date.now() + 1,
      updated_at: Date.now() + 1,
    })) as FeatureSchema;

    testModule = (await moduleRepository.create({
      id: db.generateId(),
      domain_id: testDomain1.id,
      name: 'QueryModule',
      description: 'Description',
      type: 'core', // Changed from 'backend'
      interface: JSON.stringify({
        type: 'rpc_api',
        description: 'REST API for module',
      }), // Updated
      state: JSON.stringify({
        type: 'postgresql',
        schema: 'querymodule_schema',
      }), // Updated
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ModuleSchema;

    testThing = (await thingRepository.create({
      id: db.generateId(),
      module_id: testModule.id,
      name: 'QueryThing',
      description: 'Description',
      schema: JSON.stringify({ type: 'object' }),
      invariants: JSON.stringify([]),
      relationships: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ThingSchema;

    testBehavior = (await behaviorRepository.create({
      id: db.generateId(),
      module_id: testModule.id,
      name: 'QueryBehavior',
      description: 'Description',
      trigger: 'onEvent',
      input_schema: JSON.stringify({ type: 'object' }),
      output_schema: JSON.stringify({ type: 'object' }),
      actions: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as BehaviorSchema;

    testFlow = (await flowRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      module_id: testModule.id,
      name: 'QueryFlow',
      description: 'Description',
      steps: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
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

  it('should find modules for a domain', () => {
    const stmt = queryBuilder.findModulesForDomain(testDomain1.id);
    const modules = stmt.all(testDomain1.id) as ModuleSchema[];
    expect(modules).toEqual(expect.arrayContaining([testModule]));
    expect(modules.length).toBe(1);
  });
});
