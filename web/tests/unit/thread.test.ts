import { describe, expect, it } from 'vitest';
import { threadFor, type Thread } from '../../src/lib/thread';
import { SAMPLE_GRAPH } from '../../src/lib/sample';
import type { Graph } from '../../src/lib/schema';

// SAMPLE-COUPLED ANCHORS — if SAMPLE_GRAPH changes, re-anchor these by role:
//   screen-studio            a node whose closure reaches all three parts
//   component-force-graph    an implementation node inside that closure
//   requirement-round-trip-with-bropilot-skills / capability-portable-spec /
//   usecase-onboard-onto-a-system
//                            a why-chain (capability satisfies requirement,
//                            usecase near it) used for column/order checks
// Inline fixtures below are self-contained and unaffected by sample changes.

const PARTS = ['foundations', 'domain', 'implementation'] as const;

function ids(thread: Thread, part: (typeof PARTS)[number]): string[] {
  return thread.columns.find((c) => c.part === part)!.nodes.map((n) => n.node.id);
}
function allIds(thread: Thread): string[] {
  return thread.columns.flatMap((c) => c.nodes.map((n) => n.node.id));
}

describe('threadFor: structure', () => {
  it('returns three fixed columns in order, even when the anchor is missing', () => {
    const t = threadFor(SAMPLE_GRAPH, 'does-not-exist');
    expect(t.columns.map((c) => c.part)).toEqual([...PARTS]);
    expect(allIds(t)).toEqual([]);
    expect(t.edges).toEqual([]);
    expect(t.capped).toBe(false);
  });

  it('returns an empty thread for an empty anchor id', () => {
    const t = threadFor(SAMPLE_GRAPH, '');
    expect(allIds(t)).toEqual([]);
  });
});

describe('threadFor: closure', () => {
  it('traverses edges in both directions (anchor reached only via an incoming edge)', () => {
    // In SAMPLE_GRAPH, requirement-round-trip-with-bropilot-skills is reached
    // by capability-portable-spec --satisfies--> requirement-round-trip-...
    // (an incoming edge from the anchor's perspective). Direction-agnostic
    // BFS must still pull capability-portable-spec in.
    const t = threadFor(SAMPLE_GRAPH, 'requirement-round-trip-with-bropilot-skills');
    const found = allIds(t);
    expect(found).toContain('requirement-round-trip-with-bropilot-skills');
    expect(found).toContain('capability-portable-spec');
  });

  it('buckets every returned node into the column matching KIND_MAP[kind].part', () => {
    const t = threadFor(SAMPLE_GRAPH, 'screen-studio');
    // foundations kinds land in foundations, etc. Spot-check known members.
    expect(ids(t, 'domain')).toContain('screen-studio');
    expect(ids(t, 'implementation')).toContain('component-force-graph');
    expect(ids(t, 'foundations')).toContain('usecase-onboard-onto-a-system');
  });

  it('skips unknown-kind nodes but keeps their known-kind neighbours', () => {
    const graph: Graph = {
      nodes: [
        { id: 'persona-a', kind: 'persona', title: 'A', description: '', props: {} },
        { id: 'weird-1', kind: 'zzz-unknown', title: 'Weird', description: '', props: {} },
        { id: 'entity-b', kind: 'entity', title: 'B', description: '', props: {} },
      ],
      edges: [
        { id: 'x1', srcId: 'persona-a', dstId: 'weird-1', type: 'references' },
        { id: 'x2', srcId: 'weird-1', dstId: 'entity-b', type: 'references' },
      ],
    };
    const t = threadFor(graph, 'persona-a');
    const found = allIds(t);
    expect(found).toContain('persona-a');
    expect(found).toContain('entity-b'); // reachable through the unknown node
    expect(found).not.toContain('weird-1'); // unknown kind never shown
    // edges touching the skipped node are excluded from the rendered set
    expect(t.edges.map((e) => e.id).sort()).toEqual([]);
  });
});

describe('threadFor: cap', () => {
  it('caps the closure at 60 nodes and flags it', () => {
    const nodes = [{ id: 'name-root', kind: 'name', title: 'Root', description: '', props: {} }];
    const edges = [];
    for (let i = 0; i < 100; i++) {
      nodes.push({ id: `capability-${i}`, kind: 'capability', title: `Cap ${i}`, description: '', props: {} });
      edges.push({ id: `e-${i}`, srcId: 'name-root', dstId: `capability-${i}`, type: 'has' });
    }
    const t = threadFor({ nodes, edges }, 'name-root');
    const total = t.columns.reduce((n, c) => n + c.nodes.length, 0);
    expect(total).toBe(60);
    expect(t.capped).toBe(true);
  });
});

describe('threadFor: deterministic ordering', () => {
  it('produces identical output across runs', () => {
    const a = JSON.stringify(threadFor(SAMPLE_GRAPH, 'screen-studio'));
    const b = JSON.stringify(threadFor(SAMPLE_GRAPH, 'screen-studio'));
    expect(a).toBe(b);
  });

  it('breaks barycenter ties by title within a column', () => {
    // Two foundations nodes with identical neighbour sets tie on barycenter,
    // so they must fall back to title order: "Alpha" before "Beta".
    const graph: Graph = {
      nodes: [
        { id: 'capability-beta', kind: 'capability', title: 'Beta', description: '', props: {} },
        { id: 'capability-alpha', kind: 'capability', title: 'Alpha', description: '', props: {} },
        { id: 'entity-hub', kind: 'entity', title: 'Hub', description: '', props: {} },
      ],
      edges: [
        { id: 'b1', srcId: 'capability-beta', dstId: 'entity-hub', type: 'references' },
        { id: 'b2', srcId: 'capability-alpha', dstId: 'entity-hub', type: 'references' },
      ],
    };
    const t = threadFor(graph, 'entity-hub');
    expect(ids(t, 'foundations')).toEqual(['capability-alpha', 'capability-beta']);
    // rows are contiguous 0..n-1
    expect(t.columns.find((c) => c.part === 'foundations')!.nodes.map((n) => n.row)).toEqual([0, 1]);
  });

  it('sorts by barycenter mean (not title) when neighbours span different rows', () => {
    // Two foundations nodes with different domain neighbours at different rows.
    // Title order (Alpha < Zebra) would give WRONG answer if barycenter logic is bypassed.
    const graph: Graph = {
      nodes: [
        { id: 'screen-hub', kind: 'screen', title: 'Hub', description: '', props: {} },
        { id: 'screen-a', kind: 'screen', title: 'A', description: '', props: {} },
        { id: 'screen-z', kind: 'screen', title: 'Z', description: '', props: {} },
        { id: 'capability-zebra', kind: 'capability', title: 'Zebra', description: '', props: {} },
        { id: 'capability-alpha', kind: 'capability', title: 'Alpha', description: '', props: {} },
      ],
      edges: [
        { id: 'e1', srcId: 'screen-hub', dstId: 'screen-a', type: 'references' },
        { id: 'e2', srcId: 'screen-hub', dstId: 'screen-z', type: 'references' },
        { id: 'e3', srcId: 'capability-zebra', dstId: 'screen-a', type: 'references' },
        { id: 'e4', srcId: 'capability-alpha', dstId: 'screen-z', type: 'references' },
      ],
    };
    const t = threadFor(graph, 'screen-hub');
    // Domain layout: screen-a (row 0), screen-hub (row 1), screen-z (row 2).
    // Zebra connects to screen-a (row 0) → bary=0; Alpha connects to screen-z (row 2) → bary=2.
    // Title order alone: Alpha < Zebra. Barycenter order: Zebra (0) < Alpha (2).
    // Test verifies barycenter mean wins over title.
    expect(ids(t, 'foundations')).toEqual(['capability-zebra', 'capability-alpha']);
  });
});
