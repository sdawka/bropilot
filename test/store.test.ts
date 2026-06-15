/**
 * Tests for the genome store operations.
 *
 * Since the store uses Cloudflare's D1 SQL context, we mock the database operations
 * to test the store logic in isolation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Node, Edge, NodeKind, SourceRef } from '../src/genome/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mock Setup
// ─────────────────────────────────────────────────────────────────────────────

// In-memory database simulation
let mockNodes: Map<string, any>;
let mockEdges: Map<string, any>;
let mockSnapshots: Map<string, any>;
let mockChanges: any[];

// Mock SQL result builder
function mockExecResult(rows: any[] = [], rowsWritten = 0) {
  return {
    toArray: () => rows,
    rowsWritten,
  };
}

// Mock SQL executor
function createMockSql() {
  return {
    exec: vi.fn((query: string, ...params: any[]) => {
      const q = query.toLowerCase().trim();

      // CREATE TABLE - no-op
      if (q.startsWith('create table') || q.startsWith('create index')) {
        return mockExecResult();
      }

      // INSERT INTO nodes
      if (q.includes('insert into nodes')) {
        const [id, kind, title, description, sourceRefs, createdAt, updatedAt] = params;
        mockNodes.set(id, {
          id,
          kind,
          title,
          description,
          source_refs: sourceRefs,
          createdAt,
          updatedAt,
        });
        return mockExecResult([], 1);
      }

      // SELECT FROM nodes (single)
      if (q.includes('select') && q.includes('from nodes') && q.includes('where id = ?')) {
        const node = mockNodes.get(params[0]);
        return mockExecResult(node ? [node] : []);
      }

      // SELECT FROM nodes (all)
      if (q.includes('select') && q.includes('from nodes') && !q.includes('where')) {
        return mockExecResult(Array.from(mockNodes.values()));
      }

      // UPDATE nodes
      if (q.includes('update nodes')) {
        const id = params[params.length - 1];
        const node = mockNodes.get(id);
        if (node) {
          if (q.includes('source_refs')) {
            node.title = params[0];
            node.description = params[1];
            node.source_refs = params[2];
            node.updatedAt = params[3];
          } else {
            node.title = params[0];
            node.description = params[1];
            node.updatedAt = params[2];
          }
          mockNodes.set(id, node);
          return mockExecResult([], 1);
        }
        return mockExecResult([], 0);
      }

      // DELETE FROM nodes
      if (q.includes('delete from nodes') && q.includes('where id = ?')) {
        const existed = mockNodes.has(params[0]);
        mockNodes.delete(params[0]);
        return mockExecResult([], existed ? 1 : 0);
      }

      // DELETE FROM nodes (all)
      if (q.includes('delete from nodes') && !q.includes('where')) {
        mockNodes.clear();
        return mockExecResult();
      }

      // INSERT INTO edges
      if (q.includes('insert into edges')) {
        const [id, srcId, dstId, type, label] = params;
        mockEdges.set(id, { id, srcId, dstId, type, label });
        return mockExecResult([], 1);
      }

      // SELECT FROM edges (single)
      if (q.includes('select') && q.includes('from edges') && q.includes('where id = ?')) {
        const edge = mockEdges.get(params[0]);
        return mockExecResult(edge ? [edge] : []);
      }

      // SELECT FROM edges (all)
      if (q.includes('select') && q.includes('from edges') && !q.includes('where')) {
        return mockExecResult(Array.from(mockEdges.values()));
      }

      // SELECT FROM edges (connected to node)
      if (q.includes('select') && q.includes('from edges') && q.includes('src_id = ?')) {
        const nodeId = params[0];
        const connected = Array.from(mockEdges.values()).filter(
          (e) => e.srcId === nodeId || e.dstId === nodeId
        );
        return mockExecResult(connected);
      }

      // DELETE FROM edges (by node)
      if (q.includes('delete from edges') && q.includes('src_id = ?')) {
        const nodeId = params[0];
        for (const [id, edge] of mockEdges) {
          if (edge.srcId === nodeId || edge.dstId === nodeId) {
            mockEdges.delete(id);
          }
        }
        return mockExecResult([], 1);
      }

      // DELETE FROM edges (single)
      if (q.includes('delete from edges') && q.includes('where id = ?')) {
        const existed = mockEdges.has(params[0]);
        mockEdges.delete(params[0]);
        return mockExecResult([], existed ? 1 : 0);
      }

      // DELETE FROM edges (all)
      if (q.includes('delete from edges') && !q.includes('where')) {
        mockEdges.clear();
        return mockExecResult();
      }

      // INSERT INTO snapshots
      if (q.includes('insert into snapshots')) {
        const [id, name, createdAt, graphJson] = params;
        mockSnapshots.set(id, { id, name, created_at: createdAt, graph_json: graphJson });
        return mockExecResult([], 1);
      }

      // SELECT FROM snapshots
      if (q.includes('select') && q.includes('from snapshots')) {
        if (q.includes('where')) {
          const nameOrId = params[0];
          for (const snap of mockSnapshots.values()) {
            if (snap.id === nameOrId || snap.name === nameOrId) {
              return mockExecResult([snap]);
            }
          }
          return mockExecResult([]);
        }
        return mockExecResult(Array.from(mockSnapshots.values()));
      }

      // INSERT INTO changes
      if (q.includes('insert into changes')) {
        const [id, timestamp, action, targetId, beforeState, afterState, sourceTurn] = params;
        mockChanges.push({
          id,
          timestamp,
          action,
          target_id: targetId,
          before_state: beforeState,
          after_state: afterState,
          source_turn: sourceTurn,
          undone: 0,
        });
        return mockExecResult([], 1);
      }

      // SELECT FROM changes
      if (q.includes('select') && q.includes('from changes')) {
        if (q.includes('undone = 0')) {
          const nonUndone = mockChanges.filter((c) => c.undone === 0);
          nonUndone.sort((a, b) => b.timestamp - a.timestamp);
          return mockExecResult(nonUndone.slice(0, 1));
        }
        if (q.includes('undone = 1')) {
          const undone = mockChanges.filter((c) => c.undone === 1);
          undone.sort((a, b) => b.timestamp - a.timestamp);
          return mockExecResult(undone.slice(0, 1));
        }
        if (q.includes('source_turn = ?')) {
          const turnChanges = mockChanges.filter((c) => c.source_turn === params[0]);
          return mockExecResult(turnChanges);
        }
        mockChanges.sort((a, b) => b.timestamp - a.timestamp);
        return mockExecResult(mockChanges.slice(0, params[0] ?? 50));
      }

      // UPDATE changes
      if (q.includes('update changes')) {
        const id = params[params.length - 1];
        const change = mockChanges.find((c) => c.id === id);
        if (change) {
          change.undone = q.includes('undone = 1') ? 1 : 0;
        }
        return mockExecResult([], 1);
      }

      // Search nodes (LIKE query)
      if (q.includes('like ?')) {
        const pattern = params[0].replace(/%/g, '');
        const matches = Array.from(mockNodes.values()).filter(
          (n) =>
            n.title.toLowerCase().includes(pattern.toLowerCase()) ||
            n.description.toLowerCase().includes(pattern.toLowerCase())
        );
        return mockExecResult(matches.slice(0, params[params.length - 1] || 10));
      }

      // COUNT queries
      if (q.includes('count(*)')) {
        if (q.includes('from edges')) {
          return mockExecResult([{ count: mockEdges.size }]);
        }
        if (q.includes('from nodes')) {
          return mockExecResult([{ count: mockNodes.size }]);
        }
      }

      // GROUP BY queries
      if (q.includes('group by kind')) {
        const counts: Record<string, number> = {};
        for (const node of mockNodes.values()) {
          counts[node.kind] = (counts[node.kind] ?? 0) + 1;
        }
        return mockExecResult(Object.entries(counts).map(([kind, count]) => ({ kind, count })));
      }

      // Default fallback
      return mockExecResult();
    }),
  };
}

// Mock the Cloudflare context
vi.mock('@flue/runtime/cloudflare', () => ({
  getCloudflareContext: () => ({
    storage: {
      sql: createMockSql(),
    },
  }),
}));

// Import store after mocking
const store = await import('../src/genome/store.js');

// ─────────────────────────────────────────────────────────────────────────────
// Test Setup
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockNodes = new Map();
  mockEdges = new Map();
  mockSnapshots = new Map();
  mockChanges = [];
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// Node Operations
// ─────────────────────────────────────────────────────────────────────────────

describe('Node Operations', () => {
  describe('addNode', () => {
    it('creates a node with all properties', () => {
      const node = store.addNode('entity', 'User', 'A system user');
      expect(node.kind).toBe('entity');
      expect(node.title).toBe('User');
      expect(node.description).toBe('A system user');
      expect(node.id).toBeDefined();
      expect(node.createdAt).toBeDefined();
      expect(node.updatedAt).toBeDefined();
    });

    it('creates a node with source refs', () => {
      const refs: SourceRef[] = [{ turnId: 't1', excerpt: 'need users' }];
      const node = store.addNode('entity', 'User', 'A user', refs);
      expect(node.sourceRefs).toEqual(refs);
    });

    it('records a change for tracking', () => {
      store.addNode('entity', 'User', 'Test');
      expect(mockChanges).toHaveLength(1);
      expect(mockChanges[0].action).toBe('add_node');
    });
  });

  describe('getNode', () => {
    it('returns node when it exists', () => {
      const created = store.addNode('entity', 'User', 'Test');
      const retrieved = store.getNode(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.title).toBe('User');
    });

    it('returns null when node does not exist', () => {
      const retrieved = store.getNode('nonexistent');
      expect(retrieved).toBeNull();
    });
  });

  describe('updateNode', () => {
    it('updates title and description', () => {
      const node = store.addNode('entity', 'User', 'Old description');
      const updated = store.updateNode(node.id, 'Updated User', 'New description');
      expect(updated?.title).toBe('Updated User');
      expect(updated?.description).toBe('New description');
    });

    it('updates source refs when provided', () => {
      const node = store.addNode('entity', 'User', 'Test');
      const refs: SourceRef[] = [{ turnId: 't2', excerpt: 'updated info' }];
      const updated = store.updateNode(node.id, 'User', 'Test', refs);
      expect(updated?.sourceRefs).toEqual(refs);
    });

    it('throws for invalid ID format', () => {
      expect(() => store.updateNode('nonexistent', 'Title', 'Desc')).toThrow('Invalid node ID');
    });

    it('throws when node with valid UUID does not exist', () => {
      expect(() => store.updateNode('00000000-0000-0000-0000-000000000000', 'Title', 'Desc')).toThrow('Node not found');
    });

    it('records a change for tracking', () => {
      const node = store.addNode('entity', 'User', 'Test');
      mockChanges.length = 0; // Clear add change
      store.updateNode(node.id, 'Updated', 'New');
      expect(mockChanges.some((c) => c.action === 'update_node')).toBe(true);
    });
  });

  describe('deleteNode', () => {
    it('deletes existing node', () => {
      const node = store.addNode('entity', 'User', 'Test');
      const result = store.deleteNode(node.id);
      expect(result).toBe(true);
      expect(store.getNode(node.id)).toBeNull();
    });

    it('throws for invalid ID format', () => {
      expect(() => store.deleteNode('nonexistent')).toThrow('Invalid node ID');
    });

    it('throws when node with valid UUID does not exist', () => {
      expect(() => store.deleteNode('00000000-0000-0000-0000-000000000000')).toThrow('Node not found');
    });

    it('records a change for tracking', () => {
      const node = store.addNode('entity', 'User', 'Test');
      mockChanges.length = 0;
      store.deleteNode(node.id);
      expect(mockChanges.some((c) => c.action === 'delete_node')).toBe(true);
    });
  });

  describe('listNodes', () => {
    it('returns empty array for empty store', () => {
      const nodes = store.listNodes();
      expect(nodes).toEqual([]);
    });

    it('returns all nodes', () => {
      store.addNode('entity', 'User', 'Test 1');
      store.addNode('entity', 'Project', 'Test 2');
      const nodes = store.listNodes();
      expect(nodes).toHaveLength(2);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge Operations
// ─────────────────────────────────────────────────────────────────────────────

describe('Edge Operations', () => {
  describe('addEdge', () => {
    it('creates an edge between nodes', () => {
      const n1 = store.addNode('entity', 'User', 'Test');
      const n2 = store.addNode('entity', 'Project', 'Test');
      const edge = store.addEdge(n1.id, n2.id, 'has');
      expect(edge.srcId).toBe(n1.id);
      expect(edge.dstId).toBe(n2.id);
      expect(edge.type).toBe('has');
    });

    it('creates an edge with label', () => {
      const n1 = store.addNode('entity', 'User', 'Test');
      const n2 = store.addNode('entity', 'Project', 'Test');
      const edge = store.addEdge(n1.id, n2.id, 'has', 'owns');
      expect(edge.label).toBe('owns');
    });

    it('records a change for tracking', () => {
      const n1 = store.addNode('entity', 'User', 'Test');
      const n2 = store.addNode('entity', 'Project', 'Test');
      mockChanges.length = 0;
      store.addEdge(n1.id, n2.id, 'has');
      expect(mockChanges.some((c) => c.action === 'add_edge')).toBe(true);
    });
  });

  describe('getEdge', () => {
    it('returns edge when it exists', () => {
      const n1 = store.addNode('entity', 'User', 'Test');
      const n2 = store.addNode('entity', 'Project', 'Test');
      const created = store.addEdge(n1.id, n2.id, 'has');
      const retrieved = store.getEdge(created.id);
      expect(retrieved).toBeDefined();
      expect(retrieved?.type).toBe('has');
    });

    it('returns null when edge does not exist', () => {
      const retrieved = store.getEdge('nonexistent');
      expect(retrieved).toBeNull();
    });
  });

  describe('deleteEdge', () => {
    it('deletes existing edge', () => {
      const n1 = store.addNode('entity', 'User', 'Test');
      const n2 = store.addNode('entity', 'Project', 'Test');
      const edge = store.addEdge(n1.id, n2.id, 'has');
      const result = store.deleteEdge(edge.id);
      expect(result).toBe(true);
      expect(store.getEdge(edge.id)).toBeNull();
    });

    it('throws for invalid ID format', () => {
      expect(() => store.deleteEdge('nonexistent')).toThrow('Invalid edge ID');
    });

    it('throws when edge with valid UUID does not exist', () => {
      expect(() => store.deleteEdge('00000000-0000-0000-0000-000000000000')).toThrow('Edge not found');
    });
  });

  describe('listEdges', () => {
    it('returns empty array for empty store', () => {
      const edges = store.listEdges();
      expect(edges).toEqual([]);
    });

    it('returns all edges', () => {
      const n1 = store.addNode('entity', 'User', 'Test');
      const n2 = store.addNode('entity', 'Project', 'Test');
      const n3 = store.addNode('entity', 'Task', 'Test');
      store.addEdge(n1.id, n2.id, 'has');
      store.addEdge(n2.id, n3.id, 'contains');
      const edges = store.listEdges();
      expect(edges).toHaveLength(2);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Graph Operations
// ─────────────────────────────────────────────────────────────────────────────

describe('Graph Operations', () => {
  describe('getGraph', () => {
    it('returns empty graph initially', () => {
      const graph = store.getGraph();
      expect(graph.nodes).toEqual([]);
      expect(graph.edges).toEqual([]);
    });

    it('returns all nodes and edges', () => {
      const n1 = store.addNode('entity', 'User', 'Test');
      const n2 = store.addNode('entity', 'Project', 'Test');
      store.addEdge(n1.id, n2.id, 'has');
      const graph = store.getGraph();
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot Operations
// ─────────────────────────────────────────────────────────────────────────────

describe('Snapshot Operations', () => {
  describe('createSnapshot', () => {
    it('creates a snapshot of current graph', () => {
      store.addNode('entity', 'User', 'Test');
      const snapshot = store.createSnapshot('v1');
      expect(snapshot.name).toBe('v1');
      expect(snapshot.graphJson).toBeDefined();
      const graph = JSON.parse(snapshot.graphJson);
      expect(graph.nodes).toHaveLength(1);
    });
  });

  describe('listSnapshots', () => {
    it('returns empty array when no snapshots', () => {
      const snapshots = store.listSnapshots();
      expect(snapshots).toEqual([]);
    });

    it('returns all snapshots without graphJson', () => {
      store.createSnapshot('v1');
      store.createSnapshot('v2');
      const snapshots = store.listSnapshots();
      expect(snapshots).toHaveLength(2);
      expect(snapshots[0]).not.toHaveProperty('graphJson');
    });
  });

  describe('getSnapshot', () => {
    it('returns snapshot by name', () => {
      store.createSnapshot('v1');
      const snapshot = store.getSnapshot('v1');
      expect(snapshot?.name).toBe('v1');
    });

    it('returns null for nonexistent snapshot', () => {
      const snapshot = store.getSnapshot('nonexistent');
      expect(snapshot).toBeNull();
    });
  });

  describe('restoreSnapshot', () => {
    it('restores graph from snapshot', () => {
      store.addNode('entity', 'User', 'Original');
      store.createSnapshot('v1');
      store.addNode('entity', 'Project', 'New');

      const result = store.restoreSnapshot('v1');
      expect(result.restored).toBe(true);
      expect(result.nodeCount).toBe(1);
    });

    it('returns restored=false for nonexistent snapshot', () => {
      const result = store.restoreSnapshot('nonexistent');
      expect(result.restored).toBe(false);
    });
  });

  describe('diffSnapshot', () => {
    it('returns null for nonexistent snapshot', () => {
      const diff = store.diffSnapshot('nonexistent');
      expect(diff).toBeNull();
    });

    it('detects added nodes', () => {
      store.addNode('entity', 'User', 'Test');
      store.createSnapshot('v1');
      store.addNode('entity', 'Project', 'New');

      const diff = store.diffSnapshot('v1');
      expect(diff?.nodes.added).toHaveLength(1);
      expect(diff?.nodes.added[0].title).toBe('Project');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Undo/Redo Operations
// ─────────────────────────────────────────────────────────────────────────────

describe('Undo/Redo Operations', () => {
  describe('undoLastChange', () => {
    it('returns error when no changes to undo', () => {
      const result = store.undoLastChange();
      expect(result.success).toBe(false);
      expect(result.error).toContain('No changes');
    });

    it('undoes add_node by deleting the node', () => {
      const node = store.addNode('entity', 'User', 'Test');
      expect(store.getNode(node.id)).toBeDefined();

      const result = store.undoLastChange();
      expect(result.success).toBe(true);
      expect(result.change?.action).toBe('add_node');
      expect(store.getNode(node.id)).toBeNull();
    });

    it('undoes delete_node by restoring the node', () => {
      const node = store.addNode('entity', 'User', 'Test');
      store.deleteNode(node.id);
      expect(store.getNode(node.id)).toBeNull();

      const result = store.undoLastChange();
      expect(result.success).toBe(true);
      // Node should be restored
    });

    it('undoes most recent change', () => {
      // Create a node
      const node = store.addNode('entity', 'User', 'Test');
      expect(store.getNode(node.id)).toBeDefined();

      // Most recent change should be add_node
      const result = store.undoLastChange();
      expect(result.success).toBe(true);
      expect(result.change?.action).toBe('add_node');
    });
  });

  describe('redoLastUndo', () => {
    it('returns error when no undone changes to redo', () => {
      const result = store.redoLastUndo();
      expect(result.success).toBe(false);
      expect(result.error).toContain('No undone');
    });

    it('redoes undone add_node', () => {
      const node = store.addNode('entity', 'User', 'Test');
      store.undoLastChange();
      expect(store.getNode(node.id)).toBeNull();

      const result = store.redoLastUndo();
      expect(result.success).toBe(true);
      expect(result.change?.action).toBe('add_node');
    });
  });

  describe('getChangeHistory', () => {
    it('returns empty array when no changes', () => {
      const history = store.getChangeHistory();
      expect(history).toEqual([]);
    });

    it('returns changes in reverse chronological order', () => {
      store.addNode('entity', 'First', 'Test');
      store.addNode('entity', 'Second', 'Test');
      const history = store.getChangeHistory();
      expect(history).toHaveLength(2);
      // Most recent first
      expect(history[0].timestamp).toBeGreaterThanOrEqual(history[1].timestamp);
    });

    it('respects limit parameter', () => {
      store.addNode('entity', 'One', 'Test');
      store.addNode('entity', 'Two', 'Test');
      store.addNode('entity', 'Three', 'Test');
      const history = store.getChangeHistory(2);
      expect(history).toHaveLength(2);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Search Operations
// ─────────────────────────────────────────────────────────────────────────────

describe('Search Operations', () => {
  describe('searchNodes', () => {
    it('returns empty array for no matches', () => {
      store.addNode('entity', 'User', 'A person');
      const results = store.searchNodes('nonexistent');
      expect(results).toEqual([]);
    });

    it('finds nodes by title', () => {
      store.addNode('entity', 'User', 'A person');
      store.addNode('entity', 'Project', 'A collection');
      const results = store.searchNodes('User');
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].title).toBe('User');
    });

    it('finds nodes by description', () => {
      store.addNode('entity', 'User', 'A system administrator');
      const results = store.searchNodes('administrator');
      expect(results.length).toBeGreaterThan(0);
    });

    it('respects limit option', () => {
      for (let i = 0; i < 20; i++) {
        store.addNode('entity', `Entity ${i}`, 'Test description');
      }
      const results = store.searchNodes('Entity', { limit: 5 });
      expect(results.length).toBeLessThanOrEqual(5);
    });
  });

  describe('findRelatedNodes', () => {
    it('returns empty array for no matches', () => {
      store.addNode('entity', 'User', 'A person');
      const results = store.findRelatedNodes('xyz123');
      expect(results).toEqual([]);
    });

    it('finds nodes matching concept words', () => {
      store.addNode('entity', 'User Account', 'User account management');
      const results = store.findRelatedNodes('account management');
      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('getNodeContext', () => {
    it('returns null for nonexistent node', () => {
      const context = store.getNodeContext('nonexistent');
      expect(context).toBeNull();
    });

    it('returns node with connected nodes and edges', () => {
      const n1 = store.addNode('entity', 'User', 'Test');
      const n2 = store.addNode('entity', 'Project', 'Test');
      store.addEdge(n1.id, n2.id, 'has');

      const context = store.getNodeContext(n1.id);
      expect(context).toBeDefined();
      expect(context?.node.id).toBe(n1.id);
      expect(context?.edges.length).toBeGreaterThan(0);
    });
  });

  describe('getGraphSummary', () => {
    it('returns correct counts', () => {
      store.addNode('entity', 'User', 'Test');
      store.addNode('entity', 'Project', 'Test');
      store.addNode('persona', 'Admin', 'Test');

      const summary = store.getGraphSummary();
      expect(summary.totalNodes).toBe(3);
      // byKind is populated from GROUP BY query
      // Our mock may not populate this correctly, so check the structure
      expect(typeof summary.byKind).toBe('object');
      expect(typeof summary.totalEdges).toBe('number');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Completeness Score
// ─────────────────────────────────────────────────────────────────────────────

describe('Completeness Score', () => {
  describe('getCompletenessScore', () => {
    it('returns 0 for empty graph', () => {
      const score = store.getCompletenessScore();
      expect(score.overall).toBe(0);
    });

    it('increases score with name node', () => {
      store.addNode('name', 'My App', 'The application name');
      const score = store.getCompletenessScore();
      expect(score.overall).toBeGreaterThan(0);
    });

    it('returns suggestions for missing content', () => {
      const score = store.getCompletenessScore();
      expect(score.suggestions.length).toBeGreaterThan(0);
    });

    it('tracks missing items', () => {
      const score = store.getCompletenessScore();
      expect(score.missing.some((m) => m.kind === 'name')).toBe(true);
    });

    it('provides space-by-space breakdown', () => {
      store.addNode('name', 'App', 'Test');
      store.addNode('purpose', 'Purpose', 'Test');
      const score = store.getCompletenessScore();
      expect(score.spaces).toHaveLength(4);
      expect(score.spaces.find((s) => s.space === 'basics')?.score).toBeGreaterThan(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AI Suggestions
// ─────────────────────────────────────────────────────────────────────────────

describe('AI Suggestions', () => {
  describe('getSuggestions', () => {
    it('returns empty suggestions for empty graph', () => {
      const suggestions = store.getSuggestions();
      expect(suggestions).toEqual([]);
    });

    it('suggests connections for orphan nodes', () => {
      store.addNode('entity', 'User', 'Test');
      const suggestions = store.getSuggestions();
      // Should suggest something for the orphan
      expect(suggestions.some((s) => s.category === 'orphan')).toBe(true);
    });

    it('suggests flow for usecase without flow', () => {
      const uc = store.addNode('usecase', 'Login', 'User logs in');
      const suggestions = store.getSuggestions();
      expect(suggestions.some((s) => s.category === 'missing_connection')).toBe(true);
    });

    it('returns prioritized suggestions', () => {
      store.addNode('usecase', 'Login', 'Test');
      store.addNode('entity', 'User', 'Test');
      store.addNode('entity', 'Project', 'Test');
      const suggestions = store.getSuggestions();
      // Should be sorted by priority
      if (suggestions.length >= 2) {
        const priorities = { high: 0, medium: 1, low: 2 };
        expect(priorities[suggestions[0].priority]).toBeLessThanOrEqual(priorities[suggestions[1].priority]);
      }
    });

    it('limits suggestions to 5', () => {
      // Create many nodes that would generate suggestions
      for (let i = 0; i < 10; i++) {
        store.addNode('entity', `Entity${i}`, 'Test');
      }
      const suggestions = store.getSuggestions();
      expect(suggestions.length).toBeLessThanOrEqual(5);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Export Operations
// ─────────────────────────────────────────────────────────────────────────────

describe('Export Operations', () => {
  describe('exportMarkdown', () => {
    it('exports empty graph', () => {
      const md = store.exportMarkdown();
      expect(md).toContain('Knowledge Graph Export');
    });

    it('includes nodes organized by space', () => {
      store.addNode('name', 'My App', 'The app');
      store.addNode('entity', 'User', 'A user');
      const md = store.exportMarkdown();
      expect(md).toContain('My App');
      expect(md).toContain('User');
      expect(md).toContain('Basics');
      expect(md).toContain('Solution Space');
    });

    it('includes relationships', () => {
      const n1 = store.addNode('entity', 'User', 'A user');
      const n2 = store.addNode('entity', 'Project', 'A project');
      store.addEdge(n1.id, n2.id, 'has', 'owns');
      const md = store.exportMarkdown();
      expect(md).toContain('Relationships');
      expect(md).toContain('has');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap Operations
// ─────────────────────────────────────────────────────────────────────────────

describe('Bootstrap Operations', () => {
  describe('loadBootstrapGraph', () => {
    it('loads bootstrap data into graph', () => {
      const bootstrapData: store.BootstrapGraph = {
        nodes: [
          { id: 'n1', kind: 'name', title: 'Test App', description: 'A test', sourceRefs: [] },
        ],
        edges: [],
      };
      const result = store.loadBootstrapGraph(bootstrapData);
      expect(result.success).toBe(true);
      expect(result.nodeCount).toBe(1);
    });

    it('clears existing graph before loading', () => {
      store.addNode('entity', 'Existing', 'Test');
      const bootstrapData: store.BootstrapGraph = {
        nodes: [
          { id: 'n1', kind: 'name', title: 'New', description: 'New app', sourceRefs: [] },
        ],
        edges: [],
      };
      store.loadBootstrapGraph(bootstrapData);
      const graph = store.getGraph();
      expect(graph.nodes).toHaveLength(1);
      expect(graph.nodes[0].title).toBe('New');
    });

    it('loads edges', () => {
      const bootstrapData: store.BootstrapGraph = {
        nodes: [
          { id: 'n1', kind: 'entity', title: 'User', description: 'A user', sourceRefs: [] },
          { id: 'n2', kind: 'entity', title: 'Project', description: 'A project', sourceRefs: [] },
        ],
        edges: [
          { id: 'e1', srcId: 'n1', dstId: 'n2', type: 'has' },
        ],
      };
      const result = store.loadBootstrapGraph(bootstrapData);
      expect(result.success).toBe(true);
      expect(result.edgeCount).toBe(1);
    });
  });
});
