/// <reference types="node" />
// Per variant: load check, changed nodes C, slice size, and for each declared counterpart
// inSlice, blocked-aware and raw min link hops from C, and family relation. Writes work/analysis.json.
// Run: node --experimental-transform-types --import <ts-resolve.mjs> analyze.ts
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { load, changedNodes, slice, hops, familyOf, BLOCKED, type G, type Link } from "./lib.ts";

/** One shortest blocked-aware link path from C to x, rendered as a-rel->b steps. */
function path(clean: G, v: G, C: Set<string>, removed: Link[], x: string): string | null {
  const kind = new Map<string, string>(); for (const n of [...clean.nodes, ...v.nodes]) kind.set(n.id, n.kind);
  const adj = new Map<string, [string, string][]>();
  const add = (a: string, b: string, r: string) => { if (!adj.has(a)) adj.set(a, []); adj.get(a)!.push([b, r]); };
  for (const l of [...v.links, ...removed]) { add(l.from, l.to, `-${l.rel}->`); add(l.to, l.from, `<-${l.rel}-`); }
  const prev = new Map<string, [string, string] | null>(); let fr = [...C]; for (const c of C) prev.set(c, null);
  while (fr.length && !prev.has(x)) { const nx: string[] = [];
    for (const u of fr) { if (BLOCKED.has(kind.get(u) ?? "?")) continue;
      for (const [w, r] of adj.get(u) ?? []) if (!prev.has(w)) { prev.set(w, [u, r]); nx.push(w); } }
    fr = nx; }
  if (!prev.has(x)) return null;
  const parts: string[] = [x]; let cur = x;
  while (prev.get(cur)) { const [u, r] = prev.get(cur)!; parts.unshift(u, r); cur = u; }
  return parts.join(" ");
}

const HB = dirname(dirname(fileURLToPath(import.meta.url)));
const CLEAN = join(dirname(HB), "killtest", "clean");
const meta = JSON.parse(readFileSync(join(HB, "work", "meta.json"), "utf8")) as Record<string, { key: string; cls: string; counterpart: string[]; changedSide: string[] }>;
const clean = load(CLEAN);
const out: Record<string, unknown> = {};
for (const [vid, m] of Object.entries(meta).sort((a, b) => a[1].key.localeCompare(b[1].key))) {
  let v;
  try { v = load(join(HB, "variants", vid)); } catch (e) { out[vid] = { key: m.key, loadError: String(e) }; console.log(m.key, "LOAD ERROR", e); continue; }
  const diffText = readFileSync(join(HB, "diffs", vid + ".diff"), "utf8");
  const { delta, C, fallback } = changedNodes(clean, v, diffText);
  const removed = delta.links.removed as { from: string; rel: string; to: string }[];
  const S = slice(clean, v, C, removed);
  const hb = hops(clean, v, C, removed, true), hr = hops(clean, v, C, removed, false);
  const ids = new Set(v.nodes.map((n) => n.id));
  const cps = m.counterpart.map((x) => ({
    id: x, exists: ids.has(x), inSlice: S.has(x), hopsBlocked: hb.get(x) ?? null, hopsRaw: hr.get(x) ?? null,
    family: familyOf(clean, v, C, x), path: path(clean, v, C, removed, x),
  }));
  const missingChanged = m.changedSide.filter((x) => !C.has(x));
  out[vid] = { key: m.key, cls: m.cls, nodes: v.nodes.length, links: v.links.length, C: [...C].sort(), changedCount: C.size, fallback,
    sliceSize: S.size, counterparts: cps, changedSideNotInC: missingChanged,
    added: delta.nodes.added, removedNodes: delta.nodes.removed,
    linksAdded: delta.links.added.length, linksRemoved: removed.length };
  console.log(m.key.padEnd(3), vid, `C=${C.size}`, `slice=${S.size}`, fallback ? "FALLBACK" : "",
    cps.map((c) => `${c.id}${c.exists ? "" : "(MISSING)"}:${c.inSlice ? "IN" : "out"}/b${c.hopsBlocked}/r${c.hopsRaw}${c.family ? "/" + c.family : ""}`).join("  "),
    missingChanged.length ? `!notInC ${missingChanged}` : "");
}
writeFileSync(join(HB, "work", "analysis.json"), JSON.stringify(out, null, 1));
