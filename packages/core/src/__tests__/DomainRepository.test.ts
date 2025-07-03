import { AppDatabase } from '../database/Database.js';
import { DomainRepository } from '../repositories/DomainRepository.js';
import { DomainSchema, ApplicationSchema } from '../database/schema.js';
import { ApplicationRepository } from '../repositories/ApplicationRepository.js';

describe('DomainRepository', () => {
  let db: AppDatabase;
  let applicationRepository: ApplicationRepository;
  let domainRepository: DomainRepository;
  let testApp: ApplicationSchema;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.migrate();
    applicationRepository = new ApplicationRepository(db.getDB());
    domainRepository = new DomainRepository(db.getDB());

    testApp = (await applicationRepository.create({
      id: db.generateId(),
      name: 'TestAppForDomains',
      purpose: 'To test domain repository',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    })) as ApplicationSchema;
  });

  afterEach(() => {
    db.close();
  });

  it('should create a new domain', async () => {
    const newDomain: Partial<DomainSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      name: 'TestDomain',
      description: 'Description for TestDomain',
      responsibilities: JSON.stringify(['general']),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const createdDomain = await domainRepository.create(newDomain);
    expect(createdDomain).toEqual(newDomain);

    const foundDomain = await domainRepository.findById(newDomain.id!);
    expect(foundDomain).toEqual(newDomain);
  });

  it('should find a domain by ID', async () => {
    const domain1: Partial<DomainSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      name: 'Domain1',
      description: 'Description 1',
      responsibilities: JSON.stringify(['general']),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await domainRepository.create(domain1);

    const found = await domainRepository.findById(domain1.id!);
    expect(found).toEqual(domain1);

    const notFound = await domainRepository.findById('non-existent-id');
    expect(notFound).toBeNull();
  });

  it('should find all domains', async () => {
    const domainA: Partial<DomainSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      name: 'DomainA',
      description: 'Description A',
      responsibilities: JSON.stringify(['general']),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const domainB: Partial<DomainSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      name: 'DomainB',
      description: 'Description B',
      responsibilities: JSON.stringify(['general']),
      created_at: Date.now() + 1, // Ensure different timestamp
      updated_at: Date.now() + 1,
    };
    await domainRepository.create(domainA);
    await domainRepository.create(domainB);

    const allDomains = await domainRepository.findAll();
    expect(allDomains).toEqual(expect.arrayContaining([domainA, domainB]));
    expect(allDomains.length).toBe(2);
  });

  it('should update a domain', async () => {
    const domain: Partial<DomainSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      name: 'OriginalDomain',
      description: 'Original Description',
      responsibilities: JSON.stringify(['general']),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await domainRepository.create(domain);

    const updatedDescription = 'Updated Description';
    const updatedDomain = await domainRepository.update(domain.id!, {
      description: updatedDescription,
    });
    expect(updatedDomain.description).toBe(updatedDescription);
    expect(updatedDomain.name).toBe(domain.name);

    const foundDomain = await domainRepository.findById(domain.id!);
    expect(foundDomain!.description).toBe(updatedDescription);
  });

  it('should delete a domain', async () => {
    const domain: Partial<DomainSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      name: 'DomainToDelete',
      description: 'To be deleted',
      responsibilities: JSON.stringify(['general']),
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await domainRepository.create(domain);

    let found = await domainRepository.findById(domain.id!);
    expect(found).toBeDefined();

    await domainRepository.delete(domain.id!);
    found = await domainRepository.findById(domain.id!);
    expect(found).toBeNull();
  });
});
