import { describe, expect, it } from 'vitest';
import { suggestFor, suggestStats } from '../../src/lib/suggest';
import type { Graph } from '../../src/lib/schema';

const node = (id: string, kind: string, title = id) => ({ id, kind, title, description: '' });

describe('suggestFor: existing-edge exclusion & zero-candidate rules', () => {
  it('drops a suggestion whose only candidate is already connected, keeps it when a free candidate exists', () => {
    const connected: Graph = {
      nodes: [node('m', 'module', 'M'), node('t', 'tests', 'T')],
      edges: [{ id: 'e1', srcId: 't', dstId: 'm', type: 'verifies' }],
    };
    // the sole tests node already verifies m → no verifies/tests suggestion for m
    expect(
      suggestFor(connected, 'm').some((s) => s.type === 'verifies' && s.otherKind === 'tests'),
    ).toBe(false);

    const withFree: Graph = {
      nodes: [node('m', 'module', 'M'), node('t', 'tests', 'T'), node('t2', 'tests', 'T2')],
      edges: [{ id: 'e1', srcId: 't', dstId: 'm', type: 'verifies' }],
    };
    const verify = suggestFor(withFree, 'm').find((s) => s.type === 'verifies' && s.otherKind === 'tests');
    expect(verify).toBeTruthy();
    expect(verify!.candidates).toEqual(['t2']); // t excluded (already connected)
    expect(verify!.dir).toBe('in');
  });

  it('keeps a zero-candidate suggestion when no node of the target kind exists', () => {
    const g: Graph = { nodes: [node('o', 'observability', 'O')], edges: [] };
    const s = suggestFor(g, 'o');
    const monitorsGoal = s.find((x) => x.type === 'monitors' && x.otherKind === 'goal');
    expect(monitorsGoal).toBeTruthy();
    expect(monitorsGoal!.candidates).toEqual([]);
    expect(monitorsGoal!.dir).toBe('out');
  });

  it('never suggests a possible-strength triple', () => {
    const g: Graph = { nodes: [node('c', 'capability', 'C'), node('k', 'constraint', 'K')], edges: [] };
    // capability --depends_on--> constraint is strength 'possible'
    expect(
      suggestFor(g, 'c').some((s) => s.type === 'depends_on' && s.otherKind === 'constraint'),
    ).toBe(false);
    expect(suggestFor(g, 'c').every((s) => s.strength === 'canonical' || s.strength === 'typical')).toBe(true);
  });

  it('returns [] for a nonexistent node', () => {
    expect(suggestFor({ nodes: [], edges: [] }, 'ghost')).toEqual([]);
  });
});

describe('suggestFor: ordering & caps', () => {
  it('orders canonical suggestions before typical ones', () => {
    const g: Graph = {
      nodes: [node('c', 'capability', 'C'), node('p', 'persona', 'P'), node('r', 'requirement', 'R'), node('u', 'usecase', 'U')],
      edges: [],
    };
    const s = suggestFor(g, 'c');
    const firstTypical = s.findIndex((x) => x.strength === 'typical');
    const lastCanonical = s.map((x) => x.strength).lastIndexOf('canonical');
    if (firstTypical !== -1) expect(lastCanonical).toBeLessThan(firstTypical);
  });

  it('caps suggestions at 8 for a densely-connected kind', () => {
    const g: Graph = { nodes: [node('m', 'module', 'M')], edges: [] };
    expect(suggestFor(g, 'm').length).toBe(8); // module has far more than 8 canonical/typical triples
  });

  it('caps candidates at 5', () => {
    const nodes = [node('m', 'module', 'M')];
    for (let i = 0; i < 6; i++) nodes.push(node(`c${i}`, 'component', `Comp ${i}`));
    const contains = suggestFor({ nodes, edges: [] }, 'm').find(
      (s) => s.type === 'contains' && s.otherKind === 'component',
    );
    expect(contains).toBeTruthy();
    expect(contains!.candidates.length).toBe(5);
  });

  it('ranks triangle-closing candidates before alphabetical ones', () => {
    // subject capability C connects to usecase U; persona pA also connects to U (shared neighbour → triangle),
    // persona pB shares nothing. pB's title sorts first alphabetically, but pA must rank first.
    const g: Graph = {
      nodes: [
        node('c', 'capability', 'C'),
        node('u', 'usecase', 'U'),
        node('pa', 'persona', 'ZZZ'),
        node('pb', 'persona', 'AAA'),
      ],
      edges: [
        { id: 'e1', srcId: 'c', dstId: 'u', type: 'satisfies' }, // C — U
        { id: 'e2', srcId: 'pa', dstId: 'u', type: 'motivates' }, // pA — U (shared neighbour)
      ],
    };
    const serves = suggestFor(g, 'c').find((s) => s.type === 'serves' && s.otherKind === 'persona');
    expect(serves).toBeTruthy();
    expect(serves!.candidates[0]).toBe('pa'); // triangle beats alphabetical
    expect(serves!.candidates).toContain('pb');
  });

  it('produces a readable reason sentence', () => {
    // Amended by controller 2026-07-26: a lone module makes all 11 canonical
    // triples zero-candidate ties, so 'verifies' (declared last) can never beat
    // the cap of 8 — a tests node gives it a candidate and exercises promotion.
    const g: Graph = { nodes: [node('m', 'module', 'M'), node('t', 'tests', 'T')], edges: [] };
    const s = suggestFor(g, 'm').find((x) => x.type === 'verifies' && x.otherKind === 'tests');
    expect(s!.candidates).toEqual(['t']);
    expect(s!.reason).toMatch(/verifies/);
    expect(s!.reason.endsWith('.')).toBe(true);
    expect(s!.reason[0]).toBe(s!.reason[0].toUpperCase());
  });
});

describe('suggestStats', () => {
  it('aggregates counts and picks the node with the most suggestions', () => {
    const g: Graph = {
      nodes: [node('m', 'module', 'M'), node('g', 'goal', 'G')],
      edges: [],
    };
    const stats = suggestStats(g);
    const mCount = suggestFor(g, 'm').length;
    const gCount = suggestFor(g, 'g').length;
    expect(stats.total).toBe(mCount + gCount);
    expect(stats.nodes).toBe(2);
    expect(stats.topNodeId).toBe(mCount >= gCount ? 'm' : 'g'); // module has more triples than goal
  });

  it('reports zero and null topNodeId for a graph with no suggestions', () => {
    // a lone term with every ontology target absent still yields zero-candidate suggestions,
    // so use a truly empty graph for the null case
    expect(suggestStats({ nodes: [], edges: [] })).toEqual({ nodes: 0, total: 0, topNodeId: null });
  });
});
