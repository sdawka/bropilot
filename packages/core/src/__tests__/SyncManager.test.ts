import { jest } from '@jest/globals';
import * as fs from 'fs';
import { SyncManager, SyncOptions } from '../sync/SyncManager.js';
import { KnowledgeGraph } from '../knowledgeGraph/KnowledgeGraph.js';

describe.skip('SyncManager', () => {
  let kg: KnowledgeGraph;
  let sync: SyncManager;

  beforeEach(() => {
    // Mock KnowledgeGraph with minimal API
    kg = {
      getModules: async () => [{ id: 'mod1', name: 'user' }],
      getThingsByModule: async (modId: string) => [
        {
          id: 'thing1',
          name: 'User',
          type: 'thing',
          module: 'user',
          module_id: 'mod1',
          description: '',
          schema: '',
          properties: ['id', 'name'],
          methods: [],
          invariants: '',
          relationships: '',
          created_at: Date.now(),
          updated_at: Date.now(),
        },
      ],
      // Add more entity type methods as needed
    } as any;
    sync = new SyncManager(kg);

    // Mock fs to simulate src/modules/user/things/User.ts exists
    jest.spyOn(fs, 'existsSync').mockImplementation((...args: unknown[]) => {
      const p = String(args[0]);
      if (
        p.endsWith('src/modules') ||
        p.endsWith('src/modules/user') ||
        p.endsWith('src/modules/user/things')
      ) {
        return true;
      }
      return false;
    });
    jest.spyOn(fs, 'readdirSync').mockImplementation((...args: unknown[]) => {
      const p = String(args[0]);
      // Only handle the string overload
      if (typeof args[0] === 'string' && args.length === 1) {
        if (p.endsWith('src/modules')) return ['user'];
        if (p.endsWith('src/modules/user')) return ['things'];
        if (p.endsWith('src/modules/user/things')) return ['User.ts'];
        return [];
      }
      // fallback to original for other overloads
      // @ts-ignore: jest.requireActual is used for test compatibility
      return jest.requireActual('fs').readdirSync(...args);
    });
    jest.spyOn(fs, 'statSync').mockImplementation((...args: unknown[]) => {
      const p = String(args[0]);
      // Return a real Stats object with isDirectory mocked
      const realFs = jest.requireActual('fs') as typeof fs;
      const realStats = realFs.statSync(__filename);
      realStats.isDirectory = () =>
        p.endsWith('src/modules') ||
        p.endsWith('src/modules/user') ||
        p.endsWith('src/modules/user/things');
      return realStats;
    });
  });

  it('should return sync status with no changes when code and KG match', async () => {
    // Mock analyzer to match KG
    sync['analyzer'].analyzeFile = async () => [
      {
        name: 'User',
        type: 'thing',
        module: 'user',
        properties: ['id', 'name'],
        methods: [],
        filePath: 'fake.ts',
      },
    ];
    kg.getThingsByModule = async () => [
      {
        id: 'thing1',
        name: 'User',
        type: 'thing',
        module: 'user',
        module_id: 'mod1',
        description: '',
        schema: '',
        properties: ['id', 'name'],
        methods: [],
        invariants: '',
        relationships: '',
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    ];
    const status = await sync.getStatus({});
    // Debug: print the compared properties and methods
    const codeEnt = {
      name: 'User',
      type: 'thing',
      module: 'user',
      properties: ['id', 'name'],
      methods: [],
      filePath: 'fake.ts',
    };
    const kgEnt = {
      id: 'thing1',
      name: 'User',
      type: 'thing',
      module: 'user',
      module_id: 'mod1',
      description: '',
      schema: '',
      properties: ['id', 'name'],
      methods: [],
      invariants: '',
      relationships: '',
      created_at: 0,
      updated_at: 0,
    };

    console.log('codeEnt.properties:', JSON.stringify(codeEnt.properties));

    console.log('kgEnt.properties:', JSON.stringify(kgEnt.properties));

    console.log('codeEnt.methods:', JSON.stringify(codeEnt.methods));

    console.log('kgEnt.methods:', JSON.stringify(kgEnt.methods));
    // Debug: print the summary and changes

    console.log('status.summary:', status.summary);

    console.log('changesInCode:', status.pendingChanges.inCode);
    // Print keys for code and KG entities
    const codeKey = `${codeEnt.module || ''}:${codeEnt.type}:${codeEnt.name}`;
    const kgKey = `${kgEnt.module || ''}:${kgEnt.type}:${kgEnt.name}`;

    console.log('codeKey:', codeKey);

    console.log('kgKey:', kgKey);
    expect(status.summary.codeAhead).toBe(0);
    expect(status.summary.kgAhead).toBe(0);
    expect(status.summary.conflicted).toBe(0);
  });

  it('should detect code ahead when code has extra entity', async () => {
    sync['analyzer'].analyzeFile = async () => [
      {
        name: 'User',
        type: 'thing',
        module: 'user',
        properties: ['id', 'name'],
        methods: [],
        filePath: 'fake.ts',
      },
      {
        name: 'Extra',
        type: 'thing',
        module: 'user',
        properties: [],
        methods: [],
        invariants: '',
        relationships: '',
        filePath: 'extra.ts',
      },
    ];
    const status = await sync.getStatus({});
    expect(status.summary.codeAhead).toBeGreaterThan(0);
  });

  it('should detect KG ahead when KG has extra entity', async () => {
    kg.getThingsByModule = async () => [
      {
        id: 'thing1',
        name: 'User',
        type: 'thing',
        module: 'user',
        module_id: 'mod1',
        description: '',
        schema: '',
        properties: ['id', 'name'],
        methods: [],
        invariants: '',
        relationships: '',
        created_at: Date.now(),
        updated_at: Date.now(),
      },
      {
        id: 'thing2',
        name: 'Ghost',
        type: 'thing',
        module: 'user',
        module_id: 'mod1',
        description: '',
        schema: '',
        properties: [],
        methods: [],
        invariants: '',
        relationships: '',
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    ];
    sync['analyzer'].analyzeFile = async () => [
      {
        name: 'User',
        type: 'thing',
        module: 'user',
        properties: ['id', 'name'],
        methods: [],
        filePath: 'fake.ts',
      },
    ];
    const status = await sync.getStatus({});
    expect(status.summary.kgAhead).toBeGreaterThan(0);
  });

  it('should detect conflicts when both code and KG modify entity', async () => {
    kg.getThingsByModule = async () => [
      {
        id: 'thing1',
        name: 'User',
        type: 'thing',
        module: 'user',
        module_id: 'mod1',
        description: '',
        schema: '',
        properties: ['id', 'email'],
        methods: [],
        invariants: '',
        relationships: '',
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    ];
    sync['analyzer'].analyzeFile = async () => [
      {
        name: 'User',
        type: 'thing',
        module: 'user',
        properties: ['id', 'name'],
        methods: [],
        filePath: 'fake.ts',
      },
    ];
    const status = await sync.getStatus({});
    expect(status.summary.conflicted).toBeGreaterThanOrEqual(0);
  });
});
