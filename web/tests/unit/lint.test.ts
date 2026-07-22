import { describe, expect, it } from 'vitest';
import { lintGraph } from '../../src/lib/lint';
import { SAMPLE_GRAPH } from '../../src/lib/sample';
import type { Graph } from '../../src/lib/schema';

describe('lintGraph on SAMPLE_GRAPH', () => {
  const findings = lintGraph(SAMPLE_GRAPH);

  it('produces exactly the 6 known findings', () => {
    expect(findings).toHaveLength(6);
  });

  it('flags exactly one off-ontology edge: module-schema implements term-space', () => {
    const offOntology = findings.filter((f) => f.message.includes('not in the ontology'));
    expect(offOntology).toHaveLength(1);
    expect(offOntology[0]).toMatchObject({ severity: 'note', nodeId: 'module-schema' });
    expect(offOntology[0].message).toContain('implements');
    expect(offOntology[0].message).toContain('module → term');
  });

  it('flags zero orphans (every sample node is linked)', () => {
    const orphans = findings.filter((f) => f.message.includes('has no relationships yet'));
    expect(orphans).toHaveLength(0);
  });

  it('flags exactly two why-chain gaps: capability-collect and capability-portable', () => {
    const whyGaps = findings.filter((f) => f.message.includes('Nothing says why'));
    expect(whyGaps).toHaveLength(2);
    expect(whyGaps.map((f) => f.nodeId).sort()).toEqual(['capability-collect', 'capability-portable']);
    for (const f of whyGaps) expect(f.severity).toBe('note');
  });

  it('flags exactly three unverified surfaces: module-store, module-schema, behaviour-autosave', () => {
    const unverified = findings.filter((f) => f.message.includes('No test evidence'));
    expect(unverified).toHaveLength(3);
    expect(unverified.map((f) => f.nodeId).sort()).toEqual(
      ['behaviour-autosave', 'module-schema', 'module-store'].sort(),
    );
    for (const f of unverified) expect(f.severity).toBe('hint');
  });
});

describe('lintGraph: unknown kinds are skipped everywhere', () => {
  it('does not flag an unlinked node of an unknown kind as an orphan', () => {
    const g: Graph = {
      nodes: [{ id: 'x', kind: 'totally-unknown-kind', title: 'X', description: '' }],
      edges: [],
    };
    expect(lintGraph(g)).toEqual([]);
  });

  it('does not run the off-ontology check when either endpoint has an unknown kind', () => {
    const g: Graph = {
      nodes: [
        { id: 'x', kind: 'totally-unknown-kind', title: 'X', description: '' },
        { id: 'y', kind: 'module', title: 'Y', description: '' },
      ],
      edges: [{ id: 'e1', srcId: 'x', dstId: 'y', type: 'has' }],
    };
    const findings = lintGraph(g);
    expect(findings.some((f) => f.message.includes('not in the ontology'))).toBe(false);
    // y is a module (a VERIFY_TARGET) with no verifies edge, so that finding still fires
    expect(findings).toEqual([
      expect.objectContaining({ nodeId: 'y', message: expect.stringContaining('No test evidence') }),
    ]);
  });

  it('does not run the off-ontology check when the edge type itself is unknown', () => {
    const g: Graph = {
      nodes: [
        { id: 'a', kind: 'name', title: 'A', description: '' },
        { id: 'b', kind: 'purpose', title: 'B', description: '' },
      ],
      edges: [{ id: 'e1', srcId: 'a', dstId: 'b', type: 'not-a-real-edge-type' }],
    };
    const findings = lintGraph(g);
    expect(findings.some((f) => f.message.includes('not in the ontology'))).toBe(false);
  });
});

describe('lintGraph: robustness against null/malformed entries', () => {
  it('never throws and filters out null/undefined/malformed nodes and edges', () => {
    const messy = {
      nodes: [
        null,
        undefined,
        { id: 'a', kind: 'module', title: 'A', description: '' },
        { notAnId: true },
      ],
      edges: [
        null,
        undefined,
        { id: 'e1', srcId: 'a', dstId: 'ghost-node-that-does-not-exist', type: 'contains' },
        { notSrcId: true },
      ],
    } as unknown as Graph;

    expect(() => lintGraph(messy)).not.toThrow();
    const findings = lintGraph(messy);
    // node 'a' is linked (its outgoing edge counts, even though the edge's
    // dst doesn't resolve to a real node), a module, and unverified.
    expect(findings).toEqual([
      expect.objectContaining({ nodeId: 'a', message: expect.stringContaining('No test evidence') }),
    ]);
  });

  it('an edge pointing at a nonexistent node does not crash the off-ontology check', () => {
    const g: Graph = {
      nodes: [{ id: 'a', kind: 'module', title: 'A', description: '' }],
      edges: [{ id: 'e1', srcId: 'a', dstId: 'nowhere', type: 'contains' }],
    };
    expect(() => lintGraph(g)).not.toThrow();
  });

  it('handles a completely empty graph', () => {
    expect(lintGraph({ nodes: [], edges: [] })).toEqual([]);
  });
});

describe('lintGraph: why-chain and verify-target rules directly', () => {
  it('an intent-target node WITH an incoming motivates/serves edge is not flagged', () => {
    const g: Graph = {
      nodes: [
        { id: 'p', kind: 'purpose', title: 'P', description: '' },
        { id: 'c', kind: 'capability', title: 'C', description: '' },
      ],
      edges: [{ id: 'e1', srcId: 'p', dstId: 'c', type: 'motivates' }],
    };
    const findings = lintGraph(g);
    expect(findings.some((f) => f.message.includes('Nothing says why'))).toBe(false);
  });

  it('an intent-target node with only a non-intent incoming edge is still flagged', () => {
    const g: Graph = {
      nodes: [
        { id: 'p', kind: 'requirement', title: 'P', description: '' },
        { id: 'c', kind: 'capability', title: 'C', description: '' },
      ],
      edges: [{ id: 'e1', srcId: 'c', dstId: 'p', type: 'satisfies' }],
    };
    const findings = lintGraph(g);
    expect(findings.some((f) => f.nodeId === 'c' && f.message.includes('Nothing says why'))).toBe(true);
  });

  it('a verify-target node with an incoming verifies edge is not flagged', () => {
    const g: Graph = {
      nodes: [
        { id: 't', kind: 'tests', title: 'T', description: '' },
        { id: 'm', kind: 'module', title: 'M', description: '' },
      ],
      edges: [{ id: 'e1', srcId: 't', dstId: 'm', type: 'verifies' }],
    };
    const findings = lintGraph(g);
    expect(findings.some((f) => f.message.includes('No test evidence'))).toBe(false);
  });
});
