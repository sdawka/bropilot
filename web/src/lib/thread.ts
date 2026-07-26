// Pure, deterministic thread layout. No Vue, no store imports — unit-testable.
// A "thread" is the cross-part closure of a single anchor node, bucketed into
// three fixed columns (Foundations / Domain / Implementation) and row-ordered
// by a twice-iterated barycenter heuristic. Same graph + anchor in → same
// layout out.
import { KIND_MAP, type Graph, type GraphNode, type GraphEdge, type Part } from './schema';

export interface ThreadNode {
  node: GraphNode;
  row: number;
}
export interface ThreadColumn {
  part: Part;
  nodes: ThreadNode[];
}
export interface Thread {
  columns: ThreadColumn[];
  edges: GraphEdge[];
  capped: boolean;
}

const THREAD_PARTS: Part[] = ['foundations', 'domain', 'implementation'];
const NODE_CAP = 60;
// Columns whose rows feed a given column's barycenter (left/right neighbours).
const ADJACENT: Record<Part, Part[]> = {
  foundations: ['domain'],
  domain: ['foundations', 'implementation'],
  implementation: ['domain'],
};

function emptyThread(): Thread {
  return { columns: THREAD_PARTS.map((part) => ({ part, nodes: [] })), edges: [], capped: false };
}

function push(map: Map<string, string[]>, key: string, value: string) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

export function threadFor(graph: Graph, anchorId: string): Thread {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  if (!anchorId || !byId.has(anchorId)) return emptyThread();

  // Undirected adjacency over edges whose both endpoints exist.
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (!byId.has(e.srcId) || !byId.has(e.dstId)) continue;
    push(adj, e.srcId, e.dstId);
    push(adj, e.dstId, e.srcId);
  }

  // BFS closure, breadth-first order, capped at NODE_CAP nodes (incl. anchor).
  const visited = new Set<string>([anchorId]);
  const queue = [anchorId];
  let capped = false;
  for (let head = 0; head < queue.length && !capped; head++) {
    for (const nb of adj.get(queue[head]) ?? []) {
      if (visited.has(nb)) continue;
      if (visited.size >= NODE_CAP) {
        capped = true;
        break;
      }
      visited.add(nb);
      queue.push(nb);
    }
  }

  // Bucket known-kind nodes into fixed columns (Set preserves BFS order).
  const columnNodes: Record<Part, GraphNode[]> = { foundations: [], domain: [], implementation: [] };
  for (const id of visited) {
    const node = byId.get(id)!;
    const part = KIND_MAP[node.kind]?.part;
    if (part) columnNodes[part].push(node);
  }

  // Rendered node set = known-kind closure members only.
  const shown = new Set<string>();
  for (const part of THREAD_PARTS) for (const n of columnNodes[part]) shown.add(n.id);
  const edges = graph.edges.filter((e) => shown.has(e.srcId) && shown.has(e.dstId));

  // Barycenter row ordering, seeded by title for stable ties.
  const rowOf = new Map<string, number>();
  const partOf = new Map<string, Part>();
  const reindex = () => {
    rowOf.clear();
    partOf.clear();
    for (const part of THREAD_PARTS)
      columnNodes[part].forEach((n, i) => {
        rowOf.set(n.id, i);
        partOf.set(n.id, part);
      });
  };
  for (const part of THREAD_PARTS)
    columnNodes[part].sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  reindex();

  const neighbours = new Map<string, string[]>();
  for (const e of edges) {
    push(neighbours, e.srcId, e.dstId);
    push(neighbours, e.dstId, e.srcId);
  }

  for (let sweep = 0; sweep < 2; sweep++) {
    for (const part of THREAD_PARTS) {
      const adjacent = new Set(ADJACENT[part]);
      const bary = new Map<string, number>();
      columnNodes[part].forEach((n, idx) => {
        const rows: number[] = [];
        for (const nb of neighbours.get(n.id) ?? []) {
          const np = partOf.get(nb);
          if (np && adjacent.has(np)) rows.push(rowOf.get(nb)!);
        }
        // No cross-column neighbours → keep current position (idx).
        bary.set(n.id, rows.length ? rows.reduce((s, r) => s + r, 0) / rows.length : idx);
      });
      columnNodes[part].sort(
        (a, b) =>
          bary.get(a.id)! - bary.get(b.id)! ||
          a.title.localeCompare(b.title) ||
          a.id.localeCompare(b.id),
      );
      reindex();
    }
  }

  return {
    columns: THREAD_PARTS.map((part) => ({
      part,
      nodes: columnNodes[part].map((node, row) => ({ node, row })),
    })),
    edges,
    capped,
  };
}
