// Replies built in code from a TurnResolution (SPEC §6: no LLM in v1). Navigate → jump; ask →
// ResultList over neighbours; explain → templated prose whose nouns are node refs; propose → a
// ChangesetCard from a tiny template; gap answers → a changeset from the kind's `needs`.
import type { Changeset, Effect, GraphApi, Node, PerspId, TurnResolution } from '../types';
import type { Ontology, OntoKind } from '../s1/onto';
import type { ResolveEnv, Held } from '../s1/resolve';
import { reactive } from 'vue';
import type { CheckScope, Family } from '../checks/types';
import { checksApi, worstFirst } from '../checks/applyRepair';
import { answerConfidence } from '../s1/decisionConfig';
import { flags } from '../flags';
import { S1, uid } from '../agents/timeline';
import { stripTokens } from '../s1/text';

export interface ResultRow { id: string; reason: string }
export type Part = string | { id: string };
export type ReplyPayload =
  | { type: 'jump' }
  | { type: 'results'; head: string; rows: ResultRow[]; gap?: { kind: string; parentId: string; question: string } }
  | { type: 'explain'; parts: Part[] }
  | { type: 'changeset'; changesetId: string }
  | { type: 'askback'; kind: string | null; question: string }
  | { type: 'checks'; head: string; resultIds: string[]; pending: boolean }
  | { type: 'none'; text: string };

export function makeEnv(g: GraphApi): ResolveEnv {
  return {
    byId: (id) => g.byId(id),
    resolvePath: (p, id) => { try { return g.resolvePath(p, id); } catch { return null; } },
    nodesOfKind: (k) => g.graph.value.nodes.filter((n) => n.kind === k),
    perspIds: [...g.perspectives.map((p) => p.id), 'raw'] as PerspId[],
  };
}

const kindOf = (o: Ontology, id: string): OntoKind | undefined => o.KINDS.find((k) => k.id === id);
export const kindLabel = (o: Ontology, id: string | null | undefined, plural = false) => {
  if (!id) return plural ? 'items' : 'item';
  const k = kindOf(o, id); return k ? (plural ? k.plural : k.label) : id;
};

/** "carries → Utterance" from `id`'s side. */
export function edgeReason(dir: 'out' | 'in', type: string, otherTitle: string, fromTitle: string): string {
  return dir === 'out' ? `${fromTitle} ─${type}→ it` : `it ─${type}→ ${fromTitle}`;
}

function resultsFor(r: TurnResolution, g: GraphApi, o: Ontology): ReplyPayload {
  const kindD = r.decisions.find((d) => d.key === 'kind');
  const wantKind = kindD && kindD.value !== 'none' && kindD.confidence >= 0.4 ? kindD.value : null;
  const nodeId = r.target?.path.at(-1);
  const node = nodeId ? g.byId(nodeId) : undefined;
  if (node) {
    const filter = wantKind && wantKind !== node.kind ? wantKind : null;
    const nb = g.neighbours(node.id);
    let rows: ResultRow[] = nb.filter((x) => !filter || x.other.kind === filter)
      .map((x) => ({ id: x.other.id, reason: edgeReason(x.dir, x.edge.type, x.other.title, node.title) }));
    if (filter && !rows.length) {
      // two hops: e.g. tests that verify a rule this interface carries
      const seen = new Set<string>();
      for (const a of nb) for (const b of g.neighbours(a.other.id)) {
        if (b.other.kind !== filter || b.other.id === node.id || seen.has(b.other.id)) continue;
        seen.add(b.other.id);
        rows.push({ id: b.other.id, reason: `via ${a.other.title} (${b.edge.type})` });
      }
    }
    const head = filter
      ? `${rows.length} ${kindLabel(o, filter, rows.length !== 1).toLowerCase()} linked to ${node.title}`
      : `${rows.length} neighbours of ${node.title}`;
    const need = filter ? (kindOf(o, node.kind)?.needs ?? []).find((n) => n.produces === filter) : undefined;
    return {
      type: 'results', head, rows,
      gap: !rows.length && filter ? { kind: filter, parentId: node.id, question: (need?.ask ?? `Which ${kindLabel(o, filter)} belongs to "{title}"?`).replace('{title}', node.title) } : undefined,
    };
  }
  if (r.nodeSet?.length) {
    const rows = r.nodeSet.map((id) => {
      const nb = g.neighbours(id);
      const types = [...new Set(nb.map((x) => x.edge.type))].slice(0, 3);
      return { id, reason: nb.length ? `${nb.length} edges · ${types.join(', ')}` : 'no edges · orphan' };
    }).sort((a, b) => (a.reason.startsWith('no') ? -1 : 0) - (b.reason.startsWith('no') ? -1 : 0));
    return { type: 'results', head: `${rows.length} ${kindLabel(o, wantKind, true).toLowerCase()}`, rows };
  }
  return { type: 'none', text: 'Nothing in the map matched.' };
}

function explainFor(r: TurnResolution, g: GraphApi, o: Ontology): ReplyPayload {
  const id = r.target?.path.at(-1);
  const node = id ? g.byId(id) : undefined;
  if (!node) return { type: 'none', text: 'I could not tell which item you mean.' };
  const k = kindOf(o, node.kind);
  const parts: Part[] = [{ id: node.id }, ` is ${/^[aeiou]/i.test(k?.label ?? '') ? 'an' : 'a'} ${(k?.label ?? node.kind).toLowerCase()}`];
  parts.push(node.description ? `: ${node.description} ` : k?.blurb ? ` (${k.blurb.replace(/\.$/, '')}). ` : '. ');
  const nb = g.neighbours(node.id);
  const groups = new Map<string, Node[]>();
  for (const x of nb) {
    const key = `${x.dir}:${x.edge.type}`;
    groups.set(key, [...(groups.get(key) ?? []), x.other]);
  }
  // reasons it exists first: what motivates / is satisfied / contains it
  const ranked = [...groups.entries()].sort(([a], [b]) => (a.startsWith('in') ? -1 : 1) - (b.startsWith('in') ? -1 : 1)).slice(0, 4);
  for (const [key, others] of ranked) {
    const [dir, type] = key.split(':');
    const list = others.slice(0, 4);
    const more = others.length - list.length;
    const chips: Part[] = list.flatMap((n, i) => [...(i ? [i === list.length - 1 && !more ? ' and ' : ', '] : []), { id: n.id }]);
    if (more) chips.push(` and ${more} more`);
    if (dir === 'in') parts.push(...chips, ` ${type} it. `);
    else parts.push(`It ${type} `, ...chips, '. ');
  }
  if (!nb.length) parts.push('Nothing links to it yet, so nothing in the map explains why it exists.');
  return { type: 'explain', parts };
}

// ── propose: "add an outcome for churn" → add-node + one edge from the best anchor ───────────────
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

export function proposeChangeset(text: string, r: TurnResolution, g: GraphApi, o: Ontology, ctxNode: Node | null, number: number): Changeset | null {
  const clean = stripTokens(text);
  const kindD = r.decisions.find((d) => d.key === 'kind');
  let kind = kindD && kindD.value !== 'none' ? kindD.value : null;
  if (!kind) {
    const m = clean.toLowerCase().match(/\b(?:add|create|propose|new)\s+(?:an?\s+|the\s+|another\s+)?([a-z-]+(?:\s[a-z-]+)?)/);
    kind = m ? (o.KINDS.find((k) => m[1].startsWith(k.label.toLowerCase()) || m[1].startsWith(k.id))?.id ?? null) : null;
  }
  if (!kind) return null;
  const k = kindOf(o, kind)!;
  const m = clean.match(/\b(?:for|called|named|about|to)\s+(.+)$/i) ?? clean.match(new RegExp(`${k.label}\\s+(.+)$`, 'i'));
  const what = (m?.[1] ?? 'new').replace(/[?.!]+$/, '').trim();
  const title = kind === 'outcome' ? `Less ${what}` : kind === 'metric' ? `${cap(what)} rate` : cap(what);
  const nodeId = `${kind}-${slug(title)}-draft`;
  const node: Node = { id: nodeId, kind, title, status: 'draft', description: `Proposed from chat: "${clean}"` };

  // anchor: the context node, then the resolved target, then a singular node, then any node, whose kind an edge type joins
  const nodes = g.graph.value.nodes;
  const fits = (anchor: Node) => o.EDGE_TYPES.map((e) =>
    e.from.includes(anchor.kind) && e.to.includes(kind!) ? { e, src: anchor.id, dst: nodeId }
    : e.from.includes(kind!) && e.to.includes(anchor.kind) ? { e, src: nodeId, dst: anchor.id } : null).find(Boolean) ?? null;
  const targetId = r.target?.path.at(-1);
  const pool: (Node | undefined)[] = [ctxNode ?? undefined, targetId ? g.byId(targetId) : undefined,
    ...nodes.filter((n) => kindOf(o, n.kind)?.singular), ...nodes];
  let link: ReturnType<typeof fits> = null; let anchor: Node | undefined;
  for (const a of pool) { if (a && a.id !== nodeId && (link = fits(a))) { anchor = a; break; } }

  const effects: Effect[] = [{ id: uid('fx'), op: 'add-node', node, verdict: 'pending' }];
  if (link) effects.push({ id: uid('fx'), op: 'add-edge', edge: { id: `e-${link.e.id}-${nodeId}`, src: link.src, dst: link.dst, type: link.e.id, status: 'draft' }, verdict: 'pending' });
  const messages = (k.needs ?? []).map((n) => `needs ${n.dir === 'out' ? '→' : '←'}${n.edge}${n.produces ? ` ${n.produces}` : ''} (kernel: ${k.label.toLowerCase()} needs ${n.edge})`);
  if (!link) messages.push(`no edge type joins a ${k.label.toLowerCase()} to anything selected`);
  const persp = g.perspectives.find((p) => p.steps.some((s) => s.kinds.includes(kind!)));
  return {
    id: uid('cs'), number, title: `Add ${k.label.toLowerCase()} “${title}”`, author: S1, status: 'open', effects,
    checks: { ok: link ? 1 : 0, warn: messages.length, messages },
    blast: `adds 1 ${k.label.toLowerCase()}${link ? ` · ${link.e.id} ${link.src === nodeId ? '→' : '←'} ${anchor?.title}` : ''}${persp ? ` · shows in ${persp.label}` : ''}`,
    createdAt: new Date().toISOString(),
  };
}

/** A QuestionStub answer: one node of the asked kind plus the `needs` edge back to the parent. */
export function gapChangeset(gap: { kind: string; parentId: string | null; question: string }, answer: string, g: GraphApi, o: Ontology, number: number): Changeset {
  const k = kindOf(o, gap.kind);
  const parent = gap.parentId ? g.byId(gap.parentId) : undefined;
  const titles = answer.split(/\n|;/).map((s) => s.trim()).filter(Boolean);
  const effects: Effect[] = [];
  for (const t of titles) {
    const id = `${gap.kind}-${slug(t)}-draft`;
    effects.push({ id: uid('fx'), op: 'add-node', node: { id, kind: gap.kind, title: t, status: 'draft' }, verdict: 'pending' });
    if (!parent) continue;
    const need = (kindOf(o, parent.kind)?.needs ?? []).find((n) => n.produces === gap.kind);
    let e = need ? { type: need.edge, src: need.dir === 'out' ? parent.id : id, dst: need.dir === 'out' ? id : parent.id } : null;
    if (!e) {
      const et = o.EDGE_TYPES.find((x) => x.from.includes(parent.kind) && x.to.includes(gap.kind))
        ?? o.EDGE_TYPES.find((x) => x.from.includes(gap.kind) && x.to.includes(parent.kind));
      if (et) e = et.from.includes(parent.kind) && et.to.includes(gap.kind) ? { type: et.id, src: parent.id, dst: id } : { type: et.id, src: id, dst: parent.id };
    }
    if (e) effects.push({ id: uid('fx'), op: 'add-edge', edge: { id: `e-${e.type}-${id}`, ...e, status: 'draft' }, verdict: 'pending' });
  }
  return {
    id: uid('cs'), number, title: `Answer: ${gap.question}`, author: S1, status: 'open', effects,
    checks: { ok: effects.length, warn: 0, messages: [] },
    blast: `adds ${titles.length} ${kindLabel(o, gap.kind, titles.length !== 1).toLowerCase()}${parent ? ` to ${parent.title}` : ''}`,
    createdAt: new Date().toISOString(),
  };
}

// ── check: run (or read) the checks for the target node, else the project (CHECKS-SPEC §4) ───────
const FAMILIES: Family[] = ['solidity', 'completeness', 'consistency'];
export function checkFamily(held?: Held): Family | null {
  const a = held?.response.answers['check-family'];
  if (!a || a.type !== 'choice' || answerConfidence(a) < 0.4) return null;
  return (FAMILIES as string[]).includes(a.choice) ? (a.choice as Family) : null;
}
export function checksReply(r: TurnResolution, g: GraphApi, held?: Held): ReplyPayload {
  const api = checksApi();
  const fam = checkFamily(held);
  const nodeId = r.target?.path.at(-1);
  const node = nodeId ? g.byId(nodeId) : undefined;
  const scope: CheckScope = { ...(node ? { nodeIds: [node.id] } : {}), ...(fam ? { families: [fam] } : {}) };
  const where = node ? `"${node.title}"` : (g.project.value?.name ?? 'this project');
  const famWord = fam ? `${fam} ` : '';
  const p = reactive({ type: 'checks' as const, head: `Checking ${famWord}on ${where}…`, resultIds: [] as string[], pending: true });
  const finish = (note = '') => {
    const pool = node ? api.forNode(node.id) : Object.values(api.results.value ?? {});
    const rs = pool.filter((x) => !fam || x.family === fam).sort(worstFirst);
    const n = (v: string) => rs.filter((x) => x.verdict === v).length;
    p.resultIds = rs.map((x) => x.id);
    const checksWord = (k: number) => `${famWord}check${k === 1 ? '' : 's'}`;
    p.head = !rs.length ? `No ${famWord}checks on ${where}${note}`
      : node ? `${rs.length} ${checksWord(rs.length)} on ${where}: ${n('solid')} solid, ${n('weak')} weak, ${n('broken')} broken${n('unknown') ? `, ${n('unknown')} unclear` : ''}${note}`
      : `Worst ${Math.min(8, rs.length)} of ${rs.length} ${checksWord(rs.length)} in ${where}${note}`;
    p.pending = false;
  };
  if (flags.checks === 'off') finish(' (checks are off: cached only)');
  else api.ensure(scope).then(() => finish(), () => finish(' (check failed)'));
  return p;
}

export function payloadFor(text: string, r: TurnResolution, g: GraphApi, o: Ontology, held?: Held): ReplyPayload {
  if (r.intent === 'none') return { type: 'askback', kind: null, question: 'I could not read that as a move, a question or a change. Which item do you mean?' };
  if (r.intent === 'propose') return { type: 'none', text: '' }; // the store stages the changeset
  if (r.band === 'ask') {
    const kd = r.decisions.find((d) => d.key === 'kind');
    const kind = kd && kd.value !== 'none' ? kd.value : null;
    return { type: 'askback', kind, question: `Which ${kindLabel(o, kind).toLowerCase()} do you mean?` };
  }
  if (r.intent === 'navigate') return { type: 'jump' };
  if (r.intent === 'check') return checksReply(r, g, held);
  if (r.intent === 'ask') return resultsFor(r, g, o);
  return explainFor(r, g, o);
}
