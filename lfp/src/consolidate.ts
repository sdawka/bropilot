// consolidate.ts — turns many small kernel violations into a handful of groups a human can answer
// in one shot, instead of one-question-per-violation. Pure over Violation[]/Graph (no state, no side
// effects), Node-runnable (imports only ./types.ts). store.ts::syncRaised() is the only caller.

import type { Graph, Violation, ViolationGroup } from './types.ts';

const COND_TAG = /^cond\d+$/;

function optionsOf(members: Violation[]): string[] {
  const out: string[] = [];
  for (const m of members) for (const o of m.options) if (!out.includes(o)) out.push(o);
  return out.slice(0, 4);
}
function producesOf(members: Violation[]): string | undefined {
  return members.find((m) => m.produces)?.produces;
}

/** Rule 1 (by subject) then rule 2 (by invariant across contains-siblings/kind) then singles.
 * Deterministic order: by each group's earliest member's position in `violations`. */
export function groupViolations(violations: Violation[], graph: Graph): ViolationGroup[] {
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const parentOf = (nodeId: string): string | undefined =>
    graph.edges.find((e) => e.type === 'contains' && e.dst === nodeId)?.src;
  const primarySubject = (v: Violation): string | undefined =>
    v.subjects.find((s) => !COND_TAG.test(s) && nodeById.has(s));

  const groups: ViolationGroup[] = [];
  const grouped = new Set<string>();

  // ── rule 1: violations sharing a subject node id ────────────────────────────────────────────
  const bySubject = new Map<string, Violation[]>();
  for (const v of violations) {
    const s = primarySubject(v);
    if (!s) continue;
    const list = bySubject.get(s);
    if (list) list.push(v); else bySubject.set(s, [v]);
  }
  for (const [nodeId, members] of bySubject) {
    if (members.length < 2) continue;
    const node = nodeById.get(nodeId)!;
    const lines = members.map((m) => `- ${m.message}`).join('\n');
    groups.push({
      id: `group:subject:${nodeId}`,
      violationIds: members.map((m) => m.id),
      subjects: [nodeId],
      message: `${members.length} gaps about "${node.title}":\n${lines}`,
      options: optionsOf(members),
      produces: producesOf(members),
      by: 'subject',
    });
    for (const m of members) grouped.add(m.id);
  }

  // ── rule 2: remaining violations, same invariant, siblings under the same `contains` parent
  // (or, with no parent, the same kind) ───────────────────────────────────────────────────────
  const remaining = violations.filter((v) => !grouped.has(v.id));
  const byInvariant = new Map<string, { invariant: string; parentOrKind: string; members: Violation[]; subjects: string[] }>();
  for (const v of remaining) {
    const s = primarySubject(v);
    if (!s) continue;
    const node = nodeById.get(s)!;
    const parentOrKind = parentOf(s) ?? node.kind;
    const key = `${v.invariant}|${parentOrKind}`;
    let entry = byInvariant.get(key);
    if (!entry) { entry = { invariant: v.invariant, parentOrKind, members: [], subjects: [] }; byInvariant.set(key, entry); }
    entry.members.push(v);
    if (!entry.subjects.includes(s)) entry.subjects.push(s);
  }
  for (const entry of byInvariant.values()) {
    if (entry.members.length < 2) continue;
    const kind = nodeById.get(entry.subjects[0])!.kind;
    const lines = entry.members.map((m) => `- ${m.message}`).join('\n');
    groups.push({
      id: `group:invariant:${entry.invariant}:${entry.parentOrKind}`,
      violationIds: entry.members.map((m) => m.id),
      subjects: entry.subjects,
      message: `${entry.members.length} ${kind} nodes fail ${entry.invariant}:\n${lines}`,
      options: optionsOf(entry.members),
      produces: producesOf(entry.members),
      by: 'invariant',
    });
    for (const m of entry.members) grouped.add(m.id);
  }

  // ── everything else: one group per violation, id === violation id ──────────────────────────
  for (const v of violations) {
    if (grouped.has(v.id)) continue;
    const s = primarySubject(v);
    groups.push({
      id: v.id,
      violationIds: [v.id],
      subjects: s ? [s] : v.subjects,
      message: v.message,
      options: v.options,
      produces: v.produces,
      by: 'single',
    });
  }

  const firstIndex = new Map<string, number>();
  violations.forEach((v, i) => { if (!firstIndex.has(v.id)) firstIndex.set(v.id, i); });
  groups.sort((a, b) => {
    const ai = Math.min(...a.violationIds.map((id) => firstIndex.get(id) ?? Number.MAX_SAFE_INTEGER));
    const bi = Math.min(...b.violationIds.map((id) => firstIndex.get(id) ?? Number.MAX_SAFE_INTEGER));
    return ai - bi;
  });

  return groups;
}
