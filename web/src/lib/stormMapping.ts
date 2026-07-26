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

// pair (srcCol → dstCol) ⇒ edge type; hotspot→* handled specially
const PAIR_EDGE: Record<string, string> = {
  'actor|command': 'uses',
  'command|aggregate': 'has',
  'command|event': 'emits',
};

export function edgeForPair(srcCol: StormCol, dstCol: StormCol): string | null {
  if (srcCol === 'hotspot') return 'references';
  return PAIR_EDGE[`${srcCol}|${dstCol}`] ?? null;
}

export function buildRawFromStickies(stickies: Sticky[]): RawGraph {
  const byId = new Map(stickies.map((s) => [s.id, s]));
  const nodes = stickies
    .filter((s) => s.title.trim())
    .map((s) => ({ kind: STORM_KIND_BY_COL[s.col], title: s.title.trim(), description: s.note ?? '' }));

  const edges: { src: string; dst: string; type: string }[] = [];
  for (const s of stickies) {
    if (!s.title.trim()) continue;
    for (const l of s.links) {
      const dst = byId.get(l.toId);
      if (!dst || !dst.title.trim()) continue;
      const type = edgeForPair(s.col, dst.col);
      if (!type) continue;
      edges.push({ src: s.title.trim(), dst: dst.title.trim(), type });
    }
  }
  return { nodes, edges };
}
