import { WorkPlanGenerator } from '../WorkPlanGenerator.js';

describe('WorkPlanGenerator', () => {
  it('generates a work plan for an initial release with one module and one thing', async () => {
    const generator = new WorkPlanGenerator();

    // Minimal mock module and thing (using any to bypass missing id/type)
    const mockThing = {
      name: 'User',
      id: 'thing-1',
      description: 'A user entity',
      schema: { type: 'object', properties: {}, required: [] },
      invariants: [],
      relationships: [],
    };
    // @ts-ignore: mockModule is intentionally missing some type properties for test simplicity
    const mockModule = {
      name: 'user_management',
      id: 'module-1',
      type: 'core',
      description: 'User management module',
      domain_id: 'domain-1',
      interface: { type: 'web_app', description: 'Default interface' },
      things: [mockThing],
      behaviors: [],
      flows: [],
      state: { type: 'postgresql' },
    };

    const release = {
      version: '1.0.0',
      modules: [mockModule],
    };

    const config = {
      methodology: 'test_driven_development',
      qa_mode: 'automated_with_human_checkpoints',
      pr_granularity: 'task_level',
      generate_documentation: false,
    };

    // @ts-ignore: plan generation is tested with partial types for simplicity
    const plan = await generator.generatePlan(release, null, config);

    expect(plan.release_version).toBe('1.0.0');
    expect(plan.tasks.length).toBeGreaterThanOrEqual(3); // module setup, test, impl
    expect(
      plan.tasks.some((t: any) => t.title.includes('Set up user_management')),
    ).toBe(true);
    expect(
      plan.tasks.some((t: any) => t.title.includes('Write tests for User')),
    ).toBe(true);
    expect(
      plan.tasks.some((t: any) => t.title.includes('Implement User entity')),
    ).toBe(true);
    expect(plan.dependencies.length).toBeGreaterThanOrEqual(1);
    expect(plan.critical_path.length).toBeGreaterThanOrEqual(1);
    expect(plan.phases).toBeDefined();
    expect(plan.checkpoints).toBeDefined();
    expect(plan.resource_allocation).toBeDefined();
  });
});

//# sourceMappingURL=WorkPlanGenerator.test.js.map
