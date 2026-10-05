// LINKS (v4.3, a list per kind since v4.5, derived from kernel.ts RELATIONS since v4.5): the edges a
// template-produced node needs so it isn't born an orphan. Node-runnable (imports only kernel.ts) so
// scripts and the build can check it. Read by ai/functions/link-answer.ts, which proposes these
// edges for the nodes a just-staged answer added, and by checks.ts/store.ts (orphan repair options).
//
// `dir: 'in'` means target → edge → new node (audience has context); `'out'` means new node → edge →
// target. `many` means one new node may link to several candidates of the target kind (one yes/no per
// candidate); without it the rule picks one candidate or none. LINKS[kind] holds the rules proposed
// when a node of `kind` arrives (the RELATIONS row's `at` end); linkRulesFor(kind) holds every rule
// touching the kind, from its side. Kinds with no entry (name, purpose, summary, audience) are linked
// elsewhere, are singular, or are only ever linked from the later-asked end.
import { RELATIONS, type RelationDef } from '../kernel.ts';

export interface LinkRule { edge: string; dir: 'out' | 'in'; target: string; many?: boolean }

/** A RELATIONS row seen from one end. */
const fromSide = (r: RelationDef, side: 'src' | 'dst'): LinkRule =>
  (side === 'src' ? { edge: r.edge, dir: 'out', target: r.dst, many: r.many } : { edge: r.edge, dir: 'in', target: r.src, many: r.many });

export const LINKS: Record<string, LinkRule[]> = {};
for (const r of RELATIONS) {
  for (const side of ['src', 'dst'] as const) {
    if (r.at !== side && r.at !== 'both') continue;
    (LINKS[r[side]] ??= []).push(fromSide(r, side));
  }
}

/** src/dst of the edge a rule makes between a new node and one target. */
export const endpoints = (rule: LinkRule, nodeId: string, targetId: string) =>
  (rule.dir === 'out' ? { src: nodeId, dst: targetId } : { src: targetId, dst: nodeId });

/** Every rule a node of `kind` can be linked by, seen from its side: the rules proposed when it
 * arrives (LINKS) first, then every other RELATIONS row touching it (audience has no LINKS entry,
 * but context/usecase/problem rows touch it). Found 2026-09-28: an audience orphan offered nothing
 * to link to and blocked the template chain right after it was answered. */
export function linkRulesFor(kind: string): LinkRule[] {
  const own = LINKS[kind] ?? [];
  const key = (r: LinkRule) => `${r.edge}|${r.dir}|${r.target}`;
  const seen = new Set(own.map(key));
  const rest = RELATIONS.flatMap((r) => [
    ...(r.src === kind ? [fromSide(r, 'src')] : []),
    ...(r.dst === kind ? [fromSide(r, 'dst')] : []),
  ]).filter((r) => !seen.has(key(r)) && seen.add(key(r)));
  return [...own, ...rest];
}
