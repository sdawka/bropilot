// CHECKS-SPEC §2: the 23 checks. Each entry plans units (questions built from literal phrasing), resolves
// answers into a verdict in code, and answers its own questions deterministically when offline. Pure.
import type { Band, Edge, Node, S1Answer, S1Question } from '../types';
import { answerConfidence, bandFor, minConfidence, thresholdFor } from '../s1/decisionConfig';
import { containsPhrase, overlap, tokens } from '../s1/text';
import type { CheckDef, CheckId, CheckResult, CheckUnit, Family, PlanCtx, Repair, Verdict } from './types';
import { cap, clip, conditionsOf, EX, isSemantic, lastTwoPathSegments, phr, STAGE_WORDS } from './phrasing';
import { noulConf, noulOf, nounVerdict, rollup, type Resolved } from './resolve';
import { choiceAt, fakeChoice, fakeNoul } from './fake';

// ── small helpers ────────────────────────────────────────────────────────────────────────────────
const c2 = (x: number) => x.toFixed(2);
const qt = (s: string) => `"${clip(s, 80)}"`;
const txt = (n: Node | undefined) => (n ? `${n.title} ${n.description ?? ''}` : '');
const byIdSort = (a: Node, b: Node) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const uniq = <T,>(xs: T[]) => [...new Set(xs)];
const ghost = (id: string): Node => ({ id, kind: 'unknown', title: id, status: 'draft' });

const edgeMaps = new WeakMap<PlanCtx, Map<string, Edge>>();
export function edgeById(ctx: PlanCtx, id: string): Edge | undefined {
  let m = edgeMaps.get(ctx);
  if (!m) { m = new Map(ctx.graph.edges.map((e) => [e.id, e])); edgeMaps.set(ctx, m); }
  return m.get(id);
}
const node = (ctx: PlanCtx, id: string | undefined) => (id && ctx.byId.get(id)) || ghost(id ?? '?');
const nodesOf = (ctx: PlanCtx, kind: string) => ctx.graph.nodes.filter((n) => n.kind === kind && ctx.byId.has(n.id)).sort(byIdSort);
const outE = (ctx: PlanCtx, id: string, type?: string) => (ctx.out.get(id) ?? []).filter((e) => !type || e.type === type);
const inE = (ctx: PlanCtx, id: string, type?: string) => (ctx.in.get(id) ?? []).filter((e) => !type || e.type === type);
const linked = (ctx: PlanCtx, src: string, type: string, dst: string) => outE(ctx, src, type).some((e) => e.dst === dst);

function mkUnit(checkId: CheckId, family: Family, subjects: string[], qs: S1Question | [string, S1Question][],
  meta: Record<string, string | string[]> = {}, code?: CheckUnit['code']): CheckUnit {
  const key = `${checkId}|${subjects.join(',')}`;
  let questions: Record<string, S1Question> = {};
  if (Array.isArray(qs)) {
    meta = { ...meta, slots: qs.map(([s]) => s) };
    if (!code) questions = qs.length === 1 ? { [key]: qs[0][1] } : Object.fromEntries(qs.map(([s, q]) => [`${key}|${s}`, q]));
  } else if (!code) questions = { [key]: qs };
  return { key, checkId, family, subjects, questions, meta, ...(code ? { code } : {}) };
}
const slotsOf = (u: CheckUnit) => (u.meta.slots as string[] | undefined) ?? [];
/** Question key of one slot: unit.key for a single question, `${unit.key}|${slot}` otherwise. */
export const slotKey = (u: CheckUnit, slot: string) => (slotsOf(u).length > 1 ? `${u.key}|${slot}` : u.key);
const m1 = (u: CheckUnit, k: string) => u.meta[k] as string;
const mN = (u: CheckUnit, k: string) => (u.meta[k] as string[] | undefined) ?? [];

/** First repair is primary; duplicates (same op and target) dropped. */
export function prim(rs: Repair[]): Repair[] {
  const seen = new Set<string>();
  const out: Repair[] = [];
  for (const r of rs) {
    const { label, primary: _p, ...rest } = r;
    const k = JSON.stringify(rest);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push((out.length === 0 ? { ...rest, label, primary: true } : { ...rest, label }) as Repair);
  }
  return out;
}
const R = {
  remove: (edgeId: string): Repair => ({ label: 'Remove this link', op: 'remove-edge', edgeId }),
  retype: (edgeId: string, to: string, label: string): Repair => ({ label: `Change to ${label}`, op: 'retype-edge', edgeId, to }),
  add: (label: string, src: string, dst: string, type: string): Repair => ({ label, op: 'add-edge', src, dst, type }),
  ask: (text: string, nodeIds: string[], kind: string | null = null): Repair => ({ label: text, op: 'question', text, nodeIds, kind }),
  update: (label: string, nodeId: string, props: Record<string, string>): Repair => ({ label, op: 'update-node', nodeId, props }),
  ok: (label = 'It is right'): Repair => ({ label, op: 'mark-reviewed' }),
};
function out(u: CheckUnit, verdict: Verdict, finding: string, confidence: number, band: Band,
  answers: Record<string, S1Answer>, evidence: string, repairs: Repair[]): Resolved {
  // §2.2: only weak|broken carry remove/retype/add/update/merge; unknown gets a question and mark-reviewed only
  // (sol-retype's verdict is a placeholder: its repairs fold into the parent)
  if (verdict === 'unknown' && u.checkId !== 'sol-retype') {
    repairs = repairs.filter((r) => r.op === 'question' || r.op === 'mark-reviewed');
    if (!repairs.some((r) => r.op === 'mark-reviewed')) repairs.push(R.ok());
  }
  return { id: u.key, checkId: u.checkId, family: u.family, subjects: u.subjects, verdict, finding,
    confidence: +confidence.toFixed(4), band, answers, evidence, repairs: prim(repairs) };
}
const pick = (answers: Record<string, S1Answer>, keys: string[]) => Object.fromEntries(keys.filter((k) => k in answers).map((k) => [k, answers[k]]));

// ── routing ──────────────────────────────────────────────────────────────────────────────────────
/** Each SEMANTIC edge goes to exactly one check (first match wins); code-only types → null. */
export function routeEdge(e: Edge, ctx: PlanCtx): CheckId | null {
  if (!isSemantic(e.type)) return null;
  const s = ctx.byId.get(e.src)?.kind ?? '', d = ctx.byId.get(e.dst)?.kind ?? '';
  if (e.type === 'satisfies') return 'sol-satisfies';
  if (e.type === 'implements' && ['agent', 'flow', 'screen'].includes(s) && ['capability', 'feature'].includes(d)) return 'sol-implements';
  if (e.type === 'verifies') return 'sol-verifies';
  if (e.type === 'supports' || e.type === 'refutes') return 'sol-evidence';
  if (e.type === 'monitors') return 'sol-monitors';
  if (e.type === 'realises') return 'sol-realises';
  if (e.type === 'references' && s === 'hypothesis' && d === 'metric') return 'sol-bet-metric';
  if (e.type === 'motivates' && s === 'purpose') return 'cmp-purpose-outcome';
  return 'sol-edge';
}

// ── solidity ─────────────────────────────────────────────────────────────────────────────────────
const SOL_FIND: Record<Verdict, string> = { solid: 'holds', weak: 'doubtful', broken: 'does-not-hold', unknown: 'unclear' };
const SOL_WORD: Record<string, string> = { holds: 'holds', doubtful: 'doubtful', 'does-not-hold': 'does not hold', unclear: 'unclear' };
type Ends = { e: Edge; src: Node; dst: Node };
function ends(u: CheckUnit, ctx: PlanCtx): Ends {
  const e = edgeById(ctx, m1(u, 'edgeId')) ?? { id: m1(u, 'edgeId'), src: u.subjects[1], dst: u.subjects[2], type: 'references' };
  return { e, src: node(ctx, e.src), dst: node(ctx, e.dst) };
}
const edgeUnit = (id: CheckId, e: Edge, q: S1Question) => mkUnit(id, 'solidity', [`edge:${e.id}`, e.src, e.dst], q, { edgeId: e.id });
const noulQ = (instructions: string, t: [string, string], f: [string, string]): S1Question =>
  ({ type: 'noul', instructions, criteria: { true: { definition: t[0], examples: [t[1]] }, false: { definition: f[0], examples: [f[1]] } } });

function solNoul(id: CheckId, label: string, question: (x: Ends, ctx: PlanCtx) => S1Question, fake: (x: Ends) => S1Answer,
  ask?: (x: Ends) => Repair): CheckDef {
  return {
    id, family: 'solidity', label, findings: ['holds', 'doubtful', 'does-not-hold', 'unclear'],
    plan: (ctx) => ctx.graph.edges.filter((e) => ctx.byId.has(e.src) && ctx.byId.has(e.dst) && routeEdge(e, ctx) === id)
      .map((e) => edgeUnit(id, e, question({ e, src: node(ctx, e.src), dst: node(ctx, e.dst) }, ctx))),
    resolve(u, answers, ctx) {
      const x = ends(u, ctx);
      const p = noulOf(answers[u.key]), t = thresholdFor(id), conf = noulConf(p), band = bandFor(conf, t);
      const verdict = nounVerdict(p, t, 'yes-good'), finding = SOL_FIND[verdict];
      const evidence = `${qt(x.src.title)} ${phr(ctx.onto).label(x.e.type)} ${qt(x.dst.title)}: ${SOL_WORD[finding]} (${c2(conf)})`;
      const extra = ask ? [ask(x)] : [];
      const unsure = R.ask(`Is it right that "${x.src.title}" ${phr(ctx.onto).label(x.e.type)} "${x.dst.title}"?`, [x.src.id, x.dst.id], null);
      const repairs = verdict === 'solid' ? [] : verdict === 'unknown'
        ? [extra[0] ?? unsure, R.ok()] : [R.remove(x.e.id), ...extra, R.ok()];
      return out(u, verdict, finding, conf, band, pick(answers, [u.key]), evidence, repairs);
    },
    fake: (u, ctx) => ({ [u.key]: fake(ends(u, ctx)) }),
  };
}
const fakeTD = (x: Ends) => fakeNoul(txt(x.src), txt(x.dst));

const solEdge = solNoul('sol-edge', 'Link holds?', ({ e, src, dst }, ctx) => {
  const P = phr(ctx.onto), et = P.label(e.type), ex = EX[e.type] ?? { yes: '', no: '' };
  return noulQ(`In a product description, "${et}" means: ${P.hintOf(e.type)}\nClaim: ${P.T(src)} ${et} ${P.T(dst)}.${P.D(src)}${P.D(dst)}\nDoes the claim hold, judging only from these words?`,
    [`The words show that the ${P.l(src.kind)} ${et} the ${P.l(dst.kind)}, in the sense defined.`, ex.yes],
    ['The words do not show it: the two items are about different things, or the relation is a different one.', ex.no]);
}, fakeTD);

const solSatisfies = solNoul('sol-satisfies', 'Satisfies?', ({ src, dst }, ctx) => {
  const P = phr(ctx.onto);
  return dst.kind === 'usecase'
    ? noulQ(`Does the ${P.l(src.kind)} "${src.title}" help someone get the use case "${dst.title}" done?${P.D(src)}${P.D(dst)}`,
      [`Someone doing this use case would use this ${P.l(src.kind)} to get it done.`, 'Capability "Scan a receipt" and use case "File this month\'s expenses".'],
      [`The ${P.l(src.kind)} plays no part in getting this use case done.`, 'Capability "Scan a receipt" and use case "Invite a teammate".'])
    : noulQ(`Does the ${P.l(src.kind)} "${src.title}" remove or reduce the problem "${dst.title}"?${P.D(src)}${P.D(dst)}`,
      [`Having this ${P.l(src.kind)} removes or reduces this obstacle for the people who face it.`, 'Capability "Scan a receipt" and problem "Typing expenses by hand takes too long".'],
      [`The ${P.l(src.kind)} does not touch this obstacle, even when both are about the same area.`, 'Capability "Scan a receipt" and problem "Reports are hard to share with the accountant".']);
}, fakeTD);

const solImplements = solNoul('sol-implements', 'Implements?', ({ src, dst }, ctx) => {
  const P = phr(ctx.onto);
  return noulQ(`Is ${P.T(src)} a concrete part of how ${P.T(dst)} is delivered: doing it, showing it or running it?${P.D(src)}${P.D(dst)}`,
    ['The first item exists to carry out the second: someone using it is using the second.', 'Screen "Receipt camera" implements capability "Scan a receipt".'],
    ['The first item serves a different capability or feature, even in the same area.', 'Screen "Team settings" does not implement capability "Scan a receipt".']);
}, fakeTD);

const solVerifies = solNoul('sol-verifies', 'Test checks rule?', ({ src, dst }, ctx) => {
  const P = phr(ctx.onto);
  return noulQ(`Does the test "${src.title}" check a condition of the rule "${dst.title}"?${P.F(src, 'condition')}${P.conds(dst)}`,
    ['Running the test would show whether the rule holds in at least one case: it passes when the rule is obeyed and fails when it is broken.', 'Test "Double booking is rejected" verifies rule "A slot has at most one appointment".'],
    ['The test checks something else; the rule could be broken and the test still pass.', 'Test "Login page loads" does not verify rule "A slot has at most one appointment".']);
}, ({ src, dst }) => fakeNoul(`${src.title} ${src.props?.condition ?? ''}`, `${dst.title} ${conditionsOf(dst).join(' ')}`));

const solMonitors = solNoul('sol-monitors', 'Metric shows outcome?', ({ src, dst }, ctx) => {
  const P = phr(ctx.onto);
  return noulQ(`If the outcome "${dst.title}" happened for real, would the metric "${src.title}" show it?${P.F(dst, 'metric')}${P.D(dst)}`,
    ['The number moves when the outcome is reached and stays put when it is not.', 'Metric "No-show rate" monitors outcome "Fewer missed appointments".'],
    ['The number tracks something else, or only a side effect of the outcome.', 'Metric "Signup conversion" does not monitor outcome "Fewer missed appointments".']);
}, fakeTD, ({ dst }) => R.ask(`How will you know "${dst.title}" happened? Name one metric.`, [dst.id], 'metric'));

const solRealises = solNoul('sol-realises', 'Realised here?', ({ src, dst }, ctx) => {
  const P = phr(ctx.onto);
  return noulQ(`Is ${P.T(src)}${src.props?.codeRef ? ` (at ${lastTwoPathSegments(src.props.codeRef)})` : ''} where ${P.T(dst)} actually exists in reality?${P.D(src)}${P.D(dst)}`,
    ['This code, infrastructure or practice is the real-world form of the item: change it and the item changes.', 'Code "billing-service (Go)" realises module "Billing".'],
    ['It is a different part of reality; the item lives elsewhere or nowhere yet.', 'Code "marketing site" does not realise module "Billing".']);
}, fakeTD);

const solBetMetric = solNoul('sol-bet-metric', 'Metric shows bet?', ({ src, dst }) =>
  noulQ(`Would the metric "${dst.title}" show whether the bet "${src.title}" holds?`,
    ['The metric measures whether the bet holds: if the bet is right, this number moves.', 'Bet "Reminders cut missed appointments" and metric "No-show rate".'],
    ['The metric measures something the bet does not claim to change.', 'Bet "Reminders cut missed appointments" and metric "Signup conversion".']),
fakeTD, ({ src }) => R.ask(`How would you know "${src.title}" holds? Name one metric.`, [src.id], 'metric'));

const EVIDENCE_OPTS = ['supports', 'refutes', 'unrelated'];
const solEvidence: CheckDef = {
  id: 'sol-evidence', family: 'solidity', label: 'Evidence direction', findings: ['agrees', 'opposite', 'unrelated', 'unclear'],
  plan: (ctx) => ctx.graph.edges.filter((e) => ctx.byId.has(e.src) && ctx.byId.has(e.dst) && routeEdge(e, ctx) === 'sol-evidence').map((e) => {
    const P = phr(ctx.onto), src = node(ctx, e.src), dst = node(ctx, e.dst);
    return edgeUnit('sol-evidence', e, { type: 'choice', instructions: `What does the evidence "${src.title}" say about the bet "${dst.title}"?${P.D(src)}${P.D(dst)}`,
      criteria: { supports: 'It makes the bet more likely to be true: what the bet predicts was observed.',
        refutes: 'It makes the bet less likely: the opposite of what the bet predicts was observed.',
        unrelated: 'It is about something the bet does not itself claim, such as an assumption behind it or a different feature.' } });
  }),
  resolve(u, answers, ctx) {
    const { e, src, dst } = ends(u, ctx);
    const a = answers[u.key], choice = a?.type === 'choice' ? a.choice : 'unrelated';
    const conf = a ? answerConfidence(a) : 0, band = bandFor(conf, thresholdFor('sol-evidence'));
    const finding = band === 'ask' ? 'unclear' : choice === e.type ? 'agrees' : choice === 'unrelated' ? 'unrelated' : 'opposite';
    const verdict: Verdict = band === 'ask' ? 'unknown' : band === 'offer' ? 'weak' : finding === 'agrees' ? 'solid' : 'broken';
    const word = { agrees: 'agrees', opposite: `points the other way (${choice})`, unrelated: 'looks unrelated', unclear: 'unclear' }[finding];
    const repairs: Repair[] = [];
    if (verdict !== 'solid') {
      if (finding === 'opposite') repairs.push(R.retype(e.id, choice, phr(ctx.onto).label(choice)));
      if (finding === 'unrelated') for (const r of inE(ctx, dst.id, 'references')) {
        const as = ctx.byId.get(r.src);
        if (as?.kind === 'assumption') repairs.push(R.ask(`Is "${src.title}" about the bet or about the assumption "${as.title}"?`, [src.id, dst.id, as.id], null));
      }
      if (verdict === 'unknown') repairs.push(R.ask(`Does "${src.title}" support or refute "${dst.title}", or neither?`, [src.id, dst.id], null));
      repairs.push(R.remove(e.id), R.ok());
    }
    return out(u, verdict, finding, conf, band, pick(answers, [u.key]), `${qt(src.title)} ${e.type} ${qt(dst.title)}: ${word} (${c2(conf)})`, repairs);
  },
  fake(u, ctx) {
    const { e, src, dst } = ends(u, ctx);
    return { [u.key]: choiceAt(EVIDENCE_OPTS, overlap(tokens(txt(src)), tokens(txt(dst))) >= 1 ? e.type : 'unrelated', 0.5) };
  },
};

/** sol-retype unit for a weak|broken solidity result (§2.2): keep | each legal SEMANTIC alternative | none. */
export function retypeUnit(parent: CheckResult, ctx: PlanCtx): CheckUnit | null {
  const sub = parent.subjects[0] ?? '';
  if (!sub.startsWith('edge:')) return null;
  const e = edgeById(ctx, sub.slice(5));
  if (!e) return null;
  const P = phr(ctx.onto), src = node(ctx, e.src), dst = node(ctx, e.dst), et = P.label(e.type);
  const ALT = ctx.onto.EDGE_TYPES.filter((a) => a.id !== e.type && a.from.includes(src.kind) && a.to.includes(dst.kind) && isSemantic(a.id));
  return mkUnit('sol-retype', 'solidity', parent.subjects, { type: 'choice',
    instructions: `${cap(P.T(src))} and ${P.T(dst)} are linked as "${et}", which may be wrong. Which relation fits them best? Pick none if they should not be linked at all.${P.D(src)}${P.D(dst)}`,
    criteria: { keep: `Keep "${et}": ${P.hintOf(e.type)}`, ...Object.fromEntries(ALT.map((a) => [a.id, `${a.label}: ${P.hintOf(a.id)}`])), none: 'They should not be linked' } },
  { edgeId: e.id, parent: parent.id });
}
const solRetype: CheckDef = {
  id: 'sol-retype', family: 'solidity', label: 'Better relation', findings: ['keep', 'retype', 'unlink', 'unclear'],
  plan: () => [],
  resolve(u, answers, ctx) {
    const { e } = ends(u, ctx), P = phr(ctx.onto);
    const a = answers[u.key], choice = a?.type === 'choice' ? a.choice : 'keep';
    const conf = a ? answerConfidence(a) : 0, band = bandFor(conf, thresholdFor('sol-retype'));
    const finding = band === 'ask' ? 'unclear' : choice === 'keep' ? 'keep' : choice === 'none' ? 'unlink' : 'retype';
    const probs = a?.type === 'choice' ? a.probabilities : {};
    const toRepair = (o: string) => (o === 'keep' ? R.ok() : o === 'none' ? R.remove(e.id) : R.retype(e.id, o, P.label(o)));
    const alts = Object.entries(probs).filter(([k, p]) => k !== 'keep' && k !== 'none' && p >= 0.25).sort((x, y) => y[1] - x[1]);
    const std = [R.remove(e.id), ...alts.map(([k]) => R.retype(e.id, k, P.label(k))), R.ok()];
    const top2 = Object.entries(probs).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k]) => toRepair(k));
    const repairs = band === 'act' ? [toRepair(choice), ...std] : band === 'offer' ? [...top2, ...std] : std;
    const evidence = band === 'ask' || choice === 'keep' ? '' : choice === 'none'
      ? ` · should not be linked (${c2(conf)})` : ` · fits better: ${P.label(choice)} (${c2(conf)})`;
    return out(u, 'unknown', finding, conf, band, pick(answers, [u.key]), evidence, repairs);
  },
  fake: (u) => {
    const q = Object.values(u.questions)[0];
    return { [u.key]: choiceAt(q && q.type === 'choice' ? Object.keys(q.criteria) : ['keep', 'none'], 'keep', 0.3) };
  },
};

// ── completeness ─────────────────────────────────────────────────────────────────────────────────
const cmpNeed: CheckDef = {
  id: 'cmp-need', family: 'completeness', label: 'Need met?', findings: ['link-candidate', 'missing'],
  plan(ctx) {
    const P = phr(ctx.onto), units: CheckUnit[] = [];
    const kinds = new Map(ctx.onto.KINDS.map((k) => [k.id, k]));
    for (const n of [...ctx.graph.nodes].sort(byIdSort)) {
      for (const need of kinds.get(n.kind)?.needs ?? []) {
        const mine = need.dir === 'out' ? outE(ctx, n.id, need.edge) : inE(ctx, n.id, need.edge);
        if (mine.length >= need.min) continue;
        const et = ctx.onto.EDGE_TYPES.find((x) => x.id === need.edge);
        const candKinds = need.produces ? [need.produces] : (need.dir === 'out' ? et?.to : et?.from) ?? [];
        const produces = candKinds[0] ?? '';
        const have = new Set(mine.map((e) => (need.dir === 'out' ? e.dst : e.src)));
        const nt = tokens(txt(n));
        const CAND = ctx.graph.nodes.filter((c) => candKinds.includes(c.kind) && c.id !== n.id && !have.has(c.id))
          .map((c) => ({ c, o: overlap(nt, tokens(txt(c))) })).sort((a, b) => b.o - a.o || byIdSort(a.c, b.c)).slice(0, 12).map((x) => x.c);
        const ask = need.ask.replace('{title}', n.title);
        const meta = { node: n.id, edge: need.edge, dir: need.dir, produces, ask, cands: CAND.map((c) => c.id) };
        const subjects = [n.id, need.edge];
        if (!CAND.length) {
          units.push(mkUnit('cmp-need', 'completeness', subjects, [], meta, { verdict: 'broken', finding: 'missing',
            evidence: `${qt(n.title)} has no ${P.l(produces)}, and there is none to link`, repairs: prim([R.ask(ask, [n.id], produces || null), R.ok('Not needed here')]) }));
          continue;
        }
        units.push(mkUnit('cmp-need', 'completeness', subjects, { type: 'choice',
          instructions: `${cap(P.T(n))} needs a "${need.edge}" link: ${ask}\nWhich of these ${P.l(produces)} items is it? Pick none if none of them fits.${P.D(n)}`,
          criteria: { ...Object.fromEntries(CAND.map((c) => [c.id, `${clip(c.title, 80)}${c.description ? ` — ${clip(c.description, 80)}` : ''}`])), none: 'None of these; a new one is needed' } }, meta));
      }
    }
    return units;
  },
  resolve(u, answers, ctx) {
    const P = phr(ctx.onto), n = node(ctx, m1(u, 'node')), produces = m1(u, 'produces'), cands = mN(u, 'cands');
    const a = answers[u.key], choice = a?.type === 'choice' ? a.choice : 'none';
    const conf = a ? answerConfidence(a) : 0, band = bandFor(conf, thresholdFor('cmp-need'));
    const finding = band !== 'ask' && choice !== 'none' ? 'link-candidate' : 'missing';
    const link = (cid: string) => R.add(`Link to "${node(ctx, cid).title}"`, m1(u, 'dir') === 'out' ? n.id : cid, m1(u, 'dir') === 'out' ? cid : n.id, m1(u, 'edge'));
    const ask = R.ask(m1(u, 'ask'), [n.id], produces || null), ok = R.ok('Not needed here');
    const probs = a?.type === 'choice' ? a.probabilities : {};
    const top3 = Object.entries(probs).filter(([k]) => k !== 'none' && cands.includes(k)).sort((x, y) => y[1] - x[1]).slice(0, 3).map(([k]) => link(k));
    const repairs = band === 'act' ? (choice !== 'none' ? [link(choice), ask, ok] : [ask, ok]) : band === 'offer' ? [...top3, ask, ok] : [ask, ok];
    const evidence = band === 'ask' ? `${qt(n.title)} has no ${P.l(produces)}; unclear which of ${cands.length} fits (${c2(conf)})`
      : choice === 'none' ? `${qt(n.title)} has no ${P.l(produces)}, none of ${cands.length} fits (${c2(conf)})`
      : `${qt(n.title)} has no ${P.l(produces)}; ${qt(node(ctx, choice).title)} may fit (${c2(conf)})`;
    return out(u, 'broken', finding, conf, band, pick(answers, [u.key]), evidence, repairs);
  },
  fake(u, ctx) {
    const n = node(ctx, m1(u, 'node')), cands = mN(u, 'cands'), keys = [...cands, 'none'];
    const top = cands[0];
    return { [u.key]: top && overlap(tokens(txt(n)), tokens(txt(ctx.byId.get(top)))) >= 1 ? choiceAt(keys, top, 0.7) : choiceAt(keys, 'none', 0.3) };
  },
};

/** yes = the relation is implied (the graph lacks it): nounVerdict 'yes-bad'. */
function impliedPair(id: CheckId, label: string, findings: readonly string[],
  plan: (ctx: PlanCtx) => CheckUnit[], words: (a: Node, b: Node) => { verb: string; neg: string },
  repairs: (a: Node, b: Node) => Repair[], fake: (a: Node, b: Node) => S1Answer): CheckDef {
  return {
    id, family: 'completeness', label, findings, plan,
    resolve(u, answers, ctx) {
      const a = node(ctx, u.subjects[0]), b = node(ctx, u.subjects[1]);
      const p = noulOf(answers[u.key]), t = thresholdFor(id), conf = noulConf(p), band = bandFor(conf, t);
      const verdict = nounVerdict(p, t, 'yes-bad');
      const finding = verdict === 'unknown' ? 'unclear' : p >= 0.5 ? 'implied' : 'not-implied';
      const w = words(a, b), A = qt(a.title), B = qt(b.title);
      const evidence = finding === 'implied' ? `${A} ${verdict === 'weak' ? 'probably ' : ''}${w.verb} ${B} (${c2(conf)})`
        : finding === 'not-implied' ? `${A} ${w.neg} ${B} (${c2(conf)})` : `unclear whether ${A} ${w.verb} ${B} (${c2(conf)})`;
      const fix = verdict === 'unknown' ? [R.ask(`Is it right that ${A} ${w.verb} ${B}?`, [a.id, b.id], null), R.ok()] : repairs(a, b);
      return out(u, verdict, finding, conf, band, pick(answers, [u.key]), evidence, verdict === 'solid' ? [] : fix);
    },
    fake: (u, ctx) => ({ [u.key]: fake(node(ctx, u.subjects[0]), node(ctx, u.subjects[1])) }),
  };
}

const cmpProblemAudience = impliedPair('cmp-problem-audience', 'Whose problem?', ['implied', 'not-implied', 'unclear'], (ctx) => {
  const P = phr(ctx.onto), units: CheckUnit[] = [];
  const auds = nodesOf(ctx, 'audience');
  for (const p of nodesOf(ctx, 'problem')) {
    const hasAud = inE(ctx, p.id, 'has').some((e) => ctx.byId.get(e.src)?.kind === 'audience');
    for (const a of auds) {
      if (linked(ctx, a.id, 'has', p.id)) continue;
      if (hasAud && overlap(tokens(a.title), tokens(txt(p))) < 1) continue;
      units.push(mkUnit('cmp-problem-audience', 'completeness', [p.id, a.id], { type: 'noul',
        instructions: `Is ${P.T(p)} a problem that the audience "${a.title}" has?${P.D(p)}${P.D(a)}`,
        criteria: { true: { definition: 'The words name this audience or clearly describe its situation.', examples: ['Audience "Clinic patients" and problem "Patients forget appointments".'] },
          false: { definition: 'The problem belongs to someone else.', examples: ['Audience "Clinic receptionist" and problem "Patients forget their medication".'] } } }));
    }
  }
  return units;
}, () => ({ verb: 'is a problem of', neg: 'is not a problem of' }),
(p, a) => [R.add(`Link "${a.title}" has "${p.title}"`, a.id, p.id, 'has'), R.ok('Not theirs')],
(p, a) => fakeNoul(txt(p), txt(a)));

const cmpInterfaceCarries = impliedPair('cmp-interface-carries', 'Payload carries?', ['implied', 'not-implied', 'unclear'], (ctx) => {
  const P = phr(ctx.onto), units: CheckUnit[] = [];
  const things = nodesOf(ctx, 'thing');
  for (const i of nodesOf(ctx, 'interface')) {
    const any = outE(ctx, i.id, 'carries').length > 0;
    const it = tokens(`${i.title} ${i.props?.in ?? ''} ${i.props?.out ?? ''} ${i.description ?? ''}`);
    things.filter((t) => !linked(ctx, i.id, 'carries', t.id)).map((t) => ({ t, o: overlap(tokens(t.title), it) }))
      .filter((x) => !any || x.o >= 1).sort((a, b) => b.o - a.o || byIdSort(a.t, b.t)).slice(0, 12)
      .forEach(({ t }) => units.push(mkUnit('cmp-interface-carries', 'completeness', [i.id, t.id], { type: 'noul',
        instructions: `Does a payload entering or leaving the interface "${i.title}" contain or derive from the thing "${t.title}"?${P.F(i, 'in')}${P.F(i, 'out')}${P.D(i)}`,
        criteria: { true: 'The payload is this thing or is built from it.', false: 'The payload has nothing of this thing in it.' } })));
  }
  return units;
}, () => ({ verb: 'carries', neg: 'does not carry' }),
(i, t) => [R.add(`"${i.title}" carries "${t.title}"`, i.id, t.id, 'carries'), R.ok('Not carried')],
(i, t) => fakeNoul(`${i.title} ${i.props?.in ?? ''} ${i.props?.out ?? ''} ${i.description ?? ''}`, txt(t)));

const cmpFlowScreen = impliedPair('cmp-flow-screen', 'Flow uses screen?', ['implied', 'not-implied', 'unclear'], (ctx) => {
  const P = phr(ctx.onto), units: CheckUnit[] = [];
  const screens = nodesOf(ctx, 'screen');
  for (const f of nodesOf(ctx, 'flow')) {
    const any = outE(ctx, f.id, 'uses').some((e) => ctx.byId.get(e.dst)?.kind === 'screen');
    const ft = tokens(`${f.title} ${f.props?.steps ?? ''}`);
    screens.filter((s) => !linked(ctx, f.id, 'uses', s.id)).map((s) => ({ s, o: overlap(tokens(s.title), ft) }))
      .filter((x) => !any || x.o >= 1).sort((a, b) => b.o - a.o || byIdSort(a.s, b.s)).slice(0, 12)
      .forEach(({ s }) => units.push(mkUnit('cmp-flow-screen', 'completeness', [f.id, s.id], { type: 'noul',
        instructions: `Does someone following the flow "${f.title}" see or use the screen "${s.title}"?${P.F(f, 'steps')}${P.D(f)}`,
        criteria: { true: 'A step of the flow happens on this screen.', false: 'No step of the flow happens on this screen.' } })));
  }
  return units;
}, () => ({ verb: 'happens on', neg: 'does not happen on' }),
(f, s) => [R.add(`"${f.title}" uses "${s.title}"`, f.id, s.id, 'uses'), R.ok('Not on this flow')],
(f, s) => fakeNoul(`${f.title} ${f.props?.steps ?? ''} ${f.description ?? ''}`, s.title));

const cmpOutcomeMetric: CheckDef = {
  id: 'cmp-outcome-metric', family: 'completeness', label: 'Outcome measured?', findings: ['implied', 'missing'],
  plan(ctx) {
    const P = phr(ctx.onto), metrics = nodesOf(ctx, 'metric');
    return nodesOf(ctx, 'outcome').filter((o) => inE(ctx, o.id, 'monitors').length === 0).map((o) => {
      const ot = tokens(`${o.title} ${o.props?.metric ?? ''} ${o.description ?? ''}`);
      const M = metrics.map((m) => ({ m, s: overlap(ot, tokens(txt(m))) })).sort((a, b) => b.s - a.s || byIdSort(a.m, b.m)).slice(0, 12).map((x) => x.m);
      const meta = { cands: M.map((m) => m.id) };
      if (!M.length) return mkUnit('cmp-outcome-metric', 'completeness', [o.id], [], meta,
        { verdict: 'broken', finding: 'missing', evidence: `${qt(o.title)} has no metric, and there is none to link`, repairs: prim(outcomeMissing(o)) });
      return mkUnit('cmp-outcome-metric', 'completeness', [o.id], { type: 'choice',
        instructions: `Which of these metrics would show that the outcome "${o.title}" happened?${P.F(o, 'metric')}${P.D(o)}\nPick none if none of them would show it.`,
        criteria: { ...Object.fromEntries(M.map((m) => [m.id, clip(m.title, 80)])), none: 'None of these' } }, meta);
    });
  },
  resolve(u, answers, ctx) {
    const o = node(ctx, u.subjects[0]), k = mN(u, 'cands').length;
    const a = answers[u.key], choice = a?.type === 'choice' ? a.choice : 'none';
    const conf = a ? answerConfidence(a) : 0, band = bandFor(conf, thresholdFor('cmp-outcome-metric'));
    const m = choice !== 'none' ? node(ctx, choice) : null;
    const finding = m ? 'implied' : 'missing';
    const verdict: Verdict = band === 'act' ? 'broken' : band === 'offer' ? 'weak' : 'unknown';
    const addM = m ? [R.add(`"${m.title}" monitors "${o.title}"`, m.id, o.id, 'monitors')] : [];
    const repairs = band === 'ask' ? [ask(o)] : [...addM, ...outcomeMissing(o)];
    const evidence = band === 'ask' ? `unclear which metric shows ${qt(o.title)} (${c2(conf)})`
      : m ? `${qt(m.title)} ${band === 'offer' ? 'may show' : 'would show'} ${qt(o.title)}, not linked (${c2(conf)})`
      : `${qt(o.title)} has no metric, none of ${k} would show it (${c2(conf)})`;
    return out(u, verdict, finding, conf, band, pick(answers, [u.key]), evidence, repairs);
  },
  fake(u, ctx) {
    const o = node(ctx, u.subjects[0]), q = u.questions[u.key];
    return { [u.key]: fakeChoice(`${o.title} ${o.props?.metric ?? ''}`, q && q.type === 'choice' ? q.criteria : { none: 'None of these' }) };
  },
};
const ask = (o: Node) => R.ask(`How will you know "${o.title}" happened? Name one metric.`, [o.id], 'metric');
function outcomeMissing(o: Node): Repair[] {
  const f = o.props?.metric;
  return f ? [{ label: `Add metric "${f}"`, op: 'add-node', node: { kind: 'metric', title: f }, link: { type: 'monitors', dir: 'out', other: o.id } }, ask(o)] : [ask(o)];
}

const cmpPurposeOutcome: CheckDef = {
  id: 'cmp-purpose-outcome', family: 'completeness', label: 'On purpose?', findings: ['on-purpose', 'implied', 'off-purpose', 'unclear'],
  plan(ctx) {
    const P = phr(ctx.onto), pu = nodesOf(ctx, 'purpose')[0];
    if (!pu) return [];
    return nodesOf(ctx, 'outcome').map((o) => {
      const e = outE(ctx, pu.id, 'motivates').find((x) => x.dst === o.id);
      const subjects = e ? [`edge:${e.id}`, pu.id, o.id] : [pu.id, o.id];
      return mkUnit('cmp-purpose-outcome', 'completeness', subjects, { type: 'noul',
        instructions: `Is reaching the outcome "${o.title}" part of what the purpose "${pu.title}" is for?${P.D(pu)}${P.D(o)}`,
        criteria: { true: 'The outcome is one of the real-world effects the purpose names or directly implies.', false: 'The outcome is beside the purpose: reaching it would not advance what the system is for.' } },
      { purpose: pu.id, outcome: o.id, linked: e ? 'yes' : 'no', ...(e ? { edgeId: e.id } : {}) });
    });
  },
  resolve(u, answers, ctx) {
    const pu = node(ctx, m1(u, 'purpose')), o = node(ctx, m1(u, 'outcome')), isLinked = m1(u, 'linked') === 'yes';
    const p = noulOf(answers[u.key]), conf = noulConf(p), band = bandFor(conf, thresholdFor('cmp-purpose-outcome')), yes = p >= 0.5;
    const finding = band === 'ask' ? 'unclear' : yes ? (isLinked ? 'on-purpose' : 'implied') : 'off-purpose';
    const verdict: Verdict = band === 'ask' ? 'unknown' : band === 'offer' ? 'weak'
      : isLinked ? (yes ? 'solid' : 'broken') : (yes ? 'broken' : 'weak');
    const repairs: Repair[] = [];
    if (finding === 'implied') repairs.push(R.add(`Purpose motivates "${o.title}"`, pu.id, o.id, 'motivates'));
    if (finding === 'unclear') repairs.push(R.ask(`Is "${o.title}" part of the purpose? If not, should it go?`, [o.id, pu.id], null));
    if (finding === 'off-purpose') { repairs.push(R.ask(`Is "${o.title}" part of the purpose? If not, should it go?`, [o.id, pu.id], null)); if (isLinked) repairs.push(R.remove(m1(u, 'edgeId'))); }
    repairs.push(R.ok());
    const O = qt(o.title);
    const evidence = { 'on-purpose': `${O} serves the purpose`, implied: `${O} is part of the purpose, not linked`, 'off-purpose': `${O} looks beside the purpose`,
      unclear: `unclear whether ${O} is part of the purpose` }[finding] + ` (${c2(conf)})`;
    return out(u, verdict, finding, conf, band, pick(answers, [u.key]), evidence, verdict === 'solid' ? [] : repairs);
  },
  fake: (u, ctx) => ({ [u.key]: fakeNoul(txt(ctx.byId.get(m1(u, 'purpose'))), txt(ctx.byId.get(m1(u, 'outcome')))) }),
};

// ── consistency ──────────────────────────────────────────────────────────────────────────────────
/** One noul, yes-good; weak reports the problem finding. */
function conNoul(id: CheckId, label: string, f: { yes: string; no: string; weak?: string }, plan: (ctx: PlanCtx) => CheckUnit[],
  evidence: (u: CheckUnit, ctx: PlanCtx, finding: string, verdict: Verdict) => string, repairs: (u: CheckUnit, ctx: PlanCtx) => Repair[],
  fake: (u: CheckUnit, ctx: PlanCtx) => S1Answer, polarity: 'yes-good' | 'yes-bad' = 'yes-good'): CheckDef {
  return {
    id, family: 'consistency', label, findings: uniq([f.yes, f.weak ?? f.no, f.no, 'unclear']), plan,
    resolve(u, answers, ctx) {
      const p = noulOf(answers[u.key]), t = thresholdFor(id), conf = noulConf(p), band = bandFor(conf, t);
      const verdict = nounVerdict(p, t, polarity);
      const good = polarity === 'yes-good' ? p >= 0.5 : p < 0.5;
      const finding = verdict === 'unknown' ? 'unclear' : verdict === 'weak' ? (f.weak ?? (good ? f.yes : f.no)) : verdict === 'solid' ? f.yes : f.no;
      return out(u, verdict, finding, conf, band, pick(answers, [u.key]), `${evidence(u, ctx, finding, verdict)} (${c2(conf)})`, verdict === 'solid' ? [] : repairs(u, ctx));
    },
    fake: (u, ctx) => ({ [u.key]: fake(u, ctx) }),
  };
}
const half = (): S1Answer => ({ type: 'noul', noul: 0.5 });

const conRulePair = conNoul('con-rule-pair', 'Rules agree?', { yes: 'compatible', no: 'conflict', weak: 'tension' }, (ctx) => {
  const P = phr(ctx.onto), units: CheckUnit[] = [];
  for (const t of [...ctx.graph.nodes].sort(byIdSort)) {
    const rules = uniq(inE(ctx, t.id, 'governs').map((e) => e.src)).map((id) => ctx.byId.get(id)!).filter((r) => r?.kind === 'rule').sort(byIdSort);
    if (rules.length < 2) continue;
    let n = 0;
    for (let i = 0; i < rules.length && n < 15; i++) for (let j = i + 1; j < rules.length && n < 15; j++, n++) {
      const a = rules[i], b = rules[j];
      units.push(mkUnit('con-rule-pair', 'consistency', [t.id, a.id, b.id], { type: 'noul',
        instructions: `Can both rules hold at the same time for the ${P.l(t.kind)} "${t.title}"?\n  Rule A: "${a.title}"${P.conds(a)}\n  Rule B: "${b.title}"${P.conds(b)}`,
        criteria: { true: 'Both can hold together; obeying one never breaks the other.', false: 'They conflict: there is a case where obeying one rule breaks the other.' } }));
    }
  }
  return units;
}, (u, ctx, finding) => `${qt(node(ctx, u.subjects[1]).title)} vs ${qt(node(ctx, u.subjects[2]).title)} on ${qt(node(ctx, u.subjects[0]).title)}: ${finding}`,
(u, ctx) => { const [t, a, b] = u.subjects.map((id) => node(ctx, id));
  return [R.ask(`Rule "${a.title}" and rule "${b.title}" conflict on "${t.title}". Which one wins, or how do they combine?`, [a.id, b.id, t.id], null), R.ok('They agree')]; },
half);

const SCORE_LABELS = ['refuted', 'contested', 'supported'] as const;
const conBetEvidence: CheckDef = {
  id: 'con-bet-evidence', family: 'consistency', label: 'Bet verdict', findings: ['supported', 'contested', 'refuted', 'unrecorded', 'contradicts-record'],
  plan(ctx) {
    return nodesOf(ctx, 'hypothesis').flatMap((h) => {
      const EV = uniq([...inE(ctx, h.id, 'supports'), ...inE(ctx, h.id, 'refutes')].map((e) => e.src)).map((id) => node(ctx, id)).sort(byIdSort);
      if (!EV.length) return [];
      return [mkUnit('con-bet-evidence', 'consistency', [h.id, ...EV.map((e) => e.id)], { type: 'score',
        instructions: `Taken together, what does this evidence say about the bet "${h.title}"?\n${EV.map((e) => `  - "${clip(e.title, 120)}"${e.description ? `: ${clip(e.description, 160)}` : ''}`).join('\n')}`,
        criteria: ['refuted: taken together, the evidence shows the bet is wrong', 'contested: the evidence points both ways or is too thin to call', 'supported: taken together, the evidence shows the bet is right'] })];
    });
  },
  resolve(u, answers, ctx) {
    const h = node(ctx, u.subjects[0]), a = answers[u.key];
    const score = a?.type === 'score' ? Math.max(0, Math.min(2, Math.round(a.score))) : 1;
    const lab = SCORE_LABELS[score], rec = h.props?.verdict ?? 'open';
    const conf = a ? answerConfidence(a) : 0, band = bandFor(conf, thresholdFor('con-bet-evidence'));
    let verdict: Verdict, finding: string = lab;
    if (band === 'ask') verdict = 'unknown';
    else if (band === 'offer') verdict = 'weak';
    else if (lab === rec) verdict = 'solid';
    else if (rec === 'open') { if (lab === 'contested') verdict = 'solid'; else { verdict = 'weak'; finding = 'unrecorded'; } }
    else if (lab === 'contested') verdict = 'weak';
    else { verdict = 'broken'; finding = 'contradicts-record'; }
    const evidence = `evidence says ${lab} (${c2(conf)})` + (finding === 'unrecorded' ? ', verdict not recorded'
      : rec !== 'open' && rec !== lab ? `, verdict says ${rec}` : '');
    const repairs = verdict === 'solid' ? [] : verdict === 'unknown'
      ? [R.ask(`Is "${h.title}" supported, refuted, or still open?`, [h.id], null), R.ok()]
      : [...(lab !== 'contested' && lab !== rec ? [R.update(`Set verdict to ${lab}`, h.id, { verdict: lab })] : []), R.ok()];
    return out(u, verdict, finding, conf, band, pick(answers, [u.key]), evidence, repairs);
  },
  fake(u, ctx) {
    const types = [...inE(ctx, u.subjects[0], 'supports'), ...inE(ctx, u.subjects[0], 'refutes')].map((e) => e.type);
    const score = types.every((t) => t === 'supports') ? 2 : types.every((t) => t === 'refutes') ? 0 : 1;
    return { [u.key]: { type: 'score', score, confidence: 0.75, probabilities: Object.fromEntries([0, 1, 2].map((s) => [String(s), s === score ? 0.75 : 0.125])) } };
  },
};

const conOutcomeMetric = conNoul('con-outcome-metric', 'Metric agrees', { yes: 'same', no: 'mismatch' }, (ctx) =>
  nodesOf(ctx, 'outcome').filter((o) => o.props?.metric).flatMap((o) =>
    uniq(inE(ctx, o.id, 'monitors').map((e) => e.src)).map((id) => node(ctx, id)).filter((m) => m.kind === 'metric').sort(byIdSort).map((m) =>
      mkUnit('con-outcome-metric', 'consistency', [o.id, m.id], { type: 'noul',
        instructions: `The outcome "${o.title}" states its success metric as "${o.props!.metric}". Does the linked metric "${m.title}" measure that same thing?`,
        criteria: { true: 'Same measure, or one directly computed from the other.', false: 'A different measure; the two would not move together.' } }))),
(u, ctx, finding, verdict) => { const o = node(ctx, u.subjects[0]), m = node(ctx, u.subjects[1]), F = qt(o.props?.metric ?? '');
  return finding === 'same' ? `${qt(m.title)} = ${F}` : finding === 'unclear' ? `unclear whether ${qt(m.title)} measures ${F}`
    : `${qt(m.title)} ${verdict === 'weak' ? 'may not measure' : '≠'} ${F}`; },
(u, ctx) => { const o = node(ctx, u.subjects[0]), m = node(ctx, u.subjects[1]);
  return [R.update(`Use "${m.title}" as the success metric`, o.id, { metric: m.title }),
    R.ask(`Which is the real success metric for "${o.title}": "${o.props?.metric ?? ''}" or "${m.title}"?`, [o.id, m.id], null), R.ok()]; },
(u, ctx) => fakeNoul(node(ctx, u.subjects[0]).props?.metric ?? '', node(ctx, u.subjects[1]).title));

const TEST_CASES = ['pos', 'neg', 'both', 'neither'];
const NEG_RE = /\b(reject|refus|never|cannot|fails?|denied|blocked|invalid|over)/i;
const conTestCase: CheckDef = {
  id: 'con-test-case', family: 'consistency', label: 'Tested both ways?', findings: ['both', 'pos-only', 'neg-only', 'untested'],
  plan(ctx) {
    const P = phr(ctx.onto);
    return nodesOf(ctx, 'rule').flatMap((r) => {
      const tests = uniq(inE(ctx, r.id, 'verifies').map((e) => e.src)).map((id) => node(ctx, id)).sort(byIdSort);
      if (!tests.length) return [];
      return [mkUnit('con-test-case', 'consistency', [r.id, ...tests.map((t) => t.id)], tests.map((t) => [t.id, { type: 'choice',
        instructions: `Which case of the rule "${r.title}" does the test "${t.title}" check?${P.conds(r)}${P.F(t, 'condition')}`,
        criteria: { pos: 'The positive case: something the rule allows succeeds.', neg: 'The negative case: something the rule forbids is rejected.',
          both: 'Both: the test checks an allowed case and a forbidden one.', neither: 'Neither: the test does not exercise this rule.' } }] as [string, S1Question]))];
    });
  },
  resolve(u, answers, ctx) {
    const r = node(ctx, u.subjects[0]), keys = slotsOf(u).map((s) => slotKey(u, s)), got = pick(answers, keys);
    const choices = keys.map((k) => (answers[k]?.type === 'choice' ? (answers[k] as { choice: string }).choice : 'neither'));
    const P = choices.filter((c) => c === 'pos' || c === 'both').length, N = choices.filter((c) => c === 'neg' || c === 'both').length;
    const conf = keys.every((k) => k in answers) ? minConfidence(got) : 0, band = bandFor(conf, thresholdFor('con-test-case'));
    const [raw, finding]: [Verdict, string] = P && N ? ['solid', 'both'] : P ? ['weak', 'pos-only'] : N ? ['weak', 'neg-only'] : ['broken', 'untested'];
    const verdict = rollup(raw, band);
    const text = { both: 'both cases tested', 'pos-only': 'positive case only', 'neg-only': 'negative case only', untested: 'no test exercises it' }[finding];
    const repairs: Repair[] = [];
    if (!N) repairs.push(R.ask(`"${r.title}" has no negative test. What should be rejected to prove it?`, [r.id], 'test'));
    if (!P) repairs.push(R.ask(`"${r.title}" has no positive test. What should be allowed to prove it?`, [r.id], 'test'));
    const tests = `${P} pos / ${N} neg`;
    if ((r.props?.tests ?? '') !== tests) repairs.push(R.update(`Set tests to "${tests}"`, r.id, { tests }));
    if (verdict !== 'solid') repairs.push(R.ok());
    return out(u, verdict, finding, conf, band, got, `${qt(r.title)}: ${text} (${c2(conf)})`, repairs);
  },
  fake: (u, ctx) => Object.fromEntries(slotsOf(u).map((s) => [slotKey(u, s), choiceAt(TEST_CASES, NEG_RE.test(node(ctx, s).title) ? 'neg' : 'pos', 0.75)])),
};

function stagesOf(f: Node, all: string[]): { raw: string[]; stages: string[] } {
  const raw = (f.props?.stages ?? '').split(/[,;/]/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const stages = uniq(raw.flatMap((s) => (s === 'all' ? all : [s]))).filter((s) => all.includes(s));
  return { raw, stages };
}
const flowsOf = (ctx: PlanCtx, f: string) => uniq([...outE(ctx, f, 'has').map((e) => e.dst), ...inE(ctx, f, 'implements').map((e) => e.src)])
  .map((id) => node(ctx, id)).filter((n) => n.kind === 'flow').sort(byIdSort);
const conFeatureStages: CheckDef = {
  id: 'con-feature-stages', family: 'consistency', label: 'Stages covered?', findings: ['covered', 'uncovered', 'unclear'],
  plan(ctx) {
    const all = ctx.onto.LIFECYCLE_STAGES ?? [];
    return nodesOf(ctx, 'feature').flatMap((f) => {
      const FL = flowsOf(ctx, f.id), { stages } = stagesOf(f, all);
      if (!FL.length || !stages.length) return [];
      return [mkUnit('con-feature-stages', 'consistency', [f.id, ...FL.map((x) => x.id)], stages.map((stage) => [stage, { type: 'noul',
        instructions: `The feature "${f.title}" claims to act at the "${stage}" stage of the customer lifecycle. Does any of its flows happen at that stage?\n  Flows: ${FL.map((x) => `"${clip(x.title, 80)}"`).join(', ')}`,
        criteria: { true: 'At least one flow is something a person does at that stage.', false: 'None of the flows happens at that stage.' } }] as [string, S1Question]))];
    });
  },
  resolve(u, answers, ctx) {
    const f = node(ctx, u.subjects[0]), stages = slotsOf(u), keys = stages.map((s) => slotKey(u, s)), got = pick(answers, keys);
    const ps = keys.map((k) => noulOf(answers[k]));
    const conf = keys.every((k) => k in answers) ? minConfidence(got) : 0, band = bandFor(conf, thresholdFor('con-feature-stages'));
    const no = stages.filter((_, i) => ps[i] < 0.5);
    const [raw, finding]: [Verdict, string] = !no.length ? ['solid', 'covered'] : no.length === stages.length ? ['broken', 'uncovered'] : ['weak', `uncovered: ${no.join(', ')}`];
    const verdict = rollup(raw, band);
    const evidence = `${qt(f.title)}: ${no.length ? `no flow at ${no.join(', ')}` : 'every claimed stage has a flow'} (${c2(conf)})`;
    const { raw: claimed } = stagesOf(f, ctx.onto.LIFECYCLE_STAGES ?? []);
    const keep = (claimed.includes('all') ? (ctx.onto.LIFECYCLE_STAGES ?? []) : claimed).filter((s) => !no.includes(s));
    const repairs = verdict === 'solid' ? [] : [...no.map((s) => R.ask(`What does "${f.title}" do at the ${s} stage? One flow per line.`, [f.id], 'flow')),
      ...(no.length ? [R.update(`Drop ${no.join(', ')} from stages`, f.id, { stages: keep.join(', ') })] : []), R.ok()];
    return out(u, verdict, finding, conf, band, got, evidence, repairs);
  },
  fake(u, ctx) {
    const FL = flowsOf(ctx, u.subjects[0]), ft = tokens(FL.map((x) => x.title).join(' '));
    return Object.fromEntries(slotsOf(u).map((s) => [slotKey(u, s), { type: 'noul' as const,
      noul: s === 'use' ? (FL.length ? 0.72 : 0.35) : overlap(STAGE_WORDS[s] ?? [], ft) >= 1 ? 0.86 : 0.35 }]));
  },
};

const jaccard = (a: string, b: string) => {
  const x = new Set(tokens(a)), y = new Set(tokens(b));
  if (!x.size || !y.size) return 0;
  let n = 0; for (const t of x) if (y.has(t)) n++;
  return n / (x.size + y.size - n);
};
const conDupTitle = conNoul('con-dup-title', 'Duplicate?', { yes: 'distinct', no: 'duplicate' }, (ctx) => {
  const P = phr(ctx.onto), units: CheckUnit[] = [];
  for (const k of ctx.onto.KINDS.filter((x) => !x.singular)) {
    const ns = nodesOf(ctx, k.id);
    for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
      const a = ns[i], b = ns[j];
      if (!(jaccard(a.title, b.title) >= 0.5 || containsPhrase(a.title, b.title) || containsPhrase(b.title, a.title))) continue;
      units.push(mkUnit('con-dup-title', 'consistency', [a.id, b.id], { type: 'noul',
        instructions: `Do these two titles name the same thing?\n${P.kindLabel(k.id)} "${a.title}" vs. ${P.kindLabel(k.id)} "${b.title}"${P.D(a)}${P.D(b)}`,
        criteria: { true: 'Same thing', false: 'Different things' } }));
    }
  }
  return units;
}, (u, ctx, finding, verdict) => { const A = qt(node(ctx, u.subjects[0]).title), B = qt(node(ctx, u.subjects[1]).title);
  return finding === 'duplicate' ? `${A} and ${B} ${verdict === 'weak' ? 'may name' : 'name'} the same thing` : finding === 'distinct' ? `${A} and ${B} are different` : `unclear whether ${A} and ${B} are the same`; },
(u, ctx) => { const a = node(ctx, u.subjects[0]), b = node(ctx, u.subjects[1]);
  return [{ label: `Merge "${b.title}" into "${a.title}"`, op: 'merge-nodes', keep: a.id, drop: b.id },
    R.ask(`Are "${a.title}" and "${b.title}" the same thing?`, [a.id, b.id], null), R.ok('They are different')]; },
(u, ctx) => { const j = jaccard(node(ctx, u.subjects[0]).title, node(ctx, u.subjects[1]).title); return { type: 'noul', noul: j >= 0.8 ? 0.9 : j >= 0.5 ? 0.72 : 0.35 }; },
'yes-bad');

const conSummary = conNoul('con-summary', 'Summary agrees?', { yes: 'consistent', no: 'contradicts' }, (ctx) => {
  const s = nodesOf(ctx, 'summary')[0], pu = nodesOf(ctx, 'purpose')[0], OUT = nodesOf(ctx, 'outcome');
  if (!s || !pu || !OUT.length) return [];
  return [mkUnit('con-summary', 'consistency', [s.id, pu.id, ...OUT.map((o) => o.id)], { type: 'noul',
    instructions: `Is everything the summary says consistent with the purpose and the outcomes below?\n  Summary: "${clip(s.title + ' ' + (s.description ?? ''), 600)}"\n  Purpose: "${clip(pu.title, 200)}"\n  Outcomes: ${OUT.map((o) => `"${clip(o.title, 100)}"`).join(', ')}`,
    criteria: { true: 'Consistent: the summary may add detail but contradicts none of them.', false: 'The summary says something one of them contradicts, or describes a different product.' } })];
}, (_u, _ctx, finding, verdict) => finding === 'consistent' ? 'the summary agrees with the purpose and outcomes'
  : finding === 'unclear' ? 'unclear whether the summary agrees with the purpose and outcomes' : `the summary ${verdict === 'weak' ? 'may disagree' : 'disagrees'} with the purpose or outcomes`,
(u) => [R.ask('The summary disagrees with the purpose or outcomes. Rewrite it?', [u.subjects[0]], 'summary'), R.ok()],
half);

const conTermUsage: CheckDef = {
  id: 'con-term-usage', family: 'consistency', label: 'Term used as defined?', findings: ['consistent', 'drift', 'unclear'],
  plan(ctx) {
    const P = phr(ctx.onto);
    const others = [...ctx.graph.nodes].filter((n) => n.kind !== 'term').sort(byIdSort);
    return nodesOf(ctx, 'term').filter((t) => t.description).flatMap((term) => {
      const uses = others.filter((n) => containsPhrase(txt(n), term.title)).slice(0, 5);
      if (!uses.length) return [];
      return [mkUnit('con-term-usage', 'consistency', [term.id, ...uses.map((n) => n.id)], uses.map((n) => [n.id, { type: 'noul',
        instructions: `The glossary defines "${term.title}" as: "${clip(term.description!, 240)}". Is "${term.title}" used with that meaning in ${P.T(n)}?${P.D(n)}`,
        criteria: { true: 'Used with the defined meaning.', false: 'Used with a different meaning, so either the definition or this wording should change.' } }] as [string, S1Question]))];
    });
  },
  resolve(u, answers, ctx) {
    const term = node(ctx, u.subjects[0]), slots = slotsOf(u), keys = slots.map((s) => slotKey(u, s)), got = pick(answers, keys);
    const t = thresholdFor('con-term-usage'), ps = keys.map((k) => noulOf(answers[k]));
    const conf = keys.every((k) => k in answers) ? minConfidence(got) : 0, band = bandFor(conf, t);
    const drift = slots.filter((_, i) => ps[i] < 0.5), actNo = ps.some((p) => p < 0.5 && noulConf(p) >= t);
    const raw: Verdict = actNo ? 'broken' : !drift.length ? 'solid' : 'weak';
    const verdict = rollup(raw, band), finding = verdict === 'unknown' ? 'unclear' : drift.length ? 'drift' : 'consistent';
    const T = qt(term.title);
    const evidence = (finding === 'consistent' ? `${T} is used as defined in ${slots.length} place${slots.length === 1 ? '' : 's'}`
      : finding === 'drift' ? `${T} is used differently in ${drift.map((id) => qt(node(ctx, id).title)).join(', ')}` : `unclear whether ${T} is used as defined`) + ` (${c2(conf)})`;
    const repairs = verdict === 'solid' ? [] : [...drift.map((id) => R.ask(`"${node(ctx, id).title}" uses "${term.title}" differently from the glossary. Reword it, or change the definition?`, [id, term.id], null)), R.ok()];
    return out(u, verdict, finding, conf, band, got, evidence, repairs);
  },
  fake: (u) => Object.fromEntries(slotsOf(u).map((s) => [slotKey(u, s), half()])),
};

export const CHECKS: Record<CheckId, CheckDef> = {
  'sol-edge': solEdge, 'sol-satisfies': solSatisfies, 'sol-implements': solImplements, 'sol-verifies': solVerifies,
  'sol-evidence': solEvidence, 'sol-monitors': solMonitors, 'sol-realises': solRealises, 'sol-bet-metric': solBetMetric, 'sol-retype': solRetype,
  'cmp-need': cmpNeed, 'cmp-problem-audience': cmpProblemAudience, 'cmp-outcome-metric': cmpOutcomeMetric,
  'cmp-interface-carries': cmpInterfaceCarries, 'cmp-flow-screen': cmpFlowScreen, 'cmp-purpose-outcome': cmpPurposeOutcome,
  'con-rule-pair': conRulePair, 'con-bet-evidence': conBetEvidence, 'con-outcome-metric': conOutcomeMetric, 'con-test-case': conTestCase,
  'con-feature-stages': conFeatureStages, 'con-dup-title': conDupTitle, 'con-summary': conSummary, 'con-term-usage': conTermUsage,
};
export const CHECK_IDS = Object.keys(CHECKS) as CheckId[];
