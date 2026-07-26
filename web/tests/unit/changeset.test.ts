import { describe, expect, it, beforeEach } from 'vitest';
import { diffAgainstGraph, applyChangeset } from '../../src/lib/changeset';
import { state, hydrate, importGraph, undo, canUndo } from '../../src/lib/store';
import type { Graph } from '../../src/lib/schema';

const baseGraph: Graph = {
  nodes: [
    { id: 'persona-rep', kind: 'persona', title: 'Sales rep', description: 'On the road', props: {} },
    { id: 'capability-quote', kind: 'capability', title: 'Build a quote', description: '', props: {} },
  ],
  edges: [{ id: 'e-x', srcId: 'capability-quote', dstId: 'persona-rep', type: 'serves' }],
};

describe('diffAgainstGraph — classification', () => {
  it('classifies a brand-new node as add with a {kind}-{kebab} id', () => {
    const cs = diffAgainstGraph(baseGraph, { nodes: [{ kind: 'goal', title: 'Grow revenue' }], edges: [] });
    expect(cs.nodes).toHaveLength(1);
    expect(cs.nodes[0]).toMatchObject({ id: 'goal-grow-revenue', kind: 'goal', title: 'Grow revenue', op: 'add' });
  });

  it('classifies a same-kind exact-title match as update carrying the existing id', () => {
    const cs = diffAgainstGraph(baseGraph, {
      nodes: [{ kind: 'capability', title: 'build a quote', description: 'Assemble line items' }],
      edges: [],
    });
    expect(cs.nodes).toHaveLength(1);
    expect(cs.nodes[0]).toMatchObject({ id: 'capability-quote', op: 'update', description: 'Assemble line items' });
  });

  it('does NOT merge a same-title node of a different kind (adds instead)', () => {
    const cs = diffAgainstGraph(baseGraph, { nodes: [{ kind: 'term', title: 'Build a quote' }], edges: [] });
    expect(cs.nodes[0].op).toBe('add');
    expect(cs.nodes[0].id).toBe('term-build-a-quote');
  });

  it('drops an exact-duplicate no-op update (same kind/title, nothing changed)', () => {
    const cs = diffAgainstGraph(baseGraph, { nodes: [{ kind: 'persona', title: 'Sales rep', description: 'On the road' }], edges: [] });
    expect(cs.nodes).toHaveLength(0);
  });

  it('gives colliding new titles deterministic -2/-3 suffixes', () => {
    const cs = diffAgainstGraph(baseGraph, {
      nodes: [{ kind: 'goal', title: 'Win' }, { kind: 'goal', title: 'Win' }, { kind: 'goal', title: 'Win' }],
      edges: [],
    });
    // second is an exact-duplicate add of the first → dropped; ids stay unique across the batch
    expect(cs.nodes.map((n) => n.id)).toEqual(['goal-win']);
  });

  it('resolves edge endpoints by title against staged + existing nodes', () => {
    const cs = diffAgainstGraph(baseGraph, {
      nodes: [{ kind: 'usecase', title: 'Send a quote' }],
      edges: [{ src: 'Send a quote', dst: 'Build a quote', type: 'uses' }],
    });
    const edge = cs.edges[0];
    expect(edge).toMatchObject({ srcId: 'usecase-send-a-quote', dstId: 'capability-quote', type: 'uses', op: 'add' });
  });

  it('flags unknown kinds and unknown edge types as warnings but still stages them', () => {
    const cs = diffAgainstGraph(baseGraph, {
      nodes: [{ kind: 'widget', title: 'Thing' }],
      edges: [{ src: 'Thing', dst: 'Sales rep', type: 'frobnicates' }],
    });
    expect(cs.nodes[0].op).toBe('add');
    expect(cs.edges[0].type).toBe('frobnicates');
    expect(cs.warnings.some((w) => w.includes('widget'))).toBe(true);
    expect(cs.warnings.some((w) => w.includes('frobnicates'))).toBe(true);
  });

  it('drops a dangling edge (endpoint resolves to nothing) with a warning', () => {
    const cs = diffAgainstGraph(baseGraph, { nodes: [], edges: [{ src: 'Sales rep', dst: 'Nowhere at all', type: 'uses' }] });
    expect(cs.edges).toHaveLength(0);
    expect(cs.warnings.some((w) => w.includes('Nowhere at all'))).toBe(true);
  });

  it('drops an edge identical to one already in the graph', () => {
    const cs = diffAgainstGraph(baseGraph, { nodes: [], edges: [{ src: 'Build a quote', dst: 'Sales rep', type: 'serves' }] });
    expect(cs.edges).toHaveLength(0);
  });
});

describe('applyChangeset — selection + single undo step', () => {
  beforeEach(() => {
    hydrate(); // idempotent; installs the autosave/undo watch once
    importGraph(JSON.stringify(baseGraph)); // deterministic starting graph (one undo checkpoint)
  });

  it('applies only selected items and skips edges whose endpoint was deselected', () => {
    const cs = diffAgainstGraph(baseGraph, {
      nodes: [{ kind: 'goal', title: 'Grow revenue' }, { kind: 'usecase', title: 'Send a quote' }],
      edges: [{ src: 'Send a quote', dst: 'Build a quote', type: 'uses' }],
    });
    const goalId = cs.nodes.find((n) => n.kind === 'goal')!.id;
    const edgeId = cs.edges[0].id;
    // select the goal + the edge, but NOT the usecase that is the edge's source
    const selected = new Set([goalId, edgeId]);
    const res = applyChangeset(cs, selected);
    expect(res).toMatchObject({ addedNodes: 1, addedEdges: 0, skippedEdges: 1 });
    expect(state.graph.nodes.some((n) => n.id === goalId)).toBe(true);
    expect(state.graph.nodes.some((n) => n.kind === 'usecase')).toBe(false);
  });

  it('applies the whole batch as ONE undo step', () => {
    const cs = diffAgainstGraph(baseGraph, {
      nodes: [{ kind: 'goal', title: 'A' }, { kind: 'goal', title: 'B' }],
      edges: [{ src: 'A', dst: 'Sales rep', type: 'references' }],
    });
    const selected = new Set([...cs.nodes.map((n) => n.id), ...cs.edges.map((e) => e.id)]);
    const before = state.graph.nodes.length;
    applyChangeset(cs, selected);
    expect(state.graph.nodes.length).toBe(before + 2);
    expect(canUndo.value).toBe(true);
    undo();
    expect(state.graph.nodes.length).toBe(before); // single revert restores everything
  });
});
