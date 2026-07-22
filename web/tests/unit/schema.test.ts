import { describe, expect, it } from 'vitest';
import {
  KINDS,
  KIND_MAP,
  PARTS,
  SPACES,
  EDGE_TYPES,
  EDGE_TYPE_SET,
  EDGE_TYPE_LABELS,
  EDGE_CATEGORIES,
  ONTOLOGY,
  triplesFrom,
  tripleFor,
  SUGGESTED_EDGE_TYPES,
  ontologyGraph,
  edgeTypesByCategory,
  kindsForPart,
  kebab,
  nodeSpace,
  nodeHue,
  type GraphNode,
} from '../../src/lib/schema';

describe('KINDS registry', () => {
  it('has no duplicate kind names', () => {
    const seen = new Set<string>();
    for (const k of KINDS) {
      expect(seen.has(k.kind)).toBe(false);
      seen.add(k.kind);
    }
  });

  it('every kind belongs to a known part and space', () => {
    const parts = new Set(PARTS.map((p) => p.id));
    const spaces = new Set(Object.keys(SPACES));
    for (const k of KINDS) {
      expect(parts.has(k.part)).toBe(true);
      expect(spaces.has(k.space)).toBe(true);
    }
  });

  it('KIND_MAP indexes every kind by its own name', () => {
    for (const k of KINDS) {
      expect(KIND_MAP[k.kind]).toBe(k);
    }
    expect(Object.keys(KIND_MAP)).toHaveLength(KINDS.length);
  });

  it('kindsForPart filters exactly the kinds tagged with that part, preserving KINDS order', () => {
    for (const part of PARTS.map((p) => p.id)) {
      const filtered = kindsForPart(part);
      expect(filtered.every((k) => k.part === part)).toBe(true);
      expect(filtered).toEqual(KINDS.filter((k) => k.part === part));
    }
    // every kind is claimed by exactly one part
    const total = PARTS.reduce((n, p) => n + kindsForPart(p.id).length, 0);
    expect(total).toBe(KINDS.length);
  });

  it('field defs (when present) have unique keys per kind', () => {
    for (const k of KINDS) {
      if (!k.fields) continue;
      const keys = k.fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('select fields declare non-empty options', () => {
    for (const k of KINDS) {
      for (const f of k.fields ?? []) {
        if (f.type === 'select') expect(f.options?.length ?? 0).toBeGreaterThan(0);
      }
    }
  });
});

describe('EDGE_TYPES registry', () => {
  it('has no duplicate edge type names', () => {
    const seen = new Set<string>();
    for (const t of EDGE_TYPES) {
      expect(seen.has(t.type)).toBe(false);
      seen.add(t.type);
    }
  });

  it('EDGE_TYPE_SET and EDGE_TYPE_LABELS are consistent with EDGE_TYPES', () => {
    expect(EDGE_TYPE_SET.size).toBe(EDGE_TYPES.length);
    for (const t of EDGE_TYPES) {
      expect(EDGE_TYPE_SET.has(t.type)).toBe(true);
      expect(EDGE_TYPE_LABELS[t.type]).toBe(t.label);
    }
  });

  it('every edge type belongs to a known category', () => {
    const cats = new Set(EDGE_CATEGORIES.map((c) => c.id));
    for (const t of EDGE_TYPES) expect(cats.has(t.category)).toBe(true);
  });

  it('the 8 stock Bropilot types are marked stock and keep their original names', () => {
    const stockNames = EDGE_TYPES.filter((t) => t.stock).map((t) => t.type).sort();
    expect(stockNames).toEqual(
      ['contains', 'depends_on', 'extends', 'has', 'implements', 'references', 'triggers', 'uses'].sort(),
    );
  });

  it('edgeTypesByCategory partitions EDGE_TYPES exactly once each, grouped by category order', () => {
    const grouped = edgeTypesByCategory();
    expect(grouped.map((g) => g.category.id)).toEqual(EDGE_CATEGORIES.map((c) => c.id));
    const total = grouped.reduce((n, g) => n + g.types.length, 0);
    expect(total).toBe(EDGE_TYPES.length);
    for (const g of grouped) {
      expect(g.types.every((t) => t.category === g.category.id)).toBe(true);
    }
  });
});

describe('ONTOLOGY (T-Box)', () => {
  it('has no duplicate (src, type, dst) triples', () => {
    const seen = new Set<string>();
    for (const t of ONTOLOGY) {
      const key = `${t.src}|${t.type}|${t.dst}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('every triple references a real kind on both ends', () => {
    for (const t of ONTOLOGY) {
      expect(KIND_MAP[t.src], `unknown src kind "${t.src}"`).toBeDefined();
      expect(KIND_MAP[t.dst], `unknown dst kind "${t.dst}"`).toBeDefined();
    }
  });

  it('every triple references a real edge type', () => {
    for (const t of ONTOLOGY) {
      expect(EDGE_TYPE_SET.has(t.type), `unknown edge type "${t.type}"`).toBe(true);
    }
  });

  it('every triple has a valid strength', () => {
    const strengths = new Set(['canonical', 'typical', 'possible']);
    for (const t of ONTOLOGY) expect(strengths.has(t.strength)).toBe(true);
  });

  it('tripleFor finds an exact (src, type, dst) match and nothing else', () => {
    const known = ONTOLOGY[0];
    expect(tripleFor(known.src, known.type, known.dst)).toBe(known);
    expect(tripleFor('name', 'has', 'purpose')).toBeDefined();
    expect(tripleFor('purpose', 'has', 'name')).toBeUndefined(); // direction matters
    expect(tripleFor('nonexistent-kind', 'has', 'purpose')).toBeUndefined();
  });

  it('triplesFrom returns only triples for the given src kind, sorted canonical < typical < possible', () => {
    const fromPurpose = triplesFrom('purpose');
    expect(fromPurpose.every((t) => t.src === 'purpose')).toBe(true);
    const rank = { canonical: 0, typical: 1, possible: 2 } as const;
    for (let i = 1; i < fromPurpose.length; i++) {
      expect(rank[fromPurpose[i - 1].strength]).toBeLessThanOrEqual(rank[fromPurpose[i].strength]);
    }
    // sanity: purpose really does have triples of more than one strength in the fixture
    expect(new Set(fromPurpose.map((t) => t.strength)).size).toBeGreaterThan(1);
  });

  it('triplesFrom returns an empty array for a kind with no outgoing triples', () => {
    expect(triplesFrom('does-not-exist')).toEqual([]);
  });
});

describe('SUGGESTED_EDGE_TYPES (derived)', () => {
  it('is derived straight from triplesFrom, canonical-first, de-duplicated, in first-seen order', () => {
    for (const k of KINDS) {
      const expected: string[] = [];
      for (const t of triplesFrom(k.kind)) if (!expected.includes(t.type)) expected.push(t.type);
      if (expected.length) {
        expect(SUGGESTED_EDGE_TYPES[k.kind]).toEqual(expected);
      } else {
        expect(SUGGESTED_EDGE_TYPES[k.kind]).toBeUndefined();
      }
    }
  });

  it('purpose suggests motivates before serves before depends_on (canonical-first ordering)', () => {
    expect(SUGGESTED_EDGE_TYPES['purpose']).toEqual(['motivates', 'serves', 'depends_on']);
  });

  it('never contains duplicate types for a given kind', () => {
    for (const types of Object.values(SUGGESTED_EDGE_TYPES)) {
      expect(new Set(types).size).toBe(types!.length);
    }
  });
});

describe('ontologyGraph projection', () => {
  it('projects one node per kind and one edge per ontology triple', () => {
    const g = ontologyGraph();
    expect(g.nodes).toHaveLength(KINDS.length);
    expect(g.edges).toHaveLength(ONTOLOGY.length);
  });

  it('node ids are bare kind names carrying the kind label/blurb', () => {
    const g = ontologyGraph();
    const nameNode = g.nodes.find((n) => n.id === 'name')!;
    expect(nameNode.kind).toBe('name');
    expect(nameNode.title).toBe(KIND_MAP['name'].label);
    expect(nameNode.description).toBe(KIND_MAP['name'].blurb);
  });

  it('edge ids follow o-{src}-{type}-{dst} and carry the triple endpoints/type', () => {
    const g = ontologyGraph();
    const first = ONTOLOGY[0];
    const edge = g.edges.find((e) => e.id === `o-${first.src}-${first.type}-${first.dst}`);
    expect(edge).toBeDefined();
    expect(edge!.srcId).toBe(first.src);
    expect(edge!.dstId).toBe(first.dst);
    expect(edge!.type).toBe(first.type);
  });

  it('every ontologyGraph edge resolves to two live nodes in the same graph', () => {
    const g = ontologyGraph();
    const ids = new Set(g.nodes.map((n) => n.id));
    for (const e of g.edges) {
      expect(ids.has(e.srcId)).toBe(true);
      expect(ids.has(e.dstId)).toBe(true);
    }
  });
});

describe('kebab', () => {
  it('lowercases, replaces non-alphanumerics with single hyphens, trims edge hyphens', () => {
    expect(kebab('Hello World')).toBe('hello-world');
    expect(kebab('  Leading and trailing  ')).toBe('leading-and-trailing');
    expect(kebab('Multi   Space--Runs')).toBe('multi-space-runs');
    expect(kebab('Already-kebab-case')).toBe('already-kebab-case');
    expect(kebab('!!!Punctuation???')).toBe('punctuation');
    expect(kebab('')).toBe('');
  });
});

describe('nodeSpace / nodeHue', () => {
  it('nodeSpace looks up the space for a known kind', () => {
    const n: GraphNode = { id: 'x', kind: 'module', title: 'X', description: '' };
    expect(nodeSpace(n)).toBe('solution');
  });

  it('nodeSpace falls back to "solution" for an unknown kind', () => {
    const n: GraphNode = { id: 'x', kind: 'not-a-real-kind', title: 'X', description: '' };
    expect(nodeSpace(n)).toBe('solution');
  });

  it('nodeHue returns the hue of the resolved space', () => {
    const n: GraphNode = { id: 'x', kind: 'persona', title: 'X', description: '' };
    expect(nodeHue(n)).toBe(SPACES.problem.hue);
  });
});
