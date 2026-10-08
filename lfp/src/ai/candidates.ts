// Shared node-candidate pre-filter for System One decisions that resolve free text to a node by
// title (describe-screen, explain-node — AGENT-RUNTIME.md §9). Code narrows the whole graph down
// to a short, plausible list; Jev only ever picks among what's handed to it, never searches the
// graph itself. Substring-either-direction match (the query may be a fragment of the title, or the
// title may be a fragment of a longer query), longest title first — same heuristic both stubs used
// before the refactor.
import type { Node } from '../store.ts';

export function titleCandidates(query: string, nodes: Node[], limit = 40): Node[] {
  const lower = query.trim().toLowerCase();
  if (!lower) return [];
  return nodes
    .filter((n) => n.title.toLowerCase().includes(lower) || lower.includes(n.title.toLowerCase()))
    .sort((a, b) => b.title.length - a.title.length)
    .slice(0, limit);
}
