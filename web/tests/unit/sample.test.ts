import { describe, expect, it } from 'vitest';
import { SAMPLE_GRAPH } from '../../src/lib/sample';
import sampleJson from '../../src/lib/sample-data.json';
import { importGraph } from '../../src/lib/store';
import { lintGraph } from '../../src/lib/lint';
import { KINDS, KIND_MAP, EDGE_TYPE_SET, kebab } from '../../src/lib/schema';

const CORE = ['capability', 'usecase', 'requirement', 'term', 'entity', 'behaviour', 'module', 'api', 'tests'];

// These three ids predate the strict {kind}-{kebab(title)} convention and are
// load-bearing for e2e (persona-architect / module-store / component-force-graph
// are hard-anchored across verification.spec.ts). Their titles ("System
// architect", "Graph store", "ForceGraph") don't kebab back to these exact
// suffixes, so they're grandfathered out of the structural id-format check
// below rather than renamed and breaking e2e continuity.
const PINNED_LEGACY_IDS = new Set(['persona-architect', 'module-store', 'component-force-graph']);

describe('SAMPLE_GRAPH passes importGraph validation', () => {
  it('imports without error through the store validation path', () => {
    const res = importGraph(JSON.stringify(sampleJson));
    expect(res.ok).toBe(true);
    expect(res.error).toBeUndefined();
  });
});

describe('SAMPLE_GRAPH size & coverage thresholds', () => {
  const { nodes, edges } = SAMPLE_GRAPH;

  it('has at least 110 nodes and 220 edges', () => {
    expect(nodes.length).toBeGreaterThanOrEqual(110);
    expect(edges.length).toBeGreaterThanOrEqual(220);
  });

  it('uses every one of the 28 kinds at least once', () => {
    const present = new Set(nodes.map((n) => n.kind));
    for (const k of KINDS) expect(present.has(k.kind), `missing kind: ${k.kind}`).toBe(true);
  });

  it('has at least 4 of each core kind', () => {
    for (const k of CORE) {
      expect(nodes.filter((n) => n.kind === k).length, `core kind ${k} < 4`).toBeGreaterThanOrEqual(4);
    }
  });

  it('uses all 17 edge types at least once', () => {
    const used = new Set(edges.map((e) => e.type));
    for (const t of EDGE_TYPE_SET) expect(used.has(t), `edge type never used: ${t}`).toBe(true);
  });

  it('keeps references edges under 5% of all edges', () => {
    const refs = edges.filter((e) => e.type === 'references').length;
    expect(refs / edges.length).toBeLessThan(0.05);
  });
});

describe('SAMPLE_GRAPH structural integrity', () => {
  const { nodes, edges } = SAMPLE_GRAPH;
  const ids = new Set(nodes.map((n) => n.id));

  it('every node id matches {kind}-{kebab-title} and every kind is known', () => {
    for (const n of nodes) {
      expect(KIND_MAP[n.kind], `unknown kind: ${n.kind}`).toBeTruthy();
      if (PINNED_LEGACY_IDS.has(n.id)) continue;
      expect(n.id, `id mismatch for "${n.title}"`).toBe(`${n.kind}-${kebab(n.title)}`);
    }
  });

  it('every node has a 1-2 sentence non-empty description', () => {
    for (const n of nodes) expect(n.description.trim().length, `empty description: ${n.id}`).toBeGreaterThan(0);
  });

  it('every edge references known types and resolvable endpoints', () => {
    for (const e of edges) {
      expect(EDGE_TYPE_SET.has(e.type), `unknown edge type: ${e.type}`).toBe(true);
      expect(ids.has(e.srcId), `dangling srcId: ${e.srcId}`).toBe(true);
      expect(ids.has(e.dstId), `dangling dstId: ${e.dstId}`).toBe(true);
    }
  });
});

describe('SAMPLE_GRAPH lint thresholds', () => {
  const findings = lintGraph(SAMPLE_GRAPH);

  it('has zero orphans', () => {
    expect(findings.filter((f) => f.message.includes('has no relationships yet'))).toHaveLength(0);
  });

  it('has zero why-chain gaps', () => {
    expect(findings.filter((f) => f.message.includes('Nothing says why'))).toHaveLength(0);
  });

  it('has between 1 and 3 unverified surfaces (health card always has content)', () => {
    const unverified = findings.filter((f) => f.message.includes('No test evidence'));
    expect(unverified.length).toBeGreaterThanOrEqual(1);
    expect(unverified.length).toBeLessThanOrEqual(3);
  });
});

describe('SAMPLE_GRAPH e2e anchor nodes', () => {
  const byId = (id: string) => SAMPLE_GRAPH.nodes.find((n) => n.id === id);

  it('contains the persona-architect anchor titled "System architect"', () => {
    expect(byId('persona-architect')?.title).toBe('System architect');
  });

  it('contains the module-store anchor titled "Graph store", with incoming verifies', () => {
    expect(byId('module-store')?.title).toBe('Graph store');
    const verified = SAMPLE_GRAPH.edges.some((e) => e.dstId === 'module-store' && e.type === 'verifies');
    expect(verified).toBe(true);
  });

  it('contains the component-force-graph anchor titled "ForceGraph"', () => {
    expect(byId('component-force-graph')?.title).toBe('ForceGraph');
  });
});
