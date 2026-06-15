/**
 * Tests for the input processor - intent classification, entity resolution, and change planning.
 * These are pure functions that don't require database access.
 */

import { describe, it, expect } from 'vitest';
import {
  buildGraphSummary,
  classifyIntentHeuristic,
  searchNodes,
  resolveEntities,
  planChanges,
  validateChanges,
  buildExecutionSummary,
  type GraphSummary,
  type Intent,
  type ResolvedEntities,
  type PlanContext,
  type ChangePlan,
} from '../src/engine/input-processor.js';
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
// buildGraphSummary
// ─────────────────────────────────────────────────────────────────────────────

describe('buildGraphSummary', () => {
  it('returns correct counts for empty graph', () => {
    const summary = buildGraphSummary([], []);
    expect(summary.nodeCount).toBe(0);
    expect(summary.edgeCount).toBe(0);
    expect(summary.orphanCount).toBe(0);
    expect(summary.recentNodes).toHaveLength(0);
  });

  it('counts nodes by kind', () => {
    const nodes = [
      makeNode('e1', 'entity', 'User'),
      makeNode('e2', 'entity', 'Project'),
      makeNode('p1', 'persona', 'Admin'),
    ];
    const summary = buildGraphSummary(nodes, []);
    expect(summary.nodesByKind['entity']).toBe(2);
    expect(summary.nodesByKind['persona']).toBe(1);
  });

  it('counts nodes by space', () => {
    const nodes = [
      makeNode('n1', 'name', 'My App'),
      makeNode('p1', 'purpose', 'To help'),
      makeNode('e1', 'entity', 'User'),
      makeNode('uc1', 'usecase', 'Login'),
    ];
    const summary = buildGraphSummary(nodes, []);
    expect(summary.nodesBySpace['basics']).toBe(2);
    expect(summary.nodesBySpace['problem']).toBe(1);
    expect(summary.nodesBySpace['solution']).toBe(1);
  });

  it('correctly identifies orphan nodes (excluding name/purpose)', () => {
    const nodes = [
      makeNode('n1', 'name', 'My App'),
      makeNode('e1', 'entity', 'User'),
      makeNode('e2', 'entity', 'Project'),
    ];
    const edges = [makeEdge('edge1', 'e1', 'e2', 'has')];
    const summary = buildGraphSummary(nodes, edges);
    // name is excluded, e1 and e2 are connected, so orphan count is 0
    expect(summary.orphanCount).toBe(0);
  });

  it('identifies disconnected entities as orphans', () => {
    const nodes = [
      makeNode('e1', 'entity', 'User'),
      makeNode('e2', 'entity', 'Project'),
      makeNode('e3', 'entity', 'Orphan'),
    ];
    const edges = [makeEdge('edge1', 'e1', 'e2', 'has')];
    const summary = buildGraphSummary(nodes, edges);
    expect(summary.orphanCount).toBe(1);
  });

  it('returns recent nodes sorted by updatedAt', () => {
    const now = Date.now();
    const nodes: Node[] = [
      { ...makeNode('e1', 'entity', 'Old'), updatedAt: now - 1000 },
      { ...makeNode('e2', 'entity', 'Recent'), updatedAt: now },
      { ...makeNode('e3', 'entity', 'Middle'), updatedAt: now - 500 },
    ];
    const summary = buildGraphSummary(nodes, []);
    expect(summary.recentNodes[0].title).toBe('Recent');
    expect(summary.recentNodes[1].title).toBe('Middle');
    expect(summary.recentNodes[2].title).toBe('Old');
  });

  it('limits recent nodes to 5', () => {
    const nodes: Node[] = [];
    for (let i = 0; i < 10; i++) {
      nodes.push(makeNode(`n${i}`, 'entity', `Node ${i}`));
    }
    const summary = buildGraphSummary(nodes, []);
    expect(summary.recentNodes).toHaveLength(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// classifyIntentHeuristic
// ─────────────────────────────────────────────────────────────────────────────

describe('classifyIntentHeuristic', () => {
  const emptySummary: GraphSummary = {
    nodeCount: 0,
    edgeCount: 0,
    nodesByKind: {},
    nodesBySpace: {},
    recentNodes: [],
    orphanCount: 0,
  };

  describe('question detection', () => {
    it('detects questions starting with question words', () => {
      expect(classifyIntentHeuristic('What is a user?', emptySummary).intent).toBe('question');
      expect(classifyIntentHeuristic('How does login work?', emptySummary).intent).toBe('question');
      expect(classifyIntentHeuristic('Why do we need this?', emptySummary).intent).toBe('question');
      expect(classifyIntentHeuristic('Can users delete their account?', emptySummary).intent).toBe('question');
    });

    it('detects questions ending with ?', () => {
      expect(classifyIntentHeuristic('The user can login?', emptySummary).intent).toBe('question');
      expect(classifyIntentHeuristic('Is this correct?', emptySummary).intent).toBe('question');
    });

    it('extracts quoted entities from questions', () => {
      const result = classifyIntentHeuristic('What is a "User" entity?', emptySummary);
      expect(result.entities).toContain('User');
    });
  });

  describe('delete detection', () => {
    it('detects delete intent', () => {
      expect(classifyIntentHeuristic('Delete the user entity', emptySummary).intent).toBe('delete');
      expect(classifyIntentHeuristic('Remove the login flow', emptySummary).intent).toBe('delete');
      expect(classifyIntentHeuristic('Get rid of the old persona', emptySummary).intent).toBe('delete');
    });

    it('detects negative need patterns', () => {
      expect(classifyIntentHeuristic("We don't need the admin persona", emptySummary).intent).toBe('delete');
    });
  });

  describe('update detection', () => {
    it('detects update intent', () => {
      expect(classifyIntentHeuristic('Change the user description', emptySummary).intent).toBe('update');
      expect(classifyIntentHeuristic('Modify the login flow', emptySummary).intent).toBe('update');
      expect(classifyIntentHeuristic('Update the entity', emptySummary).intent).toBe('update');
    });

    it('detects correction patterns', () => {
      expect(classifyIntentHeuristic('Actually it should be different', emptySummary).intent).toBe('update');
      expect(classifyIntentHeuristic('It should have a name field', emptySummary).intent).toBe('update');
    });
  });

  describe('clarify detection', () => {
    it('detects clarification requests', () => {
      // Note: Questions starting with "Can/What/etc" trigger question pattern first
      // Clarify pattern works when the keyword appears without a leading question word
      expect(classifyIntentHeuristic('Please clarify the flow', emptySummary).intent).toBe('clarify');
      expect(classifyIntentHeuristic('I need you to elaborate on the user entity', emptySummary).intent).toBe('clarify');
      expect(classifyIntentHeuristic('Specifically what data does user store', emptySummary).intent).toBe('clarify');
    });
  });

  describe('refine detection', () => {
    it('detects refinement intent', () => {
      expect(classifyIntentHeuristic('Also add email to the user', emptySummary).intent).toBe('refine');
      // Note: "And" at word boundary triggers refine
      expect(classifyIntentHeuristic('Additionally, we need a phone field', emptySummary).intent).toBe('refine');
      // "More info/detail/information/specifics" pattern
      expect(classifyIntentHeuristic('More info on the user roles', emptySummary).intent).toBe('refine');
    });
  });

  describe('add detection (default)', () => {
    it('defaults to add for new information', () => {
      // Messages without any trigger patterns default to add
      // Avoiding "and" which triggers refine, avoiding question starters
      expect(classifyIntentHeuristic('The system has users', emptySummary).intent).toBe('add');
      expect(classifyIntentHeuristic('Users exist in the system', emptySummary).intent).toBe('add');
      expect(classifyIntentHeuristic('We need to support projects', emptySummary).intent).toBe('add');
    });
  });

  describe('entity extraction', () => {
    it('extracts multiple quoted entities', () => {
      const result = classifyIntentHeuristic('The "User" can create a "Project"', emptySummary);
      expect(result.entities).toContain('User');
      expect(result.entities).toContain('Project');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// searchNodes
// ─────────────────────────────────────────────────────────────────────────────

describe('searchNodes', () => {
  const testNodes: Node[] = [
    makeNode('u1', 'entity', 'User', 'A person who uses the system'),
    makeNode('p1', 'entity', 'Project', 'A collection of tasks'),
    makeNode('t1', 'entity', 'Task', 'Something a user does'),
    makeNode('a1', 'persona', 'Admin', 'System administrator'),
  ];

  it('finds exact title matches with highest score', () => {
    const results = searchNodes('User', testNodes);
    expect(results[0].node.id).toBe('u1');
    expect(results[0].score).toBe(1.0);
  });

  it('finds partial title matches', () => {
    const results = searchNodes('proj', testNodes);
    expect(results[0].node.id).toBe('p1');
    expect(results[0].score).toBe(0.8);
  });

  it('finds description matches', () => {
    const results = searchNodes('collection', testNodes);
    expect(results[0].node.id).toBe('p1');
    expect(results[0].score).toBe(0.5);
  });

  it('finds kind matches', () => {
    const results = searchNodes('persona', testNodes);
    expect(results.some((r) => r.node.id === 'a1')).toBe(true);
  });

  it('respects limit option', () => {
    const results = searchNodes('a', testNodes, { limit: 2 });
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it('filters by kind when specified', () => {
    const results = searchNodes('user', testNodes, { kindFilter: 'entity' });
    expect(results.every((r) => r.node.kind === 'entity')).toBe(true);
  });

  it('returns empty array for no matches', () => {
    const results = searchNodes('nonexistent', testNodes);
    expect(results).toHaveLength(0);
  });

  it('is case insensitive', () => {
    const results = searchNodes('USER', testNodes);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].node.title).toBe('User');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveEntities
// ─────────────────────────────────────────────────────────────────────────────

describe('resolveEntities', () => {
  const testNodes: Node[] = [
    makeNode('u1', 'entity', 'User', 'A person'),
    makeNode('p1', 'entity', 'Project', 'A project'),
  ];

  it('resolves exact matches as existing', () => {
    const result = resolveEntities(['User'], testNodes);
    expect(result.existingMatches).toHaveLength(1);
    expect(result.existingMatches[0].matchedNode.id).toBe('u1');
    expect(result.existingMatches[0].matchType).toBe('exact');
  });

  it('resolves fuzzy matches', () => {
    // Partial title match should be fuzzy (score 0.8)
    // "usr" would match "User" via description or partial title
    const result = resolveEntities(['person'], testNodes);
    // "person" appears in User's description "A person who uses the system"
    expect(result.existingMatches.length).toBeGreaterThan(0);
    // Description match gives score 0.5, which results in fuzzy match type
    expect(result.existingMatches[0].matchType).toBe('fuzzy');
  });

  it('marks unknown entities as new', () => {
    const result = resolveEntities(['Unknown'], testNodes);
    expect(result.newEntities).toContain('Unknown');
    expect(result.existingMatches).toHaveLength(0);
  });

  it('handles mixed known and unknown entities', () => {
    const result = resolveEntities(['User', 'Unknown', 'Project'], testNodes);
    expect(result.existingMatches.length).toBeGreaterThan(0);
    expect(result.newEntities).toContain('Unknown');
  });

  it('handles empty entities array', () => {
    const result = resolveEntities([], testNodes);
    expect(result.newEntities).toHaveLength(0);
    expect(result.existingMatches).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// planChanges
// ─────────────────────────────────────────────────────────────────────────────

describe('planChanges', () => {
  const testNodes: Node[] = [
    makeNode('u1', 'entity', 'User', 'A person'),
  ];

  it('plans add_node for new entities on add intent', () => {
    const context: PlanContext = {
      intent: 'add',
      resolvedEntities: { newEntities: ['Project'], existingMatches: [] },
      relevantNodes: testNodes,
      message: 'Add a Project entity',
    };
    const plan = planChanges(context);
    expect(plan.changes.some((c) => c.action === 'add_node')).toBe(true);
    expect(plan.changes.find((c) => c.action === 'add_node')?.params.title).toBe('Project');
  });

  it('plans update_node for matched entities on update intent', () => {
    const context: PlanContext = {
      intent: 'update',
      resolvedEntities: {
        newEntities: [],
        existingMatches: [
          { entity: 'User', matchedNode: testNodes[0], confidence: 1.0, matchType: 'exact' },
        ],
      },
      relevantNodes: testNodes,
      message: 'Update the User description',
    };
    const plan = planChanges(context);
    expect(plan.changes.some((c) => c.action === 'update_node')).toBe(true);
    expect(plan.changes.find((c) => c.action === 'update_node')?.params.id).toBe('u1');
  });

  it('plans delete_node for high-confidence matches on delete intent', () => {
    const context: PlanContext = {
      intent: 'delete',
      resolvedEntities: {
        newEntities: [],
        existingMatches: [
          { entity: 'User', matchedNode: testNodes[0], confidence: 0.9, matchType: 'exact' },
        ],
      },
      relevantNodes: testNodes,
      message: 'Delete the User',
    };
    const plan = planChanges(context);
    expect(plan.changes.some((c) => c.action === 'delete_node')).toBe(true);
  });

  it('does not plan delete for low-confidence matches', () => {
    const context: PlanContext = {
      intent: 'delete',
      resolvedEntities: {
        newEntities: [],
        existingMatches: [
          { entity: 'usr', matchedNode: testNodes[0], confidence: 0.5, matchType: 'fuzzy' },
        ],
      },
      relevantNodes: testNodes,
      message: 'Delete the usr',
    };
    const plan = planChanges(context);
    expect(plan.changes.filter((c) => c.action === 'delete_node')).toHaveLength(0);
  });

  it('plans update_node with source on refine intent', () => {
    const context: PlanContext = {
      intent: 'refine',
      resolvedEntities: {
        newEntities: [],
        existingMatches: [
          { entity: 'User', matchedNode: testNodes[0], confidence: 1.0, matchType: 'exact' },
        ],
      },
      relevantNodes: testNodes,
      message: 'The User also has an email address',
    };
    const plan = planChanges(context);
    expect(plan.changes.some((c) => c.action === 'update_node')).toBe(true);
  });

  it('returns empty changes for question intent', () => {
    const context: PlanContext = {
      intent: 'question',
      resolvedEntities: {
        newEntities: [],
        existingMatches: [
          { entity: 'User', matchedNode: testNodes[0], confidence: 1.0, matchType: 'exact' },
        ],
      },
      relevantNodes: testNodes,
      message: 'What is a User?',
    };
    const plan = planChanges(context);
    expect(plan.changes).toHaveLength(0);
  });

  it('returns empty changes for clarify intent', () => {
    const context: PlanContext = {
      intent: 'clarify',
      resolvedEntities: { newEntities: [], existingMatches: [] },
      relevantNodes: testNodes,
      message: 'What do you mean by that?',
    };
    const plan = planChanges(context);
    expect(plan.changes).toHaveLength(0);
  });

  it('provides a summary', () => {
    const context: PlanContext = {
      intent: 'add',
      resolvedEntities: { newEntities: ['Project', 'Task'], existingMatches: [] },
      relevantNodes: testNodes,
      message: 'Add Project and Task',
    };
    const plan = planChanges(context);
    expect(plan.summary).toContain('2');
    expect(plan.summary).toContain('add_node');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// validateChanges
// ─────────────────────────────────────────────────────────────────────────────

describe('validateChanges', () => {
  const testNodes: Node[] = [
    makeNode('u1', 'entity', 'User', 'A person'),
  ];
  const testEdges: Edge[] = [];

  it('errors on add_node without title', () => {
    const plan: ChangePlan = {
      changes: [{ action: 'add_node', params: {}, reason: 'test' }],
      summary: 'test',
    };
    const result = validateChanges(plan, testNodes, testEdges);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_TITLE')).toBe(true);
  });

  it('warns on duplicate title', () => {
    const plan: ChangePlan = {
      changes: [{ action: 'add_node', params: { title: 'User' }, reason: 'test' }],
      summary: 'test',
    };
    const result = validateChanges(plan, testNodes, testEdges);
    expect(result.warnings.some((w) => w.code === 'DUPLICATE_TITLE')).toBe(true);
  });

  it('errors on update_node without id', () => {
    const plan: ChangePlan = {
      changes: [{ action: 'update_node', params: { title: 'New' }, reason: 'test' }],
      summary: 'test',
    };
    const result = validateChanges(plan, testNodes, testEdges);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_ID')).toBe(true);
  });

  it('errors on update_node with nonexistent id', () => {
    const plan: ChangePlan = {
      changes: [{ action: 'update_node', params: { id: 'nonexistent' }, reason: 'test' }],
      summary: 'test',
    };
    const result = validateChanges(plan, testNodes, testEdges);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'NODE_NOT_FOUND')).toBe(true);
  });

  it('errors on delete_node with nonexistent id', () => {
    const plan: ChangePlan = {
      changes: [{ action: 'delete_node', params: { id: 'nonexistent' }, reason: 'test' }],
      summary: 'test',
    };
    const result = validateChanges(plan, testNodes, testEdges);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'NODE_NOT_FOUND')).toBe(true);
  });

  it('warns when deleting node would orphan edges', () => {
    const edges = [makeEdge('e1', 'u1', 'other', 'has')];
    const plan: ChangePlan = {
      changes: [{ action: 'delete_node', params: { id: 'u1' }, reason: 'test' }],
      summary: 'test',
    };
    const result = validateChanges(plan, testNodes, edges);
    expect(result.warnings.some((w) => w.code === 'ORPHAN_EDGES')).toBe(true);
  });

  it('errors on add_edge without srcId or dstId', () => {
    const plan: ChangePlan = {
      changes: [{ action: 'add_edge', params: { srcId: 'u1' }, reason: 'test' }],
      summary: 'test',
    };
    const result = validateChanges(plan, testNodes, testEdges);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'MISSING_EDGE_IDS')).toBe(true);
  });

  it('errors on add_edge with nonexistent source', () => {
    const plan: ChangePlan = {
      changes: [{ action: 'add_edge', params: { srcId: 'ghost', dstId: 'u1' }, reason: 'test' }],
      summary: 'test',
    };
    const result = validateChanges(plan, testNodes, testEdges);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'SRC_NODE_NOT_FOUND')).toBe(true);
  });

  it('warns on self-loop edge', () => {
    const plan: ChangePlan = {
      changes: [{ action: 'add_edge', params: { srcId: 'u1', dstId: 'u1' }, reason: 'test' }],
      summary: 'test',
    };
    const result = validateChanges(plan, testNodes, testEdges);
    expect(result.warnings.some((w) => w.code === 'SELF_LOOP')).toBe(true);
  });

  it('errors on delete_edge with nonexistent edge', () => {
    const plan: ChangePlan = {
      changes: [{ action: 'delete_edge', params: { id: 'nonexistent' }, reason: 'test' }],
      summary: 'test',
    };
    const result = validateChanges(plan, testNodes, testEdges);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'EDGE_NOT_FOUND')).toBe(true);
  });

  it('errors on updating a node scheduled for deletion', () => {
    const plan: ChangePlan = {
      changes: [
        { action: 'delete_node', params: { id: 'u1' }, reason: 'delete' },
        { action: 'update_node', params: { id: 'u1', title: 'New' }, reason: 'update' },
      ],
      summary: 'test',
    };
    const result = validateChanges(plan, testNodes, testEdges);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'UPDATE_DELETED_NODE')).toBe(true);
  });

  it('passes valid changes', () => {
    const nodes = [
      makeNode('u1', 'entity', 'User', 'A person'),
      makeNode('p1', 'entity', 'Project', 'A project'),
    ];
    const plan: ChangePlan = {
      changes: [
        { action: 'add_node', params: { title: 'Task' }, reason: 'add task' },
        { action: 'update_node', params: { id: 'u1', title: 'User Updated' }, reason: 'update' },
      ],
      summary: 'test',
    };
    const result = validateChanges(plan, nodes, testEdges);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildExecutionSummary
// ─────────────────────────────────────────────────────────────────────────────

describe('buildExecutionSummary', () => {
  it('reports created nodes', () => {
    const plan: ChangePlan = {
      changes: [{ action: 'add_node', params: { title: 'Test' }, reason: 'test' }],
      summary: 'test',
    };
    const result = buildExecutionSummary(plan, ['n1'], [], []);
    expect(result.success).toBe(true);
    expect(result.createdNodeIds).toContain('n1');
    expect(result.summary).toContain('1 node(s) created');
  });

  it('reports created edges', () => {
    const plan: ChangePlan = {
      changes: [{ action: 'add_edge', params: { srcId: 'a', dstId: 'b' }, reason: 'test' }],
      summary: 'test',
    };
    const result = buildExecutionSummary(plan, [], ['e1'], []);
    expect(result.success).toBe(true);
    expect(result.createdEdgeIds).toContain('e1');
    expect(result.summary).toContain('1 edge(s) created');
  });

  it('reports updates', () => {
    const plan: ChangePlan = {
      changes: [{ action: 'update_node', params: { id: 'n1' }, reason: 'test' }],
      summary: 'test',
    };
    const result = buildExecutionSummary(plan, [], [], []);
    expect(result.summary).toContain('1 node(s) updated');
  });

  it('reports deletions', () => {
    const plan: ChangePlan = {
      changes: [{ action: 'delete_node', params: { id: 'n1' }, reason: 'test' }],
      summary: 'test',
    };
    const result = buildExecutionSummary(plan, [], [], []);
    expect(result.summary).toContain('1 item(s) deleted');
  });

  it('reports errors', () => {
    const plan: ChangePlan = {
      changes: [{ action: 'add_node', params: { title: 'Test' }, reason: 'test' }],
      summary: 'test',
    };
    const result = buildExecutionSummary(plan, [], [], ['Some error']);
    expect(result.success).toBe(false);
    expect(result.errors).toContain('Some error');
    expect(result.summary).toContain('1 error(s)');
  });

  it('handles empty plan', () => {
    const plan: ChangePlan = { changes: [], summary: 'test' };
    const result = buildExecutionSummary(plan, [], [], []);
    expect(result.success).toBe(true);
    expect(result.summary).toBe('No changes applied');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Edge Cases
// ─────────────────────────────────────────────────────────────────────────────

describe('Edge Cases', () => {
  it('handles empty message in intent classification', () => {
    const summary: GraphSummary = {
      nodeCount: 0,
      edgeCount: 0,
      nodesByKind: {},
      nodesBySpace: {},
      recentNodes: [],
      orphanCount: 0,
    };
    const result = classifyIntentHeuristic('', summary);
    expect(result.intent).toBe('add'); // defaults to add
    expect(result.confidence).toBeLessThan(1);
  });

  it('handles special characters in search', () => {
    const nodes = [makeNode('n1', 'entity', 'User (Admin)', 'Test')];
    const results = searchNodes('(Admin)', nodes);
    expect(results.length).toBeGreaterThan(0);
  });

  it('handles unicode in titles', () => {
    const nodes = [makeNode('n1', 'entity', 'Usuario', 'Spanish for user')];
    const results = searchNodes('Usuario', nodes);
    expect(results).toHaveLength(1);
  });

  it('handles very long messages', () => {
    const longMessage = 'test '.repeat(1000);
    const summary: GraphSummary = {
      nodeCount: 0,
      edgeCount: 0,
      nodesByKind: {},
      nodesBySpace: {},
      recentNodes: [],
      orphanCount: 0,
    };
    const result = classifyIntentHeuristic(longMessage, summary);
    expect(typeof result.intent).toBe('string');
  });
});
