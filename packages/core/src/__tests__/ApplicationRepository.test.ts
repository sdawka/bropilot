import { AppDatabase } from '../database/Database.js';
import { ApplicationRepository } from '../repositories/ApplicationRepository.js';
import { ApplicationSchema } from '../database/schema.js';

describe('ApplicationRepository', () => {
  let db: AppDatabase;
  let applicationRepository: ApplicationRepository;

  beforeEach(async () => {
    db = new AppDatabase(':memory:');
    await db.migrate(); // Apply migrations to create the applications table
    applicationRepository = new ApplicationRepository(db.getDB());
  });

  afterEach(() => {
    db.close();
  });

  it('should create a new application', async () => {
    const newApp: Partial<ApplicationSchema> = {
      id: db.generateId(),
      name: 'TestApp',
      purpose: 'To test the application repository',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const createdApp = await applicationRepository.create(newApp);
    expect(createdApp).toEqual(newApp);

    const foundApp = await applicationRepository.findById(newApp.id!);
    expect(foundApp).toEqual(newApp);
  });

  it('should find an application by ID', async () => {
    const app1: Partial<ApplicationSchema> = {
      id: db.generateId(),
      name: 'App1',
      purpose: 'Purpose 1',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await applicationRepository.create(app1);

    const found = await applicationRepository.findById(app1.id!);
    expect(found).toEqual(app1);

    const notFound = await applicationRepository.findById('non-existent-id');
    expect(notFound).toBeNull();
  });

  it('should find all applications', async () => {
    const app1: Partial<ApplicationSchema> = {
      id: db.generateId(),
      name: 'AppA',
      purpose: 'Purpose A',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    const app2: Partial<ApplicationSchema> = {
      id: db.generateId(),
      name: 'AppB',
      purpose: 'Purpose B',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await applicationRepository.create(app1);
    await applicationRepository.create(app2);

    const allApps = await applicationRepository.findAll();
    expect(allApps).toEqual(expect.arrayContaining([app1, app2]));
    expect(allApps.length).toBe(2);
  });

  it('should update an application', async () => {
    const app: Partial<ApplicationSchema> = {
      id: db.generateId(),
      name: 'OriginalApp',
      purpose: 'Original Purpose',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await applicationRepository.create(app);

    const updatedPurpose = 'Updated Purpose';
    const updatedApp = await applicationRepository.update(app.id!, {
      purpose: updatedPurpose,
    });
    expect(updatedApp.purpose).toBe(updatedPurpose);
    expect(updatedApp.name).toBe(app.name); // Other fields should remain unchanged

    const foundApp = await applicationRepository.findById(app.id!);
    expect(foundApp!.purpose).toBe(updatedPurpose);
  });

  it('should delete an application', async () => {
    const app: Partial<ApplicationSchema> = {
      id: db.generateId(),
      name: 'AppToDelete',
      purpose: 'To be deleted',
      current_phase: 1,
      current_version: '1.0.0',
      created_at: Date.now(),
      updated_at: Date.now(),
    };
    await applicationRepository.create(app);

    let found = await applicationRepository.findById(app.id!);
    expect(found).toBeDefined();

    await applicationRepository.delete(app.id!);
    found = await applicationRepository.findById(app.id!);
    expect(found).toBeNull();
  });
});
