/**
 * Tests for genome validation rules.
 * These are pure functions that don't require database access.
 */

import { describe, it, expect } from 'vitest';
import {
  validateGraph,
  validateChange,
  validationRules,
  type Graph,
  type GraphChange,
} from '../src/genome/validation.js';
import type { Node, Edge, NodeKind } from '../src/genome/types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Test Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeNode(
  id: string,
  kind: NodeKind,
  title: string,
  description = ''
): Node {
  const now = Date.now();
  return {
    id,
    kind,
    title,
    description,
    sourceRefs: [],
    createdAt: now,
    updatedAt: now,
  };
}

function makeEdge(
  id: string,
  srcId: string,
  dstId: string,
  type: 'has' | 'uses' | 'triggers' | 'implements' | 'depends_on' | 'extends' | 'contains' | 'references' = 'references'
): Edge {
  return { id, srcId, dstId, type };
}

// ─────────────────────────────────────────────────────────────────────────────
// Error Rules
// ─────────────────────────────────────────────────────────────────────────────

describe('Validation: Error Rules', () => {
  describe('no-duplicate-singular', () => {
    it('allows one name node', () => {
      const graph: Graph = {
        nodes: [makeNode('n1', 'name', 'My App')],
        edges: [],
      };
      const result = validateGraph(graph);
      expect(result.valid).toBe(true);
      expect(result.errors.filter((e) => e.ruleId === 'no-duplicate-singular')).toHaveLength(0);
    });

    it('errors on multiple name nodes', () => {
      const graph: Graph = {
        nodes: [
          makeNode('n1', 'name', 'My App'),
          makeNode('n2', 'name', 'Also My App'),
        ],
        edges: [],
      };
      const result = validateGraph(graph);
      expect(result.valid).toBe(false);
      const issue = result.errors.find((e) => e.ruleId === 'no-duplicate-singular');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('name');
      expect(issue?.nodeIds).toContain('n1');
      expect(issue?.nodeIds).toContain('n2');
    });

    it('errors on multiple purpose nodes', () => {
      const graph: Graph = {
        nodes: [
          makeNode('p1', 'purpose', 'To do X'),
          makeNode('p2', 'purpose', 'Also to do Y'),
        ],
        edges: [],
      };
      const result = validateGraph(graph);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.ruleId === 'no-duplicate-singular')).toBe(true);
    });

    it('allows multiple non-singular nodes of same kind', () => {
      const graph: Graph = {
        nodes: [
          makeNode('e1', 'entity', 'User'),
          makeNode('e2', 'entity', 'Project'),
          makeNode('e3', 'entity', 'Task'),
        ],
        edges: [],
      };
      const result = validateGraph(graph);
      expect(result.errors.filter((e) => e.ruleId === 'no-duplicate-singular')).toHaveLength(0);
    });
  });

  describe('edge-references-valid', () => {
    it('passes when all edge references are valid', () => {
      const graph: Graph = {
        nodes: [
          makeNode('n1', 'entity', 'User'),
          makeNode('n2', 'entity', 'Project'),
        ],
        edges: [makeEdge('e1', 'n1', 'n2', 'has')],
      };
      const result = validateGraph(graph);
      expect(result.errors.filter((e) => e.ruleId === 'edge-references-valid')).toHaveLength(0);
    });

    it('errors when edge source does not exist', () => {
      const graph: Graph = {
        nodes: [makeNode('n2', 'entity', 'Project')],
        edges: [makeEdge('e1', 'nonexistent', 'n2', 'has')],
      };
      const result = validateGraph(graph);
      expect(result.valid).toBe(false);
      const issue = result.errors.find((e) => e.ruleId === 'edge-references-valid');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('nonexistent');
    });

    it('errors when edge destination does not exist', () => {
      const graph: Graph = {
        nodes: [makeNode('n1', 'entity', 'User')],
        edges: [makeEdge('e1', 'n1', 'nonexistent', 'has')],
      };
      const result = validateGraph(graph);
      expect(result.valid).toBe(false);
      const issue = result.errors.find((e) => e.ruleId === 'edge-references-valid');
      expect(issue).toBeDefined();
    });

    it('errors when both endpoints are invalid', () => {
      const graph: Graph = {
        nodes: [],
        edges: [makeEdge('e1', 'ghost1', 'ghost2', 'has')],
      };
      const result = validateGraph(graph);
      expect(result.valid).toBe(false);
      const issue = result.errors.find((e) => e.ruleId === 'edge-references-valid');
      expect(issue?.message).toContain('source');
      expect(issue?.message).toContain('destination');
    });
  });

  describe('no-self-reference', () => {
    it('passes when no self-loops exist', () => {
      const graph: Graph = {
        nodes: [
          makeNode('n1', 'entity', 'User'),
          makeNode('n2', 'entity', 'Project'),
        ],
        edges: [makeEdge('e1', 'n1', 'n2', 'has')],
      };
      const result = validateGraph(graph);
      expect(result.errors.filter((e) => e.ruleId === 'no-self-reference')).toHaveLength(0);
    });

    it('errors on self-referencing edge', () => {
      const graph: Graph = {
        nodes: [makeNode('n1', 'entity', 'User')],
        edges: [makeEdge('e1', 'n1', 'n1', 'references')],
      };
      const result = validateGraph(graph);
      expect(result.valid).toBe(false);
      const issue = result.errors.find((e) => e.ruleId === 'no-self-reference');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('User');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Warning Rules
// ─────────────────────────────────────────────────────────────────────────────

describe('Validation: Warning Rules', () => {
  describe('orphan-nodes', () => {
    it('does not warn for name/purpose nodes without edges', () => {
      const graph: Graph = {
        nodes: [
          makeNode('n1', 'name', 'My App'),
          makeNode('p1', 'purpose', 'To help users'),
        ],
        edges: [],
      };
      const result = validateGraph(graph);
      expect(result.warnings.filter((w) => w.ruleId === 'orphan-nodes')).toHaveLength(0);
    });

    it('warns for orphan entity nodes', () => {
      const graph: Graph = {
        nodes: [makeNode('e1', 'entity', 'User')],
        edges: [],
      };
      const result = validateGraph(graph);
      const issue = result.warnings.find((w) => w.ruleId === 'orphan-nodes');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('User');
    });

    it('does not warn for connected nodes', () => {
      const graph: Graph = {
        nodes: [
          makeNode('e1', 'entity', 'User'),
          makeNode('e2', 'entity', 'Project'),
        ],
        edges: [makeEdge('edge1', 'e1', 'e2', 'has')],
      };
      const result = validateGraph(graph);
      expect(result.warnings.filter((w) => w.ruleId === 'orphan-nodes')).toHaveLength(0);
    });
  });

  describe('usecase-needs-persona', () => {
    it('does not check if no personas exist', () => {
      const graph: Graph = {
        nodes: [makeNode('uc1', 'usecase', 'Login')],
        edges: [],
      };
      const result = validateGraph(graph);
      expect(result.warnings.filter((w) => w.ruleId === 'usecase-needs-persona')).toHaveLength(0);
    });

    it('warns when usecase not connected to any persona', () => {
      const graph: Graph = {
        nodes: [
          makeNode('p1', 'persona', 'Admin'),
          makeNode('uc1', 'usecase', 'Login'),
        ],
        edges: [],
      };
      const result = validateGraph(graph);
      const issue = result.warnings.find((w) => w.ruleId === 'usecase-needs-persona');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('Login');
    });

    it('passes when usecase is connected to persona', () => {
      const graph: Graph = {
        nodes: [
          makeNode('p1', 'persona', 'Admin'),
          makeNode('uc1', 'usecase', 'Login'),
        ],
        edges: [makeEdge('e1', 'p1', 'uc1', 'uses')],
      };
      const result = validateGraph(graph);
      expect(result.warnings.filter((w) => w.ruleId === 'usecase-needs-persona')).toHaveLength(0);
    });
  });

  describe('flow-needs-usecase', () => {
    it('does not check if no usecases exist', () => {
      const graph: Graph = {
        nodes: [makeNode('f1', 'flow', 'Login Flow')],
        edges: [],
      };
      const result = validateGraph(graph);
      expect(result.warnings.filter((w) => w.ruleId === 'flow-needs-usecase')).toHaveLength(0);
    });

    it('warns when flow not connected to any usecase', () => {
      const graph: Graph = {
        nodes: [
          makeNode('uc1', 'usecase', 'Login'),
          makeNode('f1', 'flow', 'Login Flow'),
        ],
        edges: [],
      };
      const result = validateGraph(graph);
      const issue = result.warnings.find((w) => w.ruleId === 'flow-needs-usecase');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('Login Flow');
    });
  });

  describe('entity-needs-relationship', () => {
    it('does not check if less than 2 entities', () => {
      const graph: Graph = {
        nodes: [makeNode('e1', 'entity', 'User')],
        edges: [],
      };
      const result = validateGraph(graph);
      expect(result.warnings.filter((w) => w.ruleId === 'entity-needs-relationship')).toHaveLength(0);
    });

    it('warns when entity has no relationships', () => {
      const graph: Graph = {
        nodes: [
          makeNode('e1', 'entity', 'User'),
          makeNode('e2', 'entity', 'Project'),
          makeNode('e3', 'entity', 'Task'),
        ],
        edges: [makeEdge('edge1', 'e1', 'e2', 'has')],
      };
      const result = validateGraph(graph);
      const issue = result.warnings.find((w) => w.ruleId === 'entity-needs-relationship');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('Task');
    });
  });

  describe('missing-source-ref', () => {
    it('warns when node has no sourceRefs', () => {
      const graph: Graph = {
        nodes: [makeNode('e1', 'entity', 'User')],
        edges: [],
      };
      const result = validateGraph(graph);
      const issue = result.warnings.find((w) => w.ruleId === 'missing-source-ref');
      expect(issue).toBeDefined();
    });

    it('does not warn when node has sourceRefs', () => {
      const node = makeNode('e1', 'entity', 'User');
      node.sourceRefs = [{ turnId: 't1', excerpt: 'need a user entity' }];
      const graph: Graph = {
        nodes: [node],
        edges: [],
      };
      const result = validateGraph(graph);
      expect(result.warnings.filter((w) => w.ruleId === 'missing-source-ref')).toHaveLength(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Suggestion Rules
// ─────────────────────────────────────────────────────────────────────────────

describe('Validation: Suggestion Rules', () => {
  describe('empty-basics', () => {
    it('suggests when no name or purpose defined', () => {
      const graph: Graph = {
        nodes: [makeNode('e1', 'entity', 'User')],
        edges: [],
      };
      const result = validateGraph(graph);
      const issue = result.suggestions.find((s) => s.ruleId === 'empty-basics');
      expect(issue).toBeDefined();
    });

    it('suggests when only name defined', () => {
      const graph: Graph = {
        nodes: [makeNode('n1', 'name', 'My App')],
        edges: [],
      };
      const result = validateGraph(graph);
      const issue = result.suggestions.find((s) => s.ruleId === 'empty-basics');
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('purpose');
    });

    it('does not suggest when both defined', () => {
      const graph: Graph = {
        nodes: [
          makeNode('n1', 'name', 'My App'),
          makeNode('p1', 'purpose', 'To help users'),
        ],
        edges: [],
      };
      const result = validateGraph(graph);
      expect(result.suggestions.filter((s) => s.ruleId === 'empty-basics')).toHaveLength(0);
    });
  });

  describe('no-assumptions', () => {
    it('does not suggest for small graphs', () => {
      const graph: Graph = {
        nodes: [
          makeNode('n1', 'name', 'My App'),
          makeNode('p1', 'persona', 'Admin'),
        ],
        edges: [],
      };
      const result = validateGraph(graph);
      expect(result.suggestions.filter((s) => s.ruleId === 'no-assumptions')).toHaveLength(0);
    });

    it('suggests for substantial graphs without assumptions', () => {
      const graph: Graph = {
        nodes: [
          makeNode('p1', 'persona', 'Admin'),
          makeNode('uc1', 'usecase', 'Login'),
          makeNode('uc2', 'usecase', 'Manage users'),
          makeNode('f1', 'flow', 'Login flow'),
        ],
        edges: [],
      };
      const result = validateGraph(graph);
      const issue = result.suggestions.find((s) => s.ruleId === 'no-assumptions');
      expect(issue).toBeDefined();
    });

    it('does not suggest when assumptions exist', () => {
      const graph: Graph = {
        nodes: [
          makeNode('p1', 'persona', 'Admin'),
          makeNode('uc1', 'usecase', 'Login'),
          makeNode('uc2', 'usecase', 'Manage users'),
          makeNode('a1', 'assumption', 'Users have email'),
        ],
        edges: [],
      };
      const result = validateGraph(graph);
      expect(result.suggestions.filter((s) => s.ruleId === 'no-assumptions')).toHaveLength(0);
    });
  });

  describe('solution-before-problem', () => {
    it('suggests when solution heavy but problem sparse', () => {
      const graph: Graph = {
        nodes: [
          makeNode('e1', 'entity', 'User'),
          makeNode('e2', 'entity', 'Project'),
          makeNode('e3', 'entity', 'Task'),
          makeNode('p1', 'persona', 'Admin'),
        ],
        edges: [],
      };
      const result = validateGraph(graph);
      const issue = result.suggestions.find((s) => s.ruleId === 'solution-before-problem');
      expect(issue).toBeDefined();
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateGraph function
// ─────────────────────────────────────────────────────────────────────────────

describe('validateGraph', () => {
  it('returns valid=true for empty graph', () => {
    const graph: Graph = { nodes: [], edges: [] };
    const result = validateGraph(graph);
    expect(result.valid).toBe(true);
    expect(result.summary.errorCount).toBe(0);
  });

  it('returns correct summary counts', () => {
    const graph: Graph = {
      nodes: [
        makeNode('n1', 'name', 'App'),
        makeNode('n2', 'name', 'App2'), // duplicate singular
        makeNode('e1', 'entity', 'User'),
      ],
      edges: [],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.summary.errorCount).toBeGreaterThan(0);
    expect(result.summary.warningCount).toBeGreaterThanOrEqual(0);
    expect(result.summary.suggestionCount).toBeGreaterThanOrEqual(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateChange function
// ─────────────────────────────────────────────────────────────────────────────

describe('validateChange', () => {
  it('validates add_node that creates duplicate singular', () => {
    const graph: Graph = {
      nodes: [makeNode('n1', 'name', 'My App')],
      edges: [],
    };
    const change: GraphChange = {
      type: 'add_node',
      node: { id: 'n2', kind: 'name', title: 'Another Name' },
    };
    const result = validateChange(change, graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.ruleId === 'no-duplicate-singular')).toBe(true);
  });

  it('validates add_node that does not create issues', () => {
    const graph: Graph = {
      nodes: [makeNode('e1', 'entity', 'User')],
      edges: [],
    };
    const change: GraphChange = {
      type: 'add_node',
      node: { id: 'e2', kind: 'entity', title: 'Project' },
    };
    const result = validateChange(change, graph);
    // May have warnings (orphan nodes) but no errors
    const hasNoNewErrors = !result.errors.some((e) => e.ruleId === 'no-duplicate-singular');
    expect(hasNoNewErrors).toBe(true);
  });

  it('validates delete_node that creates orphaned edges', () => {
    const graph: Graph = {
      nodes: [
        makeNode('n1', 'entity', 'User'),
        makeNode('n2', 'entity', 'Project'),
      ],
      edges: [makeEdge('e1', 'n1', 'n2', 'has')],
    };
    const change: GraphChange = {
      type: 'delete_node',
      node: { id: 'n1' },
    };
    const result = validateChange(change, graph);
    // After simulating delete, edge should also be removed
    // so no orphaned edge error, but n2 becomes orphan
    expect(result.errors.filter((e) => e.ruleId === 'edge-references-valid')).toHaveLength(0);
  });

  it('validates add_edge with valid nodes', () => {
    const graph: Graph = {
      nodes: [
        makeNode('n1', 'entity', 'User'),
        makeNode('n2', 'entity', 'Project'),
      ],
      edges: [],
    };
    const change: GraphChange = {
      type: 'add_edge',
      edge: { id: 'e1', srcId: 'n1', dstId: 'n2', type: 'has' },
    };
    const result = validateChange(change, graph);
    expect(result.errors.filter((e) => e.ruleId === 'edge-references-valid')).toHaveLength(0);
  });

  it('validates add_edge with invalid source', () => {
    const graph: Graph = {
      nodes: [makeNode('n2', 'entity', 'Project')],
      edges: [],
    };
    const change: GraphChange = {
      type: 'add_edge',
      edge: { id: 'e1', srcId: 'nonexistent', dstId: 'n2', type: 'has' },
    };
    const result = validateChange(change, graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.ruleId === 'edge-references-valid')).toBe(true);
  });

  it('validates self-referencing edge', () => {
    const graph: Graph = {
      nodes: [makeNode('n1', 'entity', 'User')],
      edges: [],
    };
    const change: GraphChange = {
      type: 'add_edge',
      edge: { id: 'e1', srcId: 'n1', dstId: 'n1', type: 'references' },
    };
    const result = validateChange(change, graph);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.ruleId === 'no-self-reference')).toBe(true);
  });

  it('validates update_node', () => {
    const graph: Graph = {
      nodes: [makeNode('n1', 'name', 'My App')],
      edges: [],
    };
    const change: GraphChange = {
      type: 'update_node',
      node: { id: 'n1', title: 'Updated App' },
    };
    const result = validateChange(change, graph);
    // Update should not cause errors
    expect(result.errors.filter((e) => e.ruleId === 'no-duplicate-singular')).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('handles graph with only edges (invalid but should not crash)', () => {
    const graph: Graph = {
      nodes: [],
      edges: [makeEdge('e1', 'n1', 'n2', 'has')],
    };
    const result = validateGraph(graph);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('handles nodes with empty strings', () => {
    const graph: Graph = {
      nodes: [makeNode('n1', 'entity', '', '')],
      edges: [],
    };
    const result = validateGraph(graph);
    // Should not crash, may have warnings
    expect(typeof result.valid).toBe('boolean');
  });

  it('handles large graph without issues', () => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Create 100 nodes
    for (let i = 0; i < 100; i++) {
      nodes.push(makeNode(`n${i}`, 'entity', `Entity ${i}`, `Description for entity ${i}`));
    }

    // Create chain of edges
    for (let i = 0; i < 99; i++) {
      edges.push(makeEdge(`e${i}`, `n${i}`, `n${i + 1}`, 'references'));
    }

    const graph: Graph = { nodes, edges };
    const result = validateGraph(graph);
    // Should complete without timeout
    expect(typeof result.valid).toBe('boolean');
  });
});
