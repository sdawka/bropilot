import { AppDatabase } from '../database/Database.js';
import { ModuleRepository } from '../repositories/ModuleRepository.js';
import {
  ModuleSchema,
  DomainSchema,
  ApplicationSchema,
} from '../database/schema.js';
import { ApplicationRepository } from '../repositories/ApplicationRepository.js';
import { DomainRepository } from '../repositories/DomainRepository.js';

describe('ModuleRepository', () => {
  let db: AppDatabase;
  let applicationRepository: ApplicationRepository;
  let domainRepository: DomainRepository;
  let moduleRepository: ModuleRepository;
  let testApp: ApplicationSchema;
  let testDomain: DomainSchema;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.migrate();
    applicationRepository = new ApplicationRepository(db.getDB());
    domainRepository = new DomainRepository(db.getDB());
    moduleRepository = new ModuleRepository(db.getDB());

    testApp = (await applicationRepository.create({
      id: db.generateId(),
      name: 'TestAppForModules',
      purpose: 'To test module repository',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ApplicationSchema;

    testDomain = (await domainRepository.create({
      id: db.generateId(),
      application_id: testApp.id,
      name: 'TestDomainForModules',
      description: 'Description for TestDomainForModules',
      responsibilities: JSON.stringify([]),
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as DomainSchema;
  });

  afterEach(() => {
    db.close();
  });

  it('should create a new module', async () => {
    const newModule: Partial<ModuleSchema> = {
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'TestModule',
      description: 'Description for TestModule',
      type: 'ui', // Changed from 'frontend'
      interface: JSON.stringify({
        type: 'web_app',
        description: 'REST API for module',
      }), // Updated
      state: JSON.stringify({ type: 'nanostores', stores: [] }), // Updated
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const createdModule = await moduleRepository.create(newModule);
    expect(createdModule).toEqual(expect.objectContaining(newModule));

    const foundModule = await moduleRepository.findById(newModule.id!);
    expect(foundModule).toEqual(expect.objectContaining(newModule));
  });

  it('should find a module by ID', async () => {
    const module1: Partial<ModuleSchema> = {
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'Module1',
      description: 'Description 1',
      type: 'core', // Changed from 'backend'
      interface: JSON.stringify({
        type: 'rpc_api',
        description: 'GraphQL API for module',
      }), // Updated
      state: JSON.stringify({ type: 'postgresql', schema: 'module1_schema' }), // Updated
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await moduleRepository.create(module1);

    const found = await moduleRepository.findById(module1.id!);
    expect(found).toEqual(expect.objectContaining(module1));

    const notFound = await moduleRepository.findById('non-existent-id');
    expect(notFound).toBeNull();
  });

  it('should find all modules', async () => {
    const moduleA: Partial<ModuleSchema> = {
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'ModuleA',
      description: 'Description A',
      type: 'ui', // Changed from 'frontend'
      interface: JSON.stringify({
        type: 'web_app',
        description: 'REST API for module A',
      }), // Updated
      state: JSON.stringify({ type: 'nanostores', stores: [] }), // Updated
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const moduleB: Partial<ModuleSchema> = {
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'ModuleB',
      description: 'Description B',
      type: 'core', // Changed from 'backend'
      interface: JSON.stringify({
        type: 'rpc_api',
        description: 'GraphQL API for module B',
      }), // Updated
      state: JSON.stringify({ type: 'postgresql', schema: 'moduleb_schema' }), // Updated
      created_at: Date.now() + 1,
      updated_at: Date.now() + 1,
    };
    await moduleRepository.create(moduleA);
    await moduleRepository.create(moduleB);

    const allModules = await moduleRepository.findAll();
    expect(allModules).toEqual(
      expect.arrayContaining([
        expect.objectContaining(moduleA),
        expect.objectContaining(moduleB),
      ]),
    );
    expect(allModules.length).toBe(2);
  });

  it('should update a module', async () => {
    const module: Partial<ModuleSchema> = {
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'OriginalModule',
      description: 'Original Description',
      type: 'core', // Changed from 'shared'
      interface: JSON.stringify({
        type: 'rpc_api',
        description: 'No interface',
      }), // Updated
      state: JSON.stringify({
        type: 'postgresql',
        schema: 'originalmodule_schema',
      }), // Updated
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await moduleRepository.create(module);

    const updatedDescription = 'Updated Description';
    const updatedModule = await moduleRepository.update(module.id!, {
      description: updatedDescription,
    });
    expect(updatedModule.description).toBe(updatedDescription);
    expect(updatedModule.name).toBe(module.name);

    const foundModule = await moduleRepository.findById(module.id!);
    expect(foundModule!.description).toBe(updatedDescription);
  });

  it('should delete a module', async () => {
    const module: Partial<ModuleSchema> = {
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'ModuleToDelete',
      description: 'To be deleted',
      type: 'ui', // Changed from 'frontend'
      interface: JSON.stringify({
        type: 'web_app',
        description: 'REST API for module to delete',
      }), // Updated
      state: JSON.stringify({ type: 'nanostores', stores: [] }), // Updated
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await moduleRepository.create(module);

    let found = await moduleRepository.findById(module.id!);
    expect(found).toBeDefined();

    await moduleRepository.delete(module.id!);
    found = await moduleRepository.findById(module.id!);
    expect(found).toBeNull();
  });
});
