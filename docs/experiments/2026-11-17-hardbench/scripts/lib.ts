/// <reference types="node" />
// Independent implementation of the pre-registered slice rule S
// (docs/experiments/2026-11-17-test-set/slice_preregistration.txt) plus hop-distance helpers.
import { loadArtyfactSystem } from "/Users/sdawka/Code/bropilot/packages/ontology-engine/src/adapters/artyfact/graph.ts";
import { readDir } from "/Users/sdawka/Code/bropilot/packages/ontology-engine/src/adapters/artyfact/node.ts";
import { diff } from "/Users/sdawka/Code/bropilot/packages/ontology-engine/src/evaluate/diff.ts";

export const TEMPLATES = "/Users/sdawka/Code/artyfact-cf/packages/templates";
export const BLOCKED = new Set(["system", "thing", "section", "template", "kit"]);

export interface Node { id: string; kind: string; parent?: string; fields: Record<string, unknown>; provisional?: boolean }
export interface Link { from: string; rel: string; to: string }
export interface G { nodes: Node[]; links: Link[] }

let tpl: Record<string, string> | undefined;
export function load(dir: string): G {
  tpl ??= readDir(TEMPLATES);
  return loadArtyfactSystem(readDir(dir), { templates: tpl }) as unknown as G;
}

export function changedNodes(clean: G, variant: G, diffText?: string) {
  const d = diff(clean, variant);
  const C = new Set<string>([...d.nodes.added, ...d.nodes.removed, ...d.nodes.changed.map((c) => c.id)]);
  for (const l of [...d.links.added, ...d.links.removed, ...d.links.changed]) { C.add(l.from); C.add(l.to); }
  let fallback = false;
  if (!C.size && diffText) {
    fallback = true;
    const ids = new Set([...clean.nodes, ...variant.nodes].map((n) => n.id));
    for (const id of ids) if (diffText.includes(id)) C.add(id);
  }
  return { delta: d, C, fallback };
}

/** Kind/parent lookup over G_var, falling back to G_clean for removed nodes. */
function index(clean: G, variant: G) {
  const byId = new Map<string, Node>();
  for (const n of clean.nodes) byId.set(n.id, n);
  for (const n of variant.nodes) byId.set(n.id, n);
  return byId;
}

/** Undirected adjacency over links of G_var plus links removed from G_clean. */
function adjacency(clean: G, variant: G, removedLinks: Link[]) {
  const adj = new Map<string, Set<string>>();
  const add = (a: string, b: string) => { if (!adj.has(a)) adj.set(a, new Set()); adj.get(a)!.add(b); };
  for (const l of [...variant.links, ...removedLinks]) { add(l.from, l.to); add(l.to, l.from); }
  return adj;
}

export function slice(clean: G, variant: G, C: Set<string>, removedLinks: Link[]) {
  const byId = index(clean, variant);
  const adj = adjacency(clean, variant, removedLinks);
  const S = new Set<string>(C);
  const kindOf = (id: string) => byId.get(id)?.kind ?? "?";
  for (const c of C) {
    // ancestors
    let p = byId.get(c)?.parent; const guard = new Set<string>();
    while (p && !guard.has(p)) { guard.add(p); S.add(p); p = byId.get(p)?.parent; }
  }
  // direct children (in G_var, plus removed nodes from G_clean)
  for (const n of byId.values()) if (n.parent && C.has(n.parent)) S.add(n.id);
  // 2 hops, blocked kinds reachable but not expanded (including blocked members of C)
  void adj; void kindOf;
  for (const [v, d] of hops(clean, variant, C, removedLinks, true)) if (d <= 2) S.add(v);
  return S;
}

/** BFS link-hop distance from set C to every node. blocked=true applies the slice's no-expansion rule. */
export function hops(clean: G, variant: G, C: Set<string>, removedLinks: Link[], blocked = true) {
  const byId = index(clean, variant);
  const adj = adjacency(clean, variant, removedLinks);
  const dist = new Map<string, number>();
  let frontier = [...C]; for (const c of C) dist.set(c, 0);
  let d = 0;
  while (frontier.length) {
    d++;
    const next: string[] = [];
    for (const u of frontier) {
      if (blocked && BLOCKED.has(byId.get(u)?.kind ?? "?")) continue;
      for (const v of adj.get(u) ?? []) if (!dist.has(v)) { dist.set(v, d); next.push(v); }
    }
    frontier = next;
  }
  return dist;
}

/** True if x is an ancestor of, or direct child of, some node in C. */
export function familyOf(clean: G, variant: G, C: Set<string>, x: string) {
  const byId = index(clean, variant);
  if (byId.get(x)?.parent && C.has(byId.get(x)!.parent!)) return "child";
  for (const c of C) {
    let p = byId.get(c)?.parent; const guard = new Set<string>();
    while (p && !guard.has(p)) { if (p === x) return "ancestor"; guard.add(p); p = byId.get(p)?.parent; }
  }
  return null;
}
