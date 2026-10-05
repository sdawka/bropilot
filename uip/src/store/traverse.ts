// Pure graph traversal over a perspective chain (SPEC §3). No Vue, no router: the store and the views
// call these with a GIndex built from the current (possibly ghosted) graph.
import type { Edge, Graph, Hop, Node, Perspective, PerspStep } from '../types';
import { kind, kindLabel, legalHops, edgeLabel, type NeedDef } from '../ontology';
import { PERSPECTIVES, stepsWithKind } from '../perspectives';

export interface Nb { edge: Edge; other: Node; dir: 'out' | 'in' }

export class GIndex {
  nodes = new Map<string, Node>();
  out = new Map<string, Edge[]>();
  in = new Map<string, Edge[]>();
  byKind = new Map<string, Node[]>();
  constructor(public graph: Graph) {
    for (const n of graph.nodes) {
      this.nodes.set(n.id, n);
      (this.byKind.get(n.kind) ?? this.byKind.set(n.kind, []).get(n.kind)!).push(n);
    }
    for (const e of graph.edges) {
      if (!this.nodes.has(e.src) || !this.nodes.has(e.dst)) continue;
      (this.out.get(e.src) ?? this.out.set(e.src, []).get(e.src)!).push(e);
      (this.in.get(e.dst) ?? this.in.set(e.dst, []).get(e.dst)!).push(e);
    }
  }
  get(id: string) { return this.nodes.get(id); }
  ofKinds(kinds: string[]) { return kinds.flatMap((k) => this.byKind.get(k) ?? []); }
  neighbours(id: string): Nb[] {
    const o = (this.out.get(id) ?? []).map((edge) => ({ edge, other: this.nodes.get(edge.dst)!, dir: 'out' as const }));
    const i = (this.in.get(id) ?? []).map((edge) => ({ edge, other: this.nodes.get(edge.src)!, dir: 'in' as const }));
    return [...o, ...i];
  }
  /** Neighbours across one edge type, optionally one direction. */
  via(id: string, edge: string, dir?: 'out' | 'in'): Nb[] {
    return this.neighbours(id).filter((n) => n.edge.type === edge && (!dir || n.dir === dir));
  }
  count(id: string, edge: string, dir: 'out' | 'in') { return this.via(id, edge, dir).length; }
}

export interface Item { node: Node; edge?: Edge; dir?: 'out' | 'in'; group?: string }

const uniqBy = <T,>(xs: T[], key: (x: T) => string) => { const s = new Set<string>(); return xs.filter((x) => (s.has(key(x)) ? false : (s.add(key(x)), true))); };

/** Items of step `si` under a parent node: union of the step's hops whose `from` is the parent kind. */
export function stepItems(ix: GIndex, step: PerspStep, parent: Node): Item[] {
  const items: Item[] = [];
  for (const hop of step.via) {
    if (hop.from !== parent.kind) continue;
    for (const nb of ix.via(parent.id, hop.edge, hop.dir)) {
      if (step.kinds.includes(nb.other.kind)) items.push({ node: nb.other, edge: nb.edge, dir: nb.dir });
    }
  }
  return uniqBy(items, (i) => i.node.id);
}

/** All neighbours grouped by phrased edge verb (persp=raw, off-chain nodes). */
export function rawItems(ix: GIndex, id: string): Item[] {
  return ix.neighbours(id)
    .map((nb) => ({ node: nb.other, edge: nb.edge, dir: nb.dir, group: nb.dir === 'out' ? `${edgeLabel(nb.edge.type)} →` : `← ${edgeLabel(nb.edge.type)}` }))
    .sort((a, b) => a.group.localeCompare(b.group) || a.node.title.localeCompare(b.node.title));
}

/** Parents of a node one step up the chain (reverse hops of step si). */
function parentsAt(ix: GIndex, p: Perspective, si: number, node: Node): Node[] {
  const step = p.steps[si], up = p.steps[si - 1];
  const out: Node[] = [];
  for (const hop of step.via) {
    if (!up.kinds.includes(hop.from)) continue;
    // hop goes parent→child in `hop.dir`; walk it backwards from the child
    for (const nb of ix.via(node.id, hop.edge, hop.dir === 'out' ? 'in' : 'out')) {
      if (nb.other.kind === hop.from) out.push(nb.other);
    }
  }
  return uniqBy(out, (n) => n.id);
}

/**
 * Re-root resolver: BFS upward from the node to a step-0 kind, shortest first. Returns up to `max`
 * root→node paths, at most one per distinct immediate parent (feeds the "via" picker).
 */
export function resolvePaths(ix: GIndex, p: Perspective, id: string, max = 6): string[][] {
  const node = ix.get(id);
  if (!node) return [];
  const starts = stepsWithKind(p, node.kind);
  if (!starts.length) return [];
  if (starts.includes(0)) return [[id]];
  type St = { id: string; si: number; prev: St | null; first: string | null };
  let frontier: St[] = starts.map((si) => ({ id, si, prev: null, first: null }));
  const seen = new Set(frontier.map((s) => `${s.id}@${s.si}`));
  const found: string[][] = [], firsts = new Set<string>();
  for (let depth = 0; depth < 12 && frontier.length && found.length < max; depth++) {
    const next: St[] = [];
    for (const st of frontier) {
      const n = ix.get(st.id)!;
      for (const par of parentsAt(ix, p, st.si, n)) {
        const key = `${par.id}@${st.si - 1}`;
        const first = st.first ?? par.id;
        const ns: St = { id: par.id, si: st.si - 1, prev: st, first };
        if (ns.si === 0) {
          if (firsts.has(first)) continue;
          firsts.add(first);
          const path: string[] = [];
          for (let c: St | null = ns; c; c = c.prev) path.push(c.id);
          found.push(path);
          if (found.length >= max) break;
          continue;
        }
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(ns);
      }
    }
    frontier = next;
  }
  return found;
}

export interface UnmetNeed { need: NeedDef; have: number; question: string; produces: string }
export function unmetNeeds(ix: GIndex, node: Node): UnmetNeed[] {
  return kind(node.kind).needs.flatMap((need) => {
    const have = ix.count(node.id, need.edge, need.dir);
    return have >= need.min ? [] : [{ need, have, question: need.ask.replace('{title}', node.title), produces: need.produces ?? '' }];
  });
}
export function needsStatus(ix: GIndex, node: Node) {
  return kind(node.kind).needs.map((need) => ({ need, have: ix.count(node.id, need.edge, need.dir), ok: ix.count(node.id, need.edge, need.dir) >= need.min,
    question: need.ask.replace('{title}', node.title) }));
}
export const openCount = (ix: GIndex, node: Node) => unmetNeeds(ix, node).length + ix.neighbours(node.id).filter((n) => n.edge.trace === 'suspect').length;

export interface GapSlot { kind: string; parentId: string | null; question: string; hop?: Hop }
export function hopQuestion(parent: Node, hop: Hop, kinds: string[]): string {
  const k = kinds.map((x) => kindLabel(x, 2).toLowerCase()).join(' or ');
  return hop.dir === 'out' ? `Which ${k} does "${parent.title}" ${edgeLabel(hop.edge)}?` : `Which ${k} ${edgeLabel(hop.edge)} "${parent.title}"?`;
}
/** Gap slots for the column under `parent`: unmet needs that this step would satisfy + empty hops. */
export function gapSlots(ix: GIndex, step: PerspStep, parent: Node): GapSlot[] {
  const slots: GapSlot[] = [];
  for (const u of unmetNeeds(ix, parent)) {
    const fits = step.kinds.includes(u.produces) || step.via.some((h) => h.from === parent.kind && h.edge === u.need.edge);
    if (fits) slots.push({ kind: u.produces || step.kinds[0], parentId: parent.id, question: u.question, hop: { from: parent.kind, edge: u.need.edge, dir: u.need.dir } });
  }
  for (const hop of step.via) {
    if (hop.from !== parent.kind) continue;
    const kinds = step.kinds.filter((k) => (hop.dir === 'out' ? legalTo(hop.edge, k, 'out') : legalTo(hop.edge, k, 'in')));
    const have = ix.via(parent.id, hop.edge, hop.dir).filter((nb) => step.kinds.includes(nb.other.kind)).length;
    if (have === 0 && !slots.some((s) => s.hop?.edge === hop.edge)) slots.push({ kind: kinds[0] ?? step.kinds[0], parentId: parent.id, question: hopQuestion(parent, hop, kinds.length ? kinds : step.kinds), hop });
  }
  return slots;
}
function legalTo(edge: string, k: string, dir: 'out' | 'in') {
  const et = legalHops(k).find((x) => x.edge === edge && x.dir === (dir === 'out' ? 'in' : 'out'));
  return !!et;
}

/** Nodes of a step's kinds that no hop of the step reaches (they appear under no parent). */
export function unlinked(ix: GIndex, p: Perspective, si: number): Node[] {
  if (si <= 0) return [];
  const step = p.steps[si];
  return ix.ofKinds(step.kinds).filter((n) => parentsAt(ix, p, si, n).length === 0);
}

export interface HopStat { persp: string; si: number; hop: Hop; kinds: string[]; parents: number; linked: number; edges: number }
/** Per-hop data coverage for a perspective (cards, coverage chip, thinnest link). */
export function hopStats(ix: GIndex, p: Perspective): HopStat[] {
  const stats: HopStat[] = [];
  p.steps.forEach((step, si) => {
    if (si === 0) return;
    for (const hop of step.via) {
      const parents = ix.byKind.get(hop.from) ?? [];
      let linked = 0, edges = 0;
      for (const par of parents) {
        const n = ix.via(par.id, hop.edge, hop.dir).filter((nb) => step.kinds.includes(nb.other.kind)).length;
        edges += n; if (n) linked++;
      }
      stats.push({ persp: p.id, si, hop, kinds: step.kinds, parents: parents.length, linked, edges });
    }
  });
  return stats;
}
/** "n/m hops have data": steps after the root with at least one edge. */
export function coverage(ix: GIndex, p: Perspective) {
  const st = hopStats(ix, p);
  const steps = p.steps.length - 1;
  const withData = new Set(st.filter((s) => s.edges > 0).map((s) => s.si)).size;
  return { withData, total: steps, stats: st };
}
/** The perspective hop with the lowest linked/parents ratio (parents ≥ 2 so a single node isn't "thin"). */
export function thinnestLink(ix: GIndex): HopStat | null {
  let best: HopStat | null = null, bestR = Infinity;
  for (const p of PERSPECTIVES) for (const s of hopStats(ix, p)) {
    if (s.parents < 2 || s.edges === 0) continue;
    const r = s.linked / s.parents;
    if (r < bestR) { bestR = r; best = s; }
  }
  return best;
}
/** Legal next hops for a kind (persp=derived), with data first. */
export function legalNextHops(ix: GIndex, node: Node, arrived?: { edge: string; dir: 'out' | 'in' }): Hop[] {
  const all = legalHops(node.kind)
    .filter((h) => !(arrived && h.edge === arrived.edge && h.dir !== arrived.dir))
    .map((h) => ({ from: node.kind, edge: h.edge, dir: h.dir }) as Hop);
  const withData = all.filter((h) => ix.count(node.id, h.edge, h.dir) > 0);
  return withData.length ? withData : all;
}

/** URL segments: ids, with `~edge` or `~edge:dir` marking the next id as an across/derived hop. */
export interface Seg { id: string; via?: { edge: string; dir?: 'out' | 'in' } }
export function parseSegments(raw: string[]): Seg[] {
  const out: Seg[] = [];
  let via: Seg['via'];
  for (const s of raw) {
    if (!s) continue;
    if (s.startsWith('~')) { const [edge, dir] = s.slice(1).split(':'); via = { edge, dir: dir === 'in' || dir === 'out' ? dir : undefined }; continue; }
    out.push(via ? { id: s, via } : { id: s });
    via = undefined;
  }
  return out;
}
export const viaToken = (v: { edge: string; dir?: 'out' | 'in' }) => `~${v.edge}${v.dir ? `:${v.dir}` : ''}`;
export function serializeSegments(segs: Seg[]): string[] {
  return segs.flatMap((s) => (s.via ? [viaToken(s.via), s.id] : [s.id]));
}
