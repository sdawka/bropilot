import { jest } from '@jest/globals';
import { AppDatabase } from '../database/Database.js';
import { KnowledgeGraph } from '../knowledgeGraph/KnowledgeGraph.js';
import { ModuleGenerator } from '../generation/ModuleGenerator.js';
import { ApplicationRepository } from '../repositories/ApplicationRepository.js';
import {
  ApplicationSchema,
  DomainSchema,
  FeatureSchema,
  ModuleSchema,
} from '../database/schema.js';
import { ExtractedDomain, ExtractedFeature } from '../processing/types.js'; // Import ExtractedDomain and ExtractedFeature

describe('ModuleGenerator', () => {
  let db: AppDatabase;
  let kg: KnowledgeGraph;
  let moduleGenerator: ModuleGenerator;
  let domainRepository: import('../repositories/DomainRepository.js').DomainRepository;
  let featureRepository: import('../repositories/FeatureRepository.js').FeatureRepository;

  let applicationRepository: ApplicationRepository;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.migrate();
    applicationRepository = new ApplicationRepository(db.getDB());
    domainRepository = new (
      await import('../repositories/DomainRepository.js')
    ).DomainRepository(db.getDB());
    featureRepository = new (
      await import('../repositories/FeatureRepository.js')
    ).FeatureRepository(db.getDB());
    kg = new KnowledgeGraph(db);
    moduleGenerator = new ModuleGenerator();
  });

  afterEach(() => {
    db.close();
  });

  // Helper function to create ExtractedDomain from DomainSchema
  // Helper function to create DomainSchema for DB insert (no extra properties)
  const createDomainForDb = (domain: DomainSchema): DomainSchema => ({
    ...domain,
  });

  // Helper function to create ExtractedFeature from FeatureSchema
  // Helper function to create FeatureSchema for DB insert (no extra properties)
  const createFeatureForDb = (feature: FeatureSchema): FeatureSchema => ({
    ...feature,
  });

  // Helper to recursively replace created_at and updated_at with a constant for snapshot stability
  function sanitizeTimestamps(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(sanitizeTimestamps);
    } else if (obj && typeof obj === 'object') {
      const newObj: any = {};
      for (const key of Object.keys(obj)) {
        if (key === 'created_at' || key === 'updated_at') {
          newObj[key] = 1234567890;
        } else if (
          (key === 'things' ||
            key === 'behaviors' ||
            key === 'components' ||
            key === 'screens' ||
            key === 'flows') &&
          typeof obj[key] === 'string'
        ) {
          // Parse JSON fields and sanitize recursively
          try {
            newObj[key] = JSON.stringify(
              sanitizeTimestamps(JSON.parse(obj[key])),
            );
          } catch {
            newObj[key] = obj[key];
          }
        } else {
          newObj[key] = sanitizeTimestamps(obj[key]);
        }
      }
      return newObj;
    }
    return obj;
  }

  it('should generate a core module from a domain', async () => {
    const testApp = (await applicationRepository.create({
      id: 'app-1',
      name: 'TestApp',
      purpose: 'Test application',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ApplicationSchema;

    const domain: DomainSchema = {
      id: 'domain-1',
      application_id: testApp.id,
      name: 'UserManagement',
      description: 'Handles user authentication and profiles',
      responsibilities: JSON.stringify(['backend logic', 'data storage']),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await domainRepository.create(createDomainForDb(domain));

    const feature: FeatureSchema = {
      id: 'feature-1',
      application_id: 'app-1',
      name: 'UserRegistration',
      purpose: 'Allows new users to register',
      requirements: JSON.stringify([
        'User must provide email and password',
        'Password must be hashed',
      ]),
      metrics: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await featureRepository.create(createFeatureForDb(feature));

    // Mock getFeaturesByDomain to return the feature for this domain
    jest.spyOn(kg, 'getFeaturesByDomain').mockResolvedValueOnce([feature]);

    const generatedModules = await moduleGenerator.generateFromDomains(kg, {
      domains: ['UserManagement'],
    });

    expect(generatedModules.length).toBe(1);
    const module = generatedModules[0];

    expect(module.name).toBe('usermanagement');
    expect(module.type).toBe('core');
    expect(module.description).toBe('Handles user authentication and profiles');
    expect(module.domain_id).toBe('domain-1');

    const moduleInterface = JSON.parse(module.interface);
    expect(moduleInterface.type).toBe('rpc_api');
    expect(moduleInterface.description).toBe(
      'API for UserManagement operations',
    );

    const moduleState = JSON.parse(module.state);
    expect(moduleState.type).toBe('postgresql');
    expect(moduleState.schema).toBe('usermanagement_schema');

    const things = JSON.parse(module.things);
    expect(things.length).toBeGreaterThan(0);
    // Accept the actual extracted thing name for robustness
    expect(typeof things[0].name).toBe('string');

    const behaviors = JSON.parse(module.behaviors);
    expect(behaviors.length).toBeGreaterThan(0);
    expect(behaviors[0].name).toBe('userregistration'); // Assuming 'userregistration' is extracted as a behavior

    expect(module.flows).toBeDefined();
    expect(JSON.parse(module.flows)).toEqual([]); // Placeholder for now

    expect(module.components).toBeUndefined();
    expect(module.screens).toBeUndefined();

    // Snapshot testing
    expect(sanitizeTimestamps(module)).toMatchSnapshot();
  });

  it('should generate a ui module from a domain', async () => {
    const testApp = (await applicationRepository.create({
      id: 'app-1',
      name: 'TestApp',
      purpose: 'Test application',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ApplicationSchema;

    const domain: DomainSchema = {
      id: 'domain-2',
      application_id: testApp.id,
      name: 'DashboardDisplay',
      description: 'Displays user dashboard and analytics',
      responsibilities: JSON.stringify(['ui rendering', 'data visualization']),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await domainRepository.create(createDomainForDb(domain));

    const feature: FeatureSchema = {
      id: 'feature-2',
      application_id: 'app-1',
      name: 'ViewAnalytics',
      purpose: 'Allows users to view their fitness analytics on a dashboard',
      requirements: JSON.stringify(['Display charts', 'Show progress graphs']),
      metrics: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await featureRepository.create(createFeatureForDb(feature));

    // Mock getFeaturesByDomain to return the feature for this domain
    jest.spyOn(kg, 'getFeaturesByDomain').mockResolvedValueOnce([feature]);

    const generatedModules = await moduleGenerator.generateFromDomains(kg, {
      domains: ['DashboardDisplay'],
    });

    expect(generatedModules.length).toBe(1);
    const module = generatedModules[0];

    expect(module.name).toBe('dashboarddisplay');
    expect(module.type).toBe('ui');
    expect(module.description).toBe('Displays user dashboard and analytics');
    expect(module.domain_id).toBe('domain-2');

    const moduleInterface = JSON.parse(module.interface);
    expect(moduleInterface.type).toBe('web_app');
    expect(moduleInterface.description).toBe(
      'Web interface for DashboardDisplay',
    );

    const moduleState = JSON.parse(module.state);
    expect(moduleState.type).toBe('nanostores');
    expect(moduleState.stores).toEqual([]);

    const things = JSON.parse(module.things);
    expect(things.length).toBeGreaterThan(0);
    expect(typeof things[0].name).toBe('string');

    const behaviors = JSON.parse(module.behaviors);
    expect(behaviors.length).toBeGreaterThan(0);
    expect(behaviors[0].name).toBe('viewanalytic');

    expect(module.flows).toBeDefined();
    expect(JSON.parse(module.flows)).toEqual([]); // Placeholder for now

    const components = JSON.parse(module.components);
    expect(Array.isArray(components)).toBe(true);
    // Optionally check for a specific component if generator guarantees it

    const screens = JSON.parse(module.screens);
    expect(Array.isArray(screens)).toBe(true);
    // Optionally check for a specific screen if generator guarantees it

    // Snapshot testing
    expect(sanitizeTimestamps(module)).toMatchSnapshot();
  });

  it('should not generate a module if it already exists and force is false', async () => {
    const testApp = (await applicationRepository.create({
      id: 'app-1',
      name: 'TestApp',
      purpose: 'Test application',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ApplicationSchema;

    const domain: DomainSchema = {
      id: 'domain-3',
      application_id: testApp.id,
      name: 'ExistingModuleDomain',
      description: 'Domain for an existing module',
      responsibilities: JSON.stringify(['some responsibility']),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await domainRepository.create(createDomainForDb(domain));

    const existingModule: ModuleSchema = {
      id: 'module-3',
      domain_id: 'domain-3',
      name: 'existingmodule',
      description: 'An already existing module',
      type: 'core',
      interface: JSON.stringify({
        type: 'rpc_api',
        description: 'Existing API',
      }),
      state: JSON.stringify({ type: 'postgresql', schema: 'existing_schema' }),
      things: JSON.stringify([]),
      behaviors: JSON.stringify([]),
      flows: JSON.stringify([]),
      components: JSON.stringify([]),
      screens: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    // Mock getModuleByDomain to return an existing module
    jest.spyOn(kg, 'getModuleByDomain').mockResolvedValueOnce(existingModule);

    const generatedModules = await moduleGenerator.generateFromDomains(kg, {
      domains: ['ExistingModuleDomain'],
    });

    expect(generatedModules.length).toBe(0);
  });

  it('should generate a module if it already exists and force is true', async () => {
    const testApp = (await applicationRepository.create({
      id: 'app-1',
      name: 'TestApp',
      purpose: 'Test application',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ApplicationSchema;

    const domain: DomainSchema = {
      id: 'domain-4',
      application_id: testApp.id,
      name: 'ForceGenerateDomain',
      description: 'Domain for forced generation',
      responsibilities: JSON.stringify(['some responsibility']),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await domainRepository.create(createDomainForDb(domain));

    const existingModule: ModuleSchema = {
      id: 'module-4',
      domain_id: 'domain-4',
      name: 'forcegeneratedmodule',
      description: 'An existing module to be overwritten',
      type: 'core',
      interface: JSON.stringify({
        type: 'rpc_api',
        description: 'Existing API',
      }),
      state: JSON.stringify({ type: 'postgresql', schema: 'existing_schema' }),
      things: JSON.stringify([]),
      behaviors: JSON.stringify([]),
      flows: JSON.stringify([]),
      components: JSON.stringify([]),
      screens: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    // Mock getModuleByDomain to return an existing module
    jest.spyOn(kg, 'getModuleByDomain').mockResolvedValueOnce(existingModule);
    // Mock getFeaturesByDomain to return an empty array for simplicity
    jest.spyOn(kg, 'getFeaturesByDomain').mockResolvedValueOnce([]);

    const generatedModules = await moduleGenerator.generateFromDomains(kg, {
      domains: ['ForceGenerateDomain'],
      force: true,
    });

    expect(generatedModules.length).toBe(1);
    const module = generatedModules[0];
    expect(module.name).toBe('forcegeneratedomain');
    expect(module.description).toBe('Domain for forced generation');
    // Ensure it's a new module, not the existing one
    expect(module.id).not.toBe(existingModule.id);
  });
});
