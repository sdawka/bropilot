import { byKey } from "../canon";
import { linkKey, type Graph, type GraphLink, type GraphNode } from "../graph/graph";
import type { Slice } from "../meta/schema";
import { PAIR_SEPARATOR } from "./probe";

export interface SliceNode { id: string; kind: string; parent?: string; fields: Record<string, unknown>; provisional?: boolean }

export interface SliceState {
  candidate: { rule: string; text: string };
  subject: SliceNode | { id: string; missing: true };
  /** The second node of a pair subject `a|b`; `subject` is then `a`. */
  counterpart?: SliceNode | { id: string; missing: true };
  parents: SliceNode[];
  nodes: SliceNode[];
  links: GraphLink[];
}

/**
 * Splits a pair subject `a|b` into its two node ids. A subject that is itself a node is not a pair; otherwise the
 * first split whose halves are both nodes wins, else the first separator.
 */
export function pairOf(subject: string, isNode: (id: string) => boolean): [string, string] | undefined {
  if (isNode(subject) || !subject.includes(PAIR_SEPARATOR)) return undefined;
  const cuts: [string, string][] = [];
  for (let i = subject.indexOf(PAIR_SEPARATOR); i >= 0; i = subject.indexOf(PAIR_SEPARATOR, i + 1)) cuts.push([subject.slice(0, i), subject.slice(i + 1)]);
  return cuts.find(([a, b]) => isNode(a) && isNode(b)) ?? cuts[0];
}

/**
 * The bounded state for one candidate: subject, parent chain nearest first, and nodes reached within `hops` links.
 * A pair subject `a|b` gives `subject` a and `counterpart` b; parents and hops start from both.
 */
export function buildSlice(g: Graph, subjectId: string, spec: Slice, candidate: SliceState["candidate"]): SliceState {
  const byId = new Map<string, GraphNode>();
  for (const n of g.nodes) if (!byId.has(n.id)) byId.set(n.id, n);
  const pair = pairOf(subjectId, (id) => byId.has(id));
  const roots = pair ?? [subjectId];
  const subject = roots[0];
  const view = (n: GraphNode): SliceNode => ({
    id: n.id, kind: n.kind, ...(n.parent !== undefined && { parent: n.parent }),
    fields: spec.fields ? Object.fromEntries(spec.fields.filter((f) => f in n.fields).map((f) => [f, n.fields[f]])) : n.fields,
    ...(n.provisional && { provisional: true }),
  });
  const self = byId.get(subject);
  const shown = (id: string) => { const n = byId.get(id); return n ? view(n) : { id, missing: true as const }; };

  const parents: SliceNode[] = [];
  const seen = new Set(roots);
  for (const r of roots) {
    for (let p = spec.parents ? byId.get(r)?.parent : undefined; p !== undefined && !seen.has(p);) {
      seen.add(p);
      const n = byId.get(p);
      if (!n) break;
      parents.push(view(n));
      p = n.parent;
    }
  }

  const allowed = (id: string) => { const n = byId.get(id); return !!n && (!spec.kinds || spec.kinds.includes(n.kind)); };
  const follows = (l: GraphLink) => !spec.rels || spec.rels.includes(l.rel);
  const reached = new Set(roots);
  const links = new Map<string, GraphLink>();
  let frontier = new Set(roots);
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
  for (const r of roots) reached.delete(r);

  return {
    candidate,
    subject: self ? view(self) : { id: subject, missing: true },
    ...(pair && { counterpart: shown(pair[1]) }),
    parents,
    nodes: [...reached].sort().map((id) => view(byId.get(id)!)),
    links: [...links.values()].sort(byKey(linkKey)),
  };
}
