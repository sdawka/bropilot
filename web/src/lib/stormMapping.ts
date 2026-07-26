// Pure mapping helpers for the event-storming board: storm column → graph
// kind, and legal sticky-pair → edge type. Kept separate from EventStorm.vue
// so the mapping rules are unit-testable without mounting the component.
import type { RawGraph } from './changeset';
import type { Sticky, StormCol } from './workshopDraft';

export const STORM_KIND_BY_COL: Record<StormCol, string> = {
  actor: 'persona',
  command: 'behaviour',
  aggregate: 'entity',
  event: 'event',
  hotspot: 'hypothesis',
};

// pair (srcCol → dstCol, i.e. dragged sticky → drop target) ⇒ edge type.
// `reversed` flips which sticky lands as the edge's src/dst so the output
// matches the ontology's semantics rather than the drag direction — e.g. the
// aggregate (entity) *has* the command (behaviour) as an aspect, not the
// other way around, even though you drag the command onto the aggregate.
// hotspot→* is handled specially (never reversed: the hypothesis references
// whatever it's dropped onto).
const PAIR_EDGE: Record<string, { type: string; reversed?: boolean }> = {
  'actor|command': { type: 'uses' },
  'command|aggregate': { type: 'has', reversed: true },
  'command|event': { type: 'emits' },
};

function pairEdge(srcCol: StormCol, dstCol: StormCol): { type: string; reversed: boolean } | null {
  if (srcCol === 'hotspot') return { type: 'references', reversed: false };
  const m = PAIR_EDGE[`${srcCol}|${dstCol}`];
  return m ? { type: m.type, reversed: !!m.reversed } : null;
}

export function edgeForPair(srcCol: StormCol, dstCol: StormCol): string | null {
  return pairEdge(srcCol, dstCol)?.type ?? null;
}

export function buildRawFromStickies(stickies: Sticky[]): RawGraph {
  const byId = new Map(stickies.map((s) => [s.id, s]));
  const nodes = stickies
    .filter((s) => s.title.trim())
    .map((s) => ({ kind: STORM_KIND_BY_COL[s.col], title: s.title.trim(), description: s.note ?? '' }));

  const edges: { src: string; dst: string; type: string }[] = [];
  const seen = new Set<string>();
  for (const s of stickies) {
    const srcTitle = s.title.trim();
    if (!srcTitle) continue;
    for (const l of s.links) {
      const dst = byId.get(l.toId);
      const dstTitle = dst?.title.trim();
      if (!dst || !dstTitle) continue;
      const pe = pairEdge(s.col, dst.col);
      if (!pe) continue;
      const edge = pe.reversed ? { src: dstTitle, dst: srcTitle, type: pe.type } : { src: srcTitle, dst: dstTitle, type: pe.type };
      const key = `${edge.src}|${edge.type}|${edge.dst}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push(edge);
    }
  }
  return { nodes, edges };
}
