import { describe, expect, it } from 'vitest';
import {
  runQuery,
  validateQuery,
  whyChain,
  realization,
  evidence,
  neighborhood,
  contextMarkdown,
  type GraphQuery,
} from '../../src/lib/query';
import type { Graph } from '../../src/lib/schema';

// Frozen fixture: a self-contained graph reproducing the structure these query
// assertions depend on. Decoupled from src/lib/sample.ts so the rich-sample
// swap (Task 3) cannot break query-engine tests.
const FIXTURE: Graph = {
  nodes: [
    { id: 'name-bropilot', kind: 'name', title: 'Bropilot Studio', description: 'A studio for collecting and visualising the knowledge graph of a system.', props: {} },
    { id: 'purpose-shared-understanding', kind: 'purpose', title: 'Shared understanding, codified', description: 'Capture the why, the what and the how of a system in one navigable graph.', props: {} },
    { id: 'capability-collect', kind: 'capability', title: 'Guided collection', description: 'Structured forms walk you through every kind of knowledge a system has.', props: {} },
    { id: 'capability-visualise', kind: 'capability', title: 'Live graph view', description: 'See the whole system as an explorable node-link graph.', props: {} },
    { id: 'capability-portable', kind: 'capability', title: 'Portable spec', description: 'Import / export the Bropilot JSON schema.', props: {} },
    { id: 'persona-architect', kind: 'persona', title: 'System architect', description: 'Owns the shape of the system and keeps the graph honest.', props: { role: 'Designs and curates the knowledge graph' } },
    { id: 'persona-builder', kind: 'persona', title: 'Builder', description: 'Turns the graph into running code.', props: { role: 'Implements modules from the domain' } },
    { id: 'requirement-three-parts', kind: 'requirement', title: 'Three-part model', description: 'Foundations, Domain and Implementation must each be first-class.', props: { priority: 'must' } },
    { id: 'requirement-traceable', kind: 'requirement', title: 'Code traceability', description: 'Every implementation node links to where its code lives.', props: { priority: 'should' } },
    { id: 'usecase-onboard', kind: 'usecase', title: 'Onboard onto a system', description: 'A newcomer reads the graph to understand a system fast.', props: { situation: 'A new engineer joins.' } },
    { id: 'constraint-client-only', kind: 'constraint', title: 'No backend required', description: 'Runs entirely in the browser.', props: { invariant: 'The graph is always usable offline.' } },
    { id: 'goal-faster-alignment', kind: 'goal', title: 'Faster alignment', description: 'Cut the time a team spends arguing about what the system is.', props: { metric: 'Onboarding time trends down.' } },
    { id: 'hypothesis-graph-beats-docs', kind: 'hypothesis', title: 'A graph beats a doc', description: 'A linked graph is retained better than prose docs.', props: { belief: 'People reason about systems as connected things.', validation: 'Users navigate edges more than they read.' } },
    { id: 'term-space', kind: 'term', title: 'Space', description: 'One of four semantic groupings.', props: { aka: ['concern'] } },
    { id: 'entity-node', kind: 'entity', title: 'Node', description: 'A unit of knowledge with a kind, title and description.', props: { attributes: ['id', 'kind', 'title'] } },
    { id: 'entity-edge', kind: 'entity', title: 'Edge', description: 'A typed, directed relationship between two nodes.', props: { attributes: ['id', 'srcId', 'dstId', 'type'] } },
    { id: 'relationship-node-edge', kind: 'relationship', title: 'Nodes connect via Edges', description: 'Edges link a source node to a destination node.', props: { cardinality: 'many-to-many' } },
    { id: 'behaviour-autosave', kind: 'behaviour', title: 'Autosave', description: 'Any change to the graph is persisted to localStorage immediately.', props: {} },
    { id: 'flow-collect', kind: 'flow', title: 'Collect a system', description: 'Walk the three parts and fill in what you know.', props: { steps: ['Name & purpose', 'Domain objects'] } },
    { id: 'screen-studio', kind: 'screen', title: 'Studio', description: 'The single-page workspace hosting all views.', props: {} },
    { id: 'module-store', kind: 'module', title: 'Graph store', description: 'Reactive state + persistence + import/export.', props: { path: 'web/src/lib/store.ts', repo: '' } },
    { id: 'module-schema', kind: 'module', title: 'Schema', description: 'Kind registry, parts, spaces and field defs.', props: { path: 'web/src/lib/schema.ts', repo: '' } },
    { id: 'component-force-graph', kind: 'component', title: 'ForceGraph', description: 'd3-force layout rendered as interactive SVG.', props: { path: 'web/src/components/graph/ForceGraph.vue', repo: '' } },
    { id: 'component-node-form', kind: 'component', title: 'NodeForm', description: "Dynamic editor generated from a kind's field defs.", props: { path: 'web/src/components/form/NodeForm.vue', repo: '' } },
    { id: 'interface-graph', kind: 'interface', title: 'Graph', description: 'The serialisable shape: { nodes, edges }.', props: { signature: 'interface Graph { nodes: GraphNode[]; edges: GraphEdge[] }' } },
    { id: 'external-d3', kind: 'external', title: 'd3-force', description: 'Physics simulation for graph layout.', props: { url: 'https://github.com/d3/d3-force' } },
    { id: 'design-glass', kind: 'design', title: 'Glass dark theme', description: 'Translucent panels, per-space accent glows.', props: {} },
  ],
  edges: [
    { id: 'e-1', srcId: 'name-bropilot', dstId: 'capability-collect', type: 'has' },
    { id: 'e-2', srcId: 'name-bropilot', dstId: 'capability-visualise', type: 'has' },
    { id: 'e-3', srcId: 'name-bropilot', dstId: 'capability-portable', type: 'has' },
    { id: 'e-4', srcId: 'capability-collect', dstId: 'requirement-three-parts', type: 'satisfies' },
    { id: 'e-5', srcId: 'persona-architect', dstId: 'usecase-onboard', type: 'triggers' },
    { id: 'e-6', srcId: 'usecase-onboard', dstId: 'screen-studio', type: 'uses' },
    { id: 'e-7', srcId: 'requirement-traceable', dstId: 'module-store', type: 'constrains' },
    { id: 'e-8', srcId: 'relationship-node-edge', dstId: 'entity-node', type: 'references' },
    { id: 'e-9', srcId: 'relationship-node-edge', dstId: 'entity-edge', type: 'references' },
    { id: 'e-10', srcId: 'screen-studio', dstId: 'component-force-graph', type: 'contains' },
    { id: 'e-11', srcId: 'screen-studio', dstId: 'component-node-form', type: 'contains' },
    { id: 'e-12', srcId: 'component-force-graph', dstId: 'external-d3', type: 'uses' },
    { id: 'e-13', srcId: 'component-force-graph', dstId: 'entity-node', type: 'uses' },
    { id: 'e-14', srcId: 'module-store', dstId: 'behaviour-autosave', type: 'implements' },
    { id: 'e-15', srcId: 'module-store', dstId: 'interface-graph', type: 'uses' },
    { id: 'e-16', srcId: 'module-schema', dstId: 'term-space', type: 'implements' },
    { id: 'e-17', srcId: 'flow-collect', dstId: 'screen-studio', type: 'uses' },
    { id: 'e-18', srcId: 'screen-studio', dstId: 'design-glass', type: 'uses' },
    { id: 'e-19', srcId: 'name-bropilot', dstId: 'purpose-shared-understanding', type: 'has' },
    { id: 'e-20', srcId: 'purpose-shared-understanding', dstId: 'goal-faster-alignment', type: 'motivates' },
    { id: 'e-21', srcId: 'hypothesis-graph-beats-docs', dstId: 'goal-faster-alignment', type: 'motivates' },
    { id: 'e-22', srcId: 'hypothesis-graph-beats-docs', dstId: 'capability-visualise', type: 'motivates' },
    { id: 'e-23', srcId: 'goal-faster-alignment', dstId: 'usecase-onboard', type: 'motivates' },
    { id: 'e-24', srcId: 'persona-architect', dstId: 'capability-collect', type: 'uses' },
    { id: 'e-25', srcId: 'persona-builder', dstId: 'capability-portable', type: 'uses' },
    { id: 'e-26', srcId: 'usecase-onboard', dstId: 'capability-visualise', type: 'uses' },
    { id: 'e-27', srcId: 'flow-collect', dstId: 'capability-collect', type: 'uses' },
    { id: 'e-28', srcId: 'component-force-graph', dstId: 'capability-visualise', type: 'implements' },
    { id: 'e-29', srcId: 'module-store', dstId: 'capability-portable', type: 'implements' },
    { id: 'e-30', srcId: 'constraint-client-only', dstId: 'module-store', type: 'constrains' },
    { id: 'e-31', srcId: 'interface-graph', dstId: 'entity-node', type: 'references' },
    { id: 'e-32', srcId: 'interface-graph', dstId: 'entity-edge', type: 'references' },
    { id: 'e-33', srcId: 'module-store', dstId: 'module-schema', type: 'depends_on' },
    { id: 'e-34', srcId: 'component-node-form', dstId: 'module-schema', type: 'uses' },
    { id: 'e-35', srcId: 'purpose-shared-understanding', dstId: 'persona-architect', type: 'serves' },
    { id: 'e-36', srcId: 'purpose-shared-understanding', dstId: 'persona-builder', type: 'serves' },
    { id: 'e-37', srcId: 'purpose-shared-understanding', dstId: 'hypothesis-graph-beats-docs', type: 'depends_on' },
    { id: 'e-38', srcId: 'persona-architect', dstId: 'flow-collect', type: 'triggers' },
    { id: 'e-39', srcId: 'screen-studio', dstId: 'module-store', type: 'uses' },
    { id: 'e-40', srcId: 'capability-portable', dstId: 'constraint-client-only', type: 'depends_on' },
    { id: 'e-41', srcId: 'persona-builder', dstId: 'requirement-traceable', type: 'motivates' },
    { id: 'e-42', srcId: 'entity-node', dstId: 'relationship-node-edge', type: 'has' },
  ],
};

describe('runQuery: basic-graph-pattern joins', () => {
  it('resolves a single typed pattern to the matching (src, dst) pairs', () => {
    const q: GraphQuery = {
      match: [{ s: { var: 'p', kind: 'persona' }, p: 'uses', o: { var: 'c', kind: 'capability' } }],
      select: ['p', 'c'],
    };
    const rows = runQuery(FIXTURE, q).map((r) => [r.p.id, r.c.id]);
    expect(rows.sort()).toEqual(
      [
        ['persona-architect', 'capability-collect'],
        ['persona-builder', 'capability-portable'],
      ].sort(),
    );
  });

  it('joins across two patterns sharing a variable', () => {
    // persona --uses--> capability --satisfies--> requirement
    const q: GraphQuery = {
      match: [
        { s: { var: 'p', kind: 'persona' }, p: 'uses', o: { var: 'c' } },
        { s: { var: 'c' }, p: 'satisfies', o: { var: 'r', kind: 'requirement' } },
      ],
      select: ['p', 'r'],
    };
    const rows = runQuery(FIXTURE, q).map((r) => [r.p.id, r.r.id]);
    expect(rows).toEqual([['persona-architect', 'requirement-three-parts']]);
  });

  it('an unsatisfiable join yields no rows', () => {
    const q: GraphQuery = {
      match: [
        { s: { var: 'p', kind: 'persona' }, p: 'uses', o: { var: 'c' } },
        { s: { var: 'c' }, p: 'verifies', o: { var: 'x' } },
      ],
      select: ['p'],
    };
    expect(runQuery(FIXTURE, q)).toEqual([]);
  });

  it('respects the id-pinned form of a NodeRef', () => {
    const q: GraphQuery = {
      match: [{ s: { id: 'name-bropilot' }, p: 'has', o: { var: 'x' } }],
      select: ['x'],
    };
    const rows = runQuery(FIXTURE, q).map((r) => r.x.id).sort();
    expect(rows).toEqual(['capability-collect', 'capability-portable', 'capability-visualise', 'purpose-shared-understanding'].sort());
  });

  it('respects a limit', () => {
    const q: GraphQuery = { match: [{ s: { id: 'name-bropilot' }, p: 'has', o: { var: 'x' } }], select: ['x'], limit: 2 };
    expect(runQuery(FIXTURE, q)).toHaveLength(2);
  });
});

describe('runQuery: same-variable equality', () => {
  it('a pattern reusing the same var for s and o requires sid === oid, and no self-loop exists', () => {
    const q: GraphQuery = { match: [{ s: { var: 'x' }, p: 'has', o: { var: 'x' } }], select: ['x'] };
    expect(runQuery(FIXTURE, q)).toEqual([]);
  });

  it('a fabricated self-loop DOES satisfy the same-var pattern', () => {
    const g: Graph = {
      nodes: [{ id: 'a', kind: 'module', title: 'A', description: '' }],
      edges: [{ id: 'e1', srcId: 'a', dstId: 'a', type: 'depends_on' }],
    };
    const q: GraphQuery = { match: [{ s: { var: 'x' }, p: 'depends_on', o: { var: 'x' } }], select: ['x'] };
    expect(runQuery(g, q).map((r) => r.x.id)).toEqual(['a']);
  });
});

describe('runQuery: not-pattern placement independence', () => {
  it('produces the same bindings whether the not-pattern is listed first or last', () => {
    const positive = { s: { var: 'p', kind: 'persona' }, p: 'uses', o: { var: 'c', kind: 'capability' } };
    const negative = { s: { var: 'p' }, p: 'triggers', o: { var: 'z' }, not: true };
    const qFirst: GraphQuery = { match: [negative, positive], select: ['p', 'c'] };
    const qLast: GraphQuery = { match: [positive, negative], select: ['p', 'c'] };
    const resultFirst = runQuery(FIXTURE, qFirst);
    const resultLast = runQuery(FIXTURE, qLast);
    expect(resultFirst).toEqual(resultLast);
    // sanity: the negative pattern actually excludes persona-architect, who triggers usecase-onboard
    expect(resultLast.map((r) => r.p.id)).toEqual(['persona-builder']);
  });

  it('a not-pattern with no matches for a binding keeps that binding (per underlying binding, not per selected var)', () => {
    // persona-architect triggers two things (usecase-onboard, flow-collect) and monitors
    // nothing, so both of its internal (p, x) bindings survive the not-pattern; since `x`
    // isn't selected, this surfaces as the SAME row twice — dedup runs on the full binding,
    // not on the projected select columns.
    const q: GraphQuery = {
      match: [
        { s: { var: 'p', kind: 'persona' }, p: 'triggers', o: { var: 'x' } },
        { s: { var: 'p' }, p: 'monitors', o: { var: 'y' }, not: true }, // no persona monitors anything
      ],
      select: ['p'],
    };
    const rows = runQuery(FIXTURE, q).map((r) => r.p.id);
    expect(rows).toEqual(['persona-architect', 'persona-architect']);
  });
});

describe('runQuery: ^ (inverse) and + (transitive) composition', () => {
  it('^ reverses match direction: s ^type o matches data edge o --type--> s', () => {
    const q: GraphQuery = { match: [{ s: { id: 'capability-collect' }, p: '^has', o: { var: 'x' } }], select: ['x'] };
    expect(runQuery(FIXTURE, q).map((r) => r.x.id)).toEqual(['name-bropilot']);
  });

  it('+ makes a single-hop relation reachable transitively (multi-hop chain)', () => {
    const g: Graph = {
      nodes: [
        { id: 'a', kind: 'module', title: 'A', description: '' },
        { id: 'b', kind: 'module', title: 'B', description: '' },
        { id: 'c', kind: 'module', title: 'C', description: '' },
      ],
      edges: [
        { id: 'e1', srcId: 'a', dstId: 'b', type: 'depends_on' },
        { id: 'e2', srcId: 'b', dstId: 'c', type: 'depends_on' },
      ],
    };
    const transitive = runQuery(g, { match: [{ s: { id: 'a' }, p: 'depends_on+', o: { var: 'x' } }], select: ['x'] });
    expect(transitive.map((r) => r.x.id).sort()).toEqual(['b', 'c']);
    const nonTransitive = runQuery(g, { match: [{ s: { id: 'a' }, p: 'depends_on', o: { var: 'x' } }], select: ['x'] });
    expect(nonTransitive.map((r) => r.x.id)).toEqual(['b']);
  });

  it('^ and + can compose: transitive inverse traversal', () => {
    const g: Graph = {
      nodes: [
        { id: 'a', kind: 'module', title: 'A', description: '' },
        { id: 'b', kind: 'module', title: 'B', description: '' },
        { id: 'c', kind: 'module', title: 'C', description: '' },
      ],
      edges: [
        { id: 'e1', srcId: 'a', dstId: 'b', type: 'depends_on' },
        { id: 'e2', srcId: 'b', dstId: 'c', type: 'depends_on' },
      ],
    };
    // "who transitively depends on c" == c ^depends_on+ x
    const q: GraphQuery = { match: [{ s: { id: 'c' }, p: '^depends_on+', o: { var: 'x' } }], select: ['x'] };
    expect(runQuery(g, q).map((r) => r.x.id).sort()).toEqual(['a', 'b']);
  });
});

describe('validateQuery: malformed shapes', () => {
  it('an empty match array is an error and short-circuits (no other errors reported)', () => {
    expect(validateQuery({ match: [], select: [] })).toEqual([
      { level: 'error', message: 'Query has no match patterns.' },
    ]);
  });

  it('a pattern missing s/p/o produces a "Malformed pattern at index N" error and does not throw', () => {
    const errs = validateQuery({ match: [{ foo: 1 } as any], select: [] });
    expect(errs).toEqual([{ level: 'error', message: 'Malformed pattern at index 0: expected { s, p, o }.' }]);
  });

  it('runQuery never throws on malformed match entries and simply returns no rows', () => {
    expect(() => runQuery(FIXTURE, { match: [null as any], select: [] })).not.toThrow();
    expect(runQuery(FIXTURE, { match: [null as any], select: [] })).toEqual([]);
    expect(() => runQuery(FIXTURE, {} as any)).not.toThrow();
  });

  it('an unknown edge type is an error naming the full list of valid types', () => {
    const errs = validateQuery({ match: [{ s: {}, p: 'nonsense', o: {} }], select: [] });
    expect(errs).toHaveLength(1);
    expect(errs[0].level).toBe('error');
    expect(errs[0].message).toContain('Unknown edge type "nonsense"');
    expect(errs[0].message).toContain('Valid:');
    expect(errs[0].message).toContain('has');
    expect(errs[0].message).toContain('motivates');
  });

  it('an unknown kind is an error naming the full list of valid kinds', () => {
    const errs = validateQuery({ match: [{ s: { kind: 'nope' }, p: 'has', o: {} }], select: [] });
    expect(errs.some((e) => e.level === 'error' && e.message.includes('Unknown kind "nope"') && e.message.includes('Valid:'))).toBe(true);
  });

  it('an unbound select var is an error naming which vars ARE bound', () => {
    const errs = validateQuery({ match: [{ s: { var: 'a' }, p: 'has', o: { var: 'b' } }], select: ['c'] });
    expect(errs).toContainEqual({
      level: 'error',
      message: 'select var "c" is never bound in match. Bound vars: a, b.',
    });
  });

  it('an off-ontology but otherwise well-formed pattern is a warning, not an error, and still runs', () => {
    const q: GraphQuery = { match: [{ s: { kind: 'module' }, p: 'contains', o: { kind: 'external' } }], select: [] };
    const errs = validateQuery(q);
    expect(errs).toEqual([
      {
        level: 'warning',
        message: 'No ontology triple module —contains→ external. Licensed types for this pair: uses.',
      },
    ]);
    expect(() => runQuery(FIXTURE, q)).not.toThrow();
  });

  it('+ (transitive) suppresses the pair-licensing warning even when the direct pair is unlicensed', () => {
    const errs = validateQuery({ match: [{ s: { kind: 'module' }, p: 'contains+', o: { kind: 'external' } }], select: [] });
    expect(errs).toEqual([]);
  });
});

describe('whyChain', () => {
  it('traverses incoming motivates/serves/constrains and outgoing implements/satisfies/serves', () => {
    const chain = whyChain(FIXTURE, 'purpose-shared-understanding').map((n) => n.id);
    // purpose --serves--> persona-architect / persona-builder (outgoing serves)
    expect(chain.sort()).toEqual(['persona-architect', 'persona-builder'].sort());
  });

  it('walks outgoing serves from a capability to reach whatever motivates it', () => {
    // hypothesis-graph-beats-docs --motivates--> capability-visualise (incoming motivates)
    const chain = whyChain(FIXTURE, 'capability-visualise').map((n) => n.id);
    expect(chain).toEqual(['hypothesis-graph-beats-docs']);
  });

  it('never revisits a node (cycle safety) and returns [] for an isolated id', () => {
    const g: Graph = {
      nodes: [
        { id: 'a', kind: 'purpose', title: 'A', description: '' },
        { id: 'b', kind: 'goal', title: 'B', description: '' },
      ],
      edges: [
        { id: 'e1', srcId: 'a', dstId: 'b', type: 'motivates' },
        { id: 'e2', srcId: 'b', dstId: 'a', type: 'motivates' }, // cycle back
      ],
    };
    expect(() => whyChain(g, 'a')).not.toThrow();
    expect(whyChain(g, 'a').map((n) => n.id).sort()).toEqual(['b']);
    expect(whyChain(FIXTURE, 'no-such-id')).toEqual([]);
  });
});

describe('realization / evidence', () => {
  it('realization collects implements + satisfies sources, de-duplicated', () => {
    expect(realization(FIXTURE, 'capability-visualise').map((n) => n.id)).toEqual(['component-force-graph']);
    expect(realization(FIXTURE, 'requirement-three-parts').map((n) => n.id)).toEqual(['capability-collect']);
  });

  it('realization returns [] when nothing implements/satisfies the target', () => {
    expect(realization(FIXTURE, 'name-bropilot')).toEqual([]);
  });

  it('evidence collects verifies + monitors sources, de-duplicated', () => {
    // nothing in FIXTURE verifies or monitors module-store (it's one of lint's unverified findings)
    expect(evidence(FIXTURE, 'module-store')).toEqual([]);
    const g: Graph = {
      nodes: [
        { id: 't', kind: 'tests', title: 'T', description: '' },
        { id: 'o', kind: 'observability', title: 'O', description: '' },
        { id: 'm', kind: 'module', title: 'M', description: '' },
      ],
      edges: [
        { id: 'e1', srcId: 't', dstId: 'm', type: 'verifies' },
        { id: 'e2', srcId: 'o', dstId: 'm', type: 'monitors' },
      ],
    };
    expect(evidence(g, 'm').map((n) => n.id).sort()).toEqual(['o', 't']);
  });
});

describe('neighborhood', () => {
  it('depth 0 returns just the centre node and no edges', () => {
    const hood = neighborhood(FIXTURE, 'name-bropilot', { depth: 0 });
    expect(hood.nodes.map((n) => n.id)).toEqual(['name-bropilot']);
    expect(hood.edges).toEqual([]);
  });

  it('depth 1 includes only direct neighbours in either direction', () => {
    const hood = neighborhood(FIXTURE, 'name-bropilot', { depth: 1 });
    expect(hood.nodes.map((n) => n.id).sort()).toEqual(
      ['name-bropilot', 'purpose-shared-understanding', 'capability-collect', 'capability-visualise', 'capability-portable'].sort(),
    );
  });

  it('larger depth strictly grows (or holds steady at) the neighbourhood', () => {
    const hood1 = neighborhood(FIXTURE, 'name-bropilot', { depth: 1 });
    const hood2 = neighborhood(FIXTURE, 'name-bropilot', { depth: 2 });
    expect(hood2.nodes.length).toBeGreaterThanOrEqual(hood1.nodes.length);
    const ids1 = new Set(hood1.nodes.map((n) => n.id));
    for (const id of ids1) expect(hood2.nodes.some((n) => n.id === id)).toBe(true);
  });

  it('edgeTypes option restricts traversal to the given types only', () => {
    const hood = neighborhood(FIXTURE, 'screen-studio', { depth: 1, edgeTypes: ['contains'] });
    expect(hood.nodes.map((n) => n.id).sort()).toEqual(
      ['screen-studio', 'component-force-graph', 'component-node-form'].sort(),
    );
    expect(hood.edges.every((e) => e.type === 'contains')).toBe(true);
  });

  it('defaults to depth 2 when no depth is given', () => {
    const explicit = neighborhood(FIXTURE, 'name-bropilot', { depth: 2 });
    const implicit = neighborhood(FIXTURE, 'name-bropilot', {});
    expect(implicit).toEqual(explicit);
  });
});

describe('contextMarkdown', () => {
  it('returns an empty string for a nonexistent centre id', () => {
    expect(contextMarkdown(FIXTURE, 'no-such-node')).toBe('');
  });

  it('includes the title, kind label, description, and props of the centre node', () => {
    const md = contextMarkdown(FIXTURE, 'persona-architect');
    expect(md).toContain('# System architect');
    expect(md).toContain('Persona');
    expect(md).toContain('Owns the shape of the system and keeps the graph honest.');
    expect(md).toContain('role');
  });

  it('stays under budget and has no truncation note for a normal-sized graph', () => {
    const md = contextMarkdown(FIXTURE, 'name-bropilot');
    expect(md.length).toBeLessThanOrEqual(10_000);
    expect(md).not.toContain('truncated');
  });

  it('caps output at 10,000 chars and appends a truncation note for an oversized neighbourhood', () => {
    const nodes = [{ id: 'center', kind: 'module', title: 'Center', description: 'x'.repeat(50) }];
    const edges: Graph['edges'] = [];
    for (let i = 0; i < 300; i++) {
      nodes.push({
        id: `n${i}`,
        kind: 'module',
        title: `Node number ${i} with a fairly long descriptive title`,
        description: 'y'.repeat(80),
      });
      edges.push({ id: `e${i}`, srcId: 'center', dstId: `n${i}`, type: 'contains' });
    }
    const big: Graph = { nodes, edges };
    const md = contextMarkdown(big, 'center', { depth: 1 });
    expect(md.length).toBeLessThanOrEqual(10_000 + '\n\n_… truncated (graph context exceeds budget)_'.length);
    expect(md.endsWith('_… truncated (graph context exceeds budget)_')).toBe(true);
  });
});
