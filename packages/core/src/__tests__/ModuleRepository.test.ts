import { AppDatabase } from '../database/Database';
import { ModuleRepository } from '../repositories/ModuleRepository';
import {
  ModuleSchema,
  DomainSchema,
  ApplicationSchema,
} from '../database/schema';
import { ApplicationRepository } from '../repositories/ApplicationRepository';
import { DomainRepository } from '../repositories/DomainRepository';

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
      type: 'frontend',
    };
    const createdModule = await moduleRepository.create(newModule);
    expect(createdModule).toEqual(newModule);

    const foundModule = await moduleRepository.findById(newModule.id!);
    expect(foundModule).toEqual(newModule);
  });

  it('should find a module by ID', async () => {
    const module1: Partial<ModuleSchema> = {
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'Module1',
      description: 'Description 1',
      type: 'backend',
    };
    await moduleRepository.create(module1);

    const found = await moduleRepository.findById(module1.id!);
    expect(found).toEqual(module1);

    const notFound = await moduleRepository.findById('non-existent-id');
    expect(notFound).toBeNull();
  });

  it('should find all modules', async () => {
    const moduleA: Partial<ModuleSchema> = {
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'ModuleA',
      description: 'Description A',
      type: 'frontend',
    };
    const moduleB: Partial<ModuleSchema> = {
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'ModuleB',
      description: 'Description B',
      type: 'backend',
    };
    await moduleRepository.create(moduleA);
    await moduleRepository.create(moduleB);

    const allModules = await moduleRepository.findAll();
    expect(allModules).toEqual(expect.arrayContaining([moduleA, moduleB]));
    expect(allModules.length).toBe(2);
  });

  it('should update a module', async () => {
    const module: Partial<ModuleSchema> = {
      id: db.generateId(),
      domain_id: testDomain.id,
      name: 'OriginalModule',
      description: 'Original Description',
      type: 'shared',
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
      type: 'frontend',
    };
    await moduleRepository.create(module);

    let found = await moduleRepository.findById(module.id!);
    expect(found).toBeDefined();

    await moduleRepository.delete(module.id!);
    found = await moduleRepository.findById(module.id!);
    expect(found).toBeNull();
  });
});
