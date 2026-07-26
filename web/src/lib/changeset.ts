// Turns raw {nodes, edges} — from any workshop exercise or a pasted LLM reply —
// into a reviewed Changeset (diffAgainstGraph, pure), and applies a selected
// subset as one undo step (applyChangeset, writes through the store). This is
// the only path into the graph from the Workshop. Advisory throughout: unknown
// kinds / edge types are warnings, never errors.
import {
  type Graph,
  type GraphNode,
  KIND_MAP,
  EDGE_TYPE_SET,
  kebab,
} from './schema';
import { state, undo, applyGraphBatch } from './store';
import { toast } from './toast';

export interface StagedNode {
  id: string;
  kind: string;
  title: string;
  description?: string;
  props?: Record<string, unknown>;
  excerpt?: string;
  op: 'add' | 'update';
}
export interface StagedEdge {
  id: string;
  srcId: string;
  dstId: string;
  type: string;
  op: 'add';
}
export interface Changeset {
  nodes: StagedNode[];
  edges: StagedEdge[];
  warnings: string[];
}
export interface RawGraph {
  nodes: unknown[];
  edges: unknown[];
}

const norm = (s: string) => s.trim().toLowerCase();
function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function uniqueId(kind: string, title: string, taken: Set<string>): string {
  const base = `${kind}-${kebab(title) || 'node'}`;
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function diffAgainstGraph(graph: Graph, raw: RawGraph): Changeset {
  const warnings: string[] = [];
  const nodes: StagedNode[] = [];

  const existingById = new Map(graph.nodes.map((n) => [n.id, n]));
  const existingByKindTitle = new Map(graph.nodes.map((n) => [`${n.kind}|${norm(n.title)}`, n]));
  const existingByTitle = new Map<string, GraphNode>();
  for (const n of graph.nodes) if (!existingByTitle.has(norm(n.title))) existingByTitle.set(norm(n.title), n);

  const takenIds = new Set(graph.nodes.map((n) => n.id));
  const seenKeys = new Set<string>(); // dedupe raw nodes by kind|title
  const stagedByTitle = new Map<string, StagedNode>(); // for edge resolution

  for (const rawNode of Array.isArray(raw.nodes) ? raw.nodes : []) {
    if (!rawNode || typeof rawNode !== 'object') continue;
    const r = rawNode as Record<string, unknown>;
    const kind = str(r.kind);
    const title = str(r.title).trim();
    if (!kind || !title) {
      warnings.push('Skipped a node with no kind or title.');
      continue;
    }
    const key = `${kind}|${norm(title)}`;
    if (seenKeys.has(key)) continue; // exact duplicate within the reply
    seenKeys.add(key);

    if (!KIND_MAP[kind]) warnings.push(`Unknown kind "${kind}" for "${title}" — you can still apply it.`);

    const description = typeof r.description === 'string' ? r.description : undefined;
    const props = r.props && typeof r.props === 'object' ? (r.props as Record<string, unknown>) : undefined;
    const excerpt = typeof r.excerpt === 'string' && r.excerpt.trim() ? r.excerpt.trim() : undefined;

    // update? (same kind + exact title, or an explicit existing id)
    const byId = typeof r.id === 'string' ? existingById.get(r.id) : undefined;
    const match = byId ?? existingByKindTitle.get(key);
    if (match) {
      const patch: StagedNode = { id: match.id, kind: match.kind, title: match.title, op: 'update' };
      let changed = false;
      if (description !== undefined && description !== match.description) {
        patch.description = description;
        changed = true;
      }
      if (props) {
        const merged = { ...(match.props ?? {}), ...props };
        if (JSON.stringify(merged) !== JSON.stringify(match.props ?? {})) {
          patch.props = merged;
          changed = true;
        }
      }
      if (excerpt) {
        patch.excerpt = excerpt;
        changed = true;
      }
      stagedByTitle.set(norm(title), patch); // register for edge resolution regardless
      if (changed) nodes.push(patch); // else drop the no-op update
      continue;
    }

    const id = uniqueId(kind, title, takenIds);
    takenIds.add(id);
    const staged: StagedNode = { id, kind, title, description, props, excerpt, op: 'add' };
    nodes.push(staged);
    stagedByTitle.set(norm(title), staged);
  }

  // ── edges ──
  const edges: StagedEdge[] = [];
  const seenEdges = new Set<string>();
  const existingEdges = new Set(graph.edges.map((e) => `${e.srcId}|${e.type}|${e.dstId}`));

  const resolve = (ref: string): string | null => {
    if (existingById.has(ref)) return ref;
    const staged = stagedByTitle.get(norm(ref));
    if (staged) return staged.id;
    const existing = existingByTitle.get(norm(ref));
    if (existing) return existing.id;
    return null;
  };

  for (const rawEdge of Array.isArray(raw.edges) ? raw.edges : []) {
    if (!rawEdge || typeof rawEdge !== 'object') continue;
    const r = rawEdge as Record<string, unknown>;
    const srcRef = str(r.src) || str(r.srcId);
    const dstRef = str(r.dst) || str(r.dstId);
    const type = str(r.type);
    if (!srcRef || !dstRef || !type) {
      warnings.push('Skipped an edge missing src, dst, or type.');
      continue;
    }
    const srcId = resolve(srcRef);
    const dstId = resolve(dstRef);
    if (!srcId) {
      warnings.push(`Edge dropped — could not resolve source "${srcRef}".`);
      continue;
    }
    if (!dstId) {
      warnings.push(`Edge dropped — could not resolve target "${dstRef}".`);
      continue;
    }
    if (srcId === dstId) continue;
    const key = `${srcId}|${type}|${dstId}`;
    if (seenEdges.has(key) || existingEdges.has(key)) continue;
    seenEdges.add(key);
    if (!EDGE_TYPE_SET.has(type)) warnings.push(`Unknown edge type "${type}" — you can still apply it.`);
    edges.push({ id: `stg-e-${edges.length}`, srcId, dstId, type, op: 'add' });
  }

  return { nodes, edges, warnings };
}

/**
 * Apply the checked subset as one undo step. Edges whose endpoint node was
 * left unchecked are skipped and counted. Fires an Undo toast.
 */
export function applyChangeset(
  cs: Changeset,
  selectedIds: Set<string>,
): { addedNodes: number; updatedNodes: number; addedEdges: number; skippedEdges: number } {
  const chosenNodes = cs.nodes.filter((n) => selectedIds.has(n.id));
  const presentIds = new Set<string>(state.graph.nodes.map((n) => n.id));
  for (const n of chosenNodes) presentIds.add(n.id);

  const addNodes: GraphNode[] = [];
  const updateNodes: { id: string; patch: Partial<GraphNode> }[] = [];
  for (const n of chosenNodes) {
    if (n.op === 'add') {
      addNodes.push({
        id: n.id,
        kind: n.kind,
        title: n.title,
        description: n.description ?? '',
        props: n.props ?? {},
        sourceRefs: n.excerpt ? [{ turnId: 'workshop', excerpt: n.excerpt }] : [],
      });
    } else {
      const patch: Partial<GraphNode> = {};
      if (n.description !== undefined) patch.description = n.description;
      if (n.props !== undefined) patch.props = n.props;
      if (n.excerpt) {
        const existing = state.graph.nodes.find((x) => x.id === n.id);
        patch.sourceRefs = [...(existing?.sourceRefs ?? []), { turnId: 'workshop', excerpt: n.excerpt }];
      }
      updateNodes.push({ id: n.id, patch });
    }
  }

  let skippedEdges = 0;
  const addEdges: { srcId: string; dstId: string; type: string }[] = [];
  for (const e of cs.edges) {
    if (!selectedIds.has(e.id)) continue;
    if (!presentIds.has(e.srcId) || !presentIds.has(e.dstId)) {
      skippedEdges++;
      continue;
    }
    addEdges.push({ srcId: e.srcId, dstId: e.dstId, type: e.type });
  }

  const res = applyGraphBatch({ addNodes, updateNodes, addEdges });
  const parts = [];
  if (res.addedNodes) parts.push(`${res.addedNodes} node${res.addedNodes > 1 ? 's' : ''}`);
  if (res.updatedNodes) parts.push(`${res.updatedNodes} updated`);
  if (res.addedEdges) parts.push(`${res.addedEdges} edge${res.addedEdges > 1 ? 's' : ''}`);
  const skip = skippedEdges ? ` (${skippedEdges} edge${skippedEdges > 1 ? 's' : ''} skipped — endpoint not applied)` : '';
  toast(`Applied ${parts.join(', ') || 'no changes'}${skip}`, { action: { label: 'Undo', handler: undo } });
  return { ...res, skippedEdges };
}
