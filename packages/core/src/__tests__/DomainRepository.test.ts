import { AppDatabase } from '../database/Database';
import { DomainRepository } from '../repositories/DomainRepository';
import { DomainSchema, ApplicationSchema } from '../database/schema';
import { ApplicationRepository } from '../repositories/ApplicationRepository';

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
      responsibilities: JSON.stringify(['responsibility1', 'responsibility2']),
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
      responsibilities: '[]',
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
      responsibilities: '[]',
    };
    const domainB: Partial<DomainSchema> = {
      id: db.generateId(),
      application_id: testApp.id,
      name: 'DomainB',
      description: 'Description B',
      responsibilities: '[]',
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
      responsibilities: '[]',
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
      responsibilities: '[]',
    };
    await domainRepository.create(domain);

    let found = await domainRepository.findById(domain.id!);
    expect(found).toBeDefined();

    await domainRepository.delete(domain.id!);
    found = await domainRepository.findById(domain.id!);
    expect(found).toBeNull();
  });
});
