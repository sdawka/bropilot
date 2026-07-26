// Advisory edge suggestions derived from the ONTOLOGY (T-Box). Pure — takes a
// Graph, never touches the store, never mutates. Suggestions are hints the UI
// offers; nothing is validated or auto-applied.
import { ONTOLOGY, KIND_MAP, EDGE_TYPE_LABELS, type Graph } from './schema';

export interface Suggestion {
  nodeId: string;
  dir: 'out' | 'in';
  type: string;
  otherKind: string;
  strength: 'canonical' | 'typical';
  candidates: string[];
  reason: string;
}

const MAX_SUGGESTIONS = 8;
const MAX_CANDIDATES = 5;

function article(word: string): string {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

function reasonFor(
  subjectKind: string,
  dir: 'out' | 'in',
  type: string,
  otherKind: string,
  strength: 'canonical' | 'typical',
): string {
  const adverb = strength === 'canonical' ? 'canonically' : 'typically';
  const verb = EDGE_TYPE_LABELS[type] ?? type;
  const subj = (KIND_MAP[subjectKind]?.label ?? subjectKind).toLowerCase();
  const other = (KIND_MAP[otherKind]?.label ?? otherKind).toLowerCase();
  const s =
    dir === 'out'
      ? `${article(subj)} ${subj} ${adverb} ${verb} ${article(other)} ${other}`
      : `${article(other)} ${other} ${adverb} ${verb} ${article(subj)} ${subj}`;
  return s.charAt(0).toUpperCase() + s.slice(1) + '.';
}

interface Triple {
  dir: 'out' | 'in';
  type: string;
  otherKind: string;
  strength: 'canonical' | 'typical';
}

export function suggestFor(graph: Graph, nodeId: string): Suggestion[] {
  const subject = graph.nodes.find((n) => n.id === nodeId);
  if (!subject) return [];
  const kind = subject.kind;

  // adjacency (undirected) for triangle-closing + directed sets for existing-edge exclusion
  const neighbours = new Map<string, Set<string>>();
  const outExisting = new Set<string>(); // `${type}|${dstId}` for edges where subject is src
  const inExisting = new Set<string>(); // `${type}|${srcId}` for edges where subject is dst
  for (const e of graph.edges) {
    if (!neighbours.has(e.srcId)) neighbours.set(e.srcId, new Set());
    if (!neighbours.has(e.dstId)) neighbours.set(e.dstId, new Set());
    neighbours.get(e.srcId)!.add(e.dstId);
    neighbours.get(e.dstId)!.add(e.srcId);
    if (e.srcId === nodeId) outExisting.add(`${e.type}|${e.dstId}`);
    if (e.dstId === nodeId) inExisting.add(`${e.type}|${e.srcId}`);
  }
  const subjectNeighbours = neighbours.get(nodeId) ?? new Set<string>();

  const closesTriangle = (candId: string): boolean => {
    const cn = neighbours.get(candId);
    if (!cn) return false;
    for (const m of cn) if (m !== candId && subjectNeighbours.has(m)) return true;
    return false;
  };

  // collect out+in triples (canonical/typical only) in ONTOLOGY order
  const triples: Triple[] = [];
  for (const t of ONTOLOGY) {
    if (t.strength === 'possible') continue;
    const strength = t.strength; // 'canonical' | 'typical'
    if (t.src === kind) triples.push({ dir: 'out', type: t.type, otherKind: t.dst, strength });
    if (t.dst === kind) triples.push({ dir: 'in', type: t.type, otherKind: t.src, strength });
  }

  // collect all suggestions (not yet capped)
  const allSuggestions: Suggestion[] = [];
  for (const t of triples) {
    const pool = graph.nodes.filter((n) => {
      if (n.kind !== t.otherKind || n.id === nodeId) return false;
      const key = `${t.type}|${n.id}`;
      return t.dir === 'out' ? !outExisting.has(key) : !inExisting.has(key);
    });
    const anyOfKind = graph.nodes.some((n) => n.kind === t.otherKind && n.id !== nodeId);
    if (pool.length === 0 && anyOfKind) continue; // satisfied — every node of otherKind already linked

    const candidates = pool
      .map((n) => ({ id: n.id, title: n.title ?? '', triangle: closesTriangle(n.id) }))
      .sort((a, b) => (a.triangle === b.triangle ? a.title.localeCompare(b.title) : a.triangle ? -1 : 1))
      .slice(0, MAX_CANDIDATES)
      .map((c) => c.id);

    allSuggestions.push({
      nodeId,
      dir: t.dir,
      type: t.type,
      otherKind: t.otherKind,
      strength: t.strength,
      candidates,
      reason: reasonFor(kind, t.dir, t.type, t.otherKind, t.strength),
    });
  }

  // reorder: canonical before typical; within each strength, candidates before zero-candidate; preserve ONTOLOGY order within groups
  const ordered: Suggestion[] = [];
  let count = 0;
  for (const strength of ['canonical', 'typical'] as const) {
    for (const hasCandidate of [true, false]) {
      for (const s of allSuggestions) {
        if (s.strength === strength && (s.candidates.length > 0) === hasCandidate) {
          ordered.push(s);
          if (++count >= MAX_SUGGESTIONS) return ordered;
        }
      }
    }
  }

  return ordered;
}

export function suggestStats(graph: Graph): { nodes: number; total: number; topNodeId: string | null } {
  let total = 0;
  let nodes = 0;
  let topNodeId: string | null = null;
  let topCount = 0;
  for (const n of graph.nodes) {
    const count = suggestFor(graph, n.id).length;
    if (count > 0) {
      nodes++;
      total += count;
      if (count > topCount) {
        topCount = count;
        topNodeId = n.id;
      }
    }
  }
  return { nodes, total, topNodeId };
}
