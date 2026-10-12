import { byKey } from "../canon";
import { linkKey, type Graph, type GraphLink, type GraphNode } from "../graph/graph";
import type { Slice } from "../meta/schema";

export interface SliceNode { id: string; kind: string; parent?: string; fields: Record<string, unknown>; provisional?: boolean }

export interface SliceState {
  candidate: { rule: string; text: string };
  subject: SliceNode | { id: string; missing: true };
  parents: SliceNode[];
  nodes: SliceNode[];
  links: GraphLink[];
}

/** The bounded state for one candidate: subject, parent chain nearest first, and nodes reached within `hops` links. */
export function buildSlice(g: Graph, subject: string, spec: Slice, candidate: SliceState["candidate"]): SliceState {
  const byId = new Map<string, GraphNode>();
  for (const n of g.nodes) if (!byId.has(n.id)) byId.set(n.id, n);
  const view = (n: GraphNode): SliceNode => ({
    id: n.id, kind: n.kind, ...(n.parent !== undefined && { parent: n.parent }),
    fields: spec.fields ? Object.fromEntries(spec.fields.filter((f) => f in n.fields).map((f) => [f, n.fields[f]])) : n.fields,
    ...(n.provisional && { provisional: true }),
  });
  const self = byId.get(subject);

  const parents: SliceNode[] = [];
  const seen = new Set([subject]);
  for (let p = spec.parents ? self?.parent : undefined; p !== undefined && !seen.has(p);) {
    seen.add(p);
    const n = byId.get(p);
    if (!n) break;
    parents.push(view(n));
    p = n.parent;
  }

  const allowed = (id: string) => { const n = byId.get(id); return !!n && (!spec.kinds || spec.kinds.includes(n.kind)); };
  const follows = (l: GraphLink) => !spec.rels || spec.rels.includes(l.rel);
  const reached = new Set([subject]);
  const links = new Map<string, GraphLink>();
  let frontier = new Set([subject]);
  for (let h = 0; h < spec.hops && frontier.size; h++) {
    const next = new Set<string>();
    for (const l of g.links) {
      if (!follows(l)) continue;
      const ends: [string, string][] = [];
      if (spec.direction !== "in" && frontier.has(l.from)) ends.push([l.from, l.to]);
      if (spec.direction !== "out" && frontier.has(l.to)) ends.push([l.to, l.from]);
      for (const [, other] of ends) {
        if (!allowed(other)) continue;
        links.set(linkKey(l), l);
        if (!reached.has(other)) { reached.add(other); next.add(other); }
      }
    }
    frontier = next;
  }
  reached.delete(subject);

  return {
    candidate,
    subject: self ? view(self) : { id: subject, missing: true },
    parents,
    nodes: [...reached].sort().map((id) => view(byId.get(id)!)),
    links: [...links.values()].sort(byKey(linkKey)),
  };
}
