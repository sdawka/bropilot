// link-answer (v4.3, per-pair since v4.5): proposes the edges for the nodes a just-staged answer
// added, and appends them to the same staged changeset so the user approves nodes and edges
// together. Without it every template answer lands as orphans (the kernel's `orphans` invariant).
// The edge shapes per kind are the LINKS table (../links.ts, derived from kernel.ts RELATIONS); only *which*
// committed node to link to is a decision.
//
// `decision` (AGENT-RUNTIME.md §9, gate 'answer'): a `many` rule asks one `noul` per (new node,
// candidate) pair, each with structured true/false criteria; a pair links when its own confidence
// |p−.5|·2 clears 'link-answer-pair' and p ≥ .5, is dropped when it clears it with p < .5, and is
// *uncertain* otherwise. A single-target rule asks one `choice` over the candidates + `none`, gated
// on the choice's own confidence against 'link-answer'. No call-level fallback: one borderline pair
// never sinks the confident ones, and an uncertain pair is never linked (live 2026-09-28 the stub
// linked every candidate, ~27 of 30 edges all-to-all noise).
// `stub`: exactly one candidate → link it; more than one → uncertain (never all-to-all).
// Uncertain nodes are counted in the note ("linked 2 of 3 new nodes; 1 needs you") and, since v4.5,
// asked: store.ts::noteUncertain raises one link follow-up per uncertain node once it is committed
// ('Does "<title>" relate to any of these?', options = the uncertain candidates' titles + "None of
// these"). A node left with no edge at all is also an orphan and the orphans repair asks for it.
// State is only the answer text — Jev reads literally, so titles and kind blurbs go in the question.
import { state, noteUncertain, type Effect, type Node } from '../../store.ts';
import { kindById, edgeTypeById } from '../../kernel.ts';
import { LINKS, endpoints, type LinkRule } from '../links.ts';
import { answerConfidence, thresholdFor } from '../decisionConfig.ts';
import type { Cue, Context } from '../../director.ts';
import type { AIFunctionImpl, DecisionSpec, S1Answers, S1Criterion, S1Question, S1Request } from '../types.ts';

export interface LinkAnswerIn { answerId: string }
export interface ProposedEdge { src: string; dst: string; type: string }
/** `uncertain`: new node id → the candidate ids nobody decided on (below threshold / stub ambiguity). */
export interface LinkAnswerOut { answerId: string; edges: ProposedEdge[]; note: string; uncertain: Record<string, string[]> }

interface Plan { node: Node; rule: LinkRule; candidates: Node[] }

const label = (kind: string) => kindById[kind]?.label ?? kind;

function addedNodes(answerId: string): Node[] {
  return (state.staged?.effects ?? []).flatMap((e) => (e.op === 'add-node' && e.answerId === answerId ? [e.node] : []));
}

/** One plan per (new node, LINKS rule) with at least one committed candidate. */
function planFor(answerId: string): { plans: Plan[]; linkable: Node[] } {
  const linkable = addedNodes(answerId).filter((n) => LINKS[n.kind]?.length);
  const plans: Plan[] = [];
  for (const node of linkable) {
    for (const rule of LINKS[node.kind]) {
      const candidates = state.graph.nodes.filter((n) => n.kind === rule.target && n.id !== node.id);
      if (candidates.length) plans.push({ node, rule, candidates });
    }
  }
  return { plans, linkable };
}

const edgesFor = (p: Plan, targets: Node[]): ProposedEdge[] => targets.map((t) => ({ ...endpoints(p.rule, p.node.id, t.id), type: p.rule.edge }));

/** "linked 2 of 3 new nodes; 1 needs you": linked = a new node with at least one edge; needs you =
 * a new node with at least one undecided candidate. */
function summarise(answerId: string, edges: ProposedEdge[], total: number, uncertain: Record<string, string[]>): LinkAnswerOut {
  const staged = new Set(addedNodes(answerId).map((n) => n.id));
  const linked = new Set(edges.flatMap((e) => [e.src, e.dst].filter((id) => staged.has(id)))).size;
  const open = Object.values(uncertain).filter((c) => c.length).length;
  const note = total
    ? `linked ${linked} of ${total} new node${total === 1 ? '' : 's'}${open ? `; ${open} need${open === 1 ? 's' : ''} you` : ''}`
    : 'no new nodes to link';
  return { answerId, edges, note, uncertain };
}

const addUncertain = (u: Record<string, string[]>, nodeId: string, ids: string[]) => {
  if (ids.length) u[nodeId] = [...new Set([...(u[nodeId] ?? []), ...ids])];
};

function stub(input: LinkAnswerIn): LinkAnswerOut {
  const { plans, linkable } = planFor(input.answerId);
  const uncertain: Record<string, string[]> = {};
  const edges = plans.flatMap((p) => {
    if (p.candidates.length === 1) return edgesFor(p, p.candidates);
    addUncertain(uncertain, p.node.id, p.candidates.map((c) => c.id));
    return [];
  });
  return summarise(input.answerId, edges, linkable.length, uncertain);
}

// ── the questions ────────────────────────────────────────────────────────────────────────────────

/** The verb in its base form for a yes/no question ("has" → "have", "satisfies" → "satisfy"). */
const baseVerb = (v: string) => (v === 'has' ? 'have' : v.endsWith('ies') ? `${v.slice(0, -3)}y` : v.endsWith('s') ? v.slice(0, -1) : v);

/** Per relation (new kind | edge | target kind): the literal yes/no question for one pair, and the
 * structured criteria (one-sentence definition, 1–2 short product-neutral examples per side). */
interface Relation { ask: (node: string, cand: string) => string; true: S1Criterion; false: S1Criterion }

const audienceHas = (kind: string, what: string, yes: [string, string], no: [string, string], noDef: string): Relation => ({
  ask: (n, c) => `Does the audience "${c}" have the ${kind} "${n}"?`,
  true: { definition: `The ${kind} is this audience's own: ${what}.`, examples: [`Audience "${yes[0]}" has the ${kind} "${yes[1]}".`] },
  false: { definition: noDef, examples: [`Audience "${no[0]}" does not have the ${kind} "${no[1]}".`] },
});

const betMetric: Relation = {
  ask: () => '', // set per direction below
  true: { definition: 'The metric measures whether the bet holds: if the bet is right, this number moves.', examples: ['Bet "Reminders cut missed appointments" and metric "No-show rate".'] },
  false: { definition: 'The metric measures something the bet does not claim to change.', examples: ['Bet "Reminders cut missed appointments" and metric "Signup conversion".'] },
};

const PAIR_ASKS: Record<string, Relation> = {
  'context|has|audience': audienceHas('context', 'it describes a situation or setting this audience is in',
    ['Freelancers', 'Works from client sites without office hours'], ['Accountants', 'Works from client sites without office hours'],
    'The situation belongs to a different audience, or this audience is not in it.'),
  'usecase|has|audience': audienceHas('use case', 'this audience is the one trying to get it done',
    ['Freelancers', 'Send an invoice after a job'], ['Accountants', 'Send an invoice after a job'],
    'Someone else is the one trying to get this done; this audience at most sees the result.'),
  'problem|has|audience': audienceHas('problem', 'it stands in this audience\'s own way today',
    ['Clinic receptionists', 'Patients forget their appointments'], ['Patients', 'Rebooking takes the receptionist ten minutes'],
    'The obstacle hits a different audience, or this audience does not face it.'),
  'hypothesis|references|metric': { ...betMetric, ask: (n, c) => `Would the metric "${c}" show whether the new bet "${n}" holds?` },
  'metric|references|hypothesis': { ...betMetric, ask: (n, c) => `Would the new metric "${n}" show whether the bet "${c}" holds?` },
  'problem|has|usecase': {
    ask: (n, c) => `Does the new problem "${n}" get in the way of the use case "${c}"?`,
    true: { definition: 'The obstacle shows up while someone is trying to get this use case done.', examples: ['Use case "Send an invoice after a job" and problem "Invoices take an hour to write by hand".'] },
    false: { definition: 'The obstacle belongs to a different task, even when both are about the same area.', examples: ['Use case "Send an invoice after a job" and problem "Clients forget their appointments".'] },
  },
  'outcome|motivates|problem': {
    ask: (n, c) => `Would the new outcome "${n}" mean the problem "${c}" is solved or smaller?`,
    true: { definition: 'Reaching the outcome removes or shrinks this obstacle; the problem is a reason to want the outcome.', examples: ['Problem "Patients forget their appointments" and outcome "Fewer missed appointments".'] },
    false: { definition: 'The outcome can be reached while the problem stays exactly as it is.', examples: ['Problem "Patients forget their appointments" and outcome "Faster checkout at the desk".'] },
  },
  'capability|satisfies|usecase': {
    ask: (n, c) => `Does the new capability "${n}" help someone get the use case "${c}" done?`,
    true: { definition: 'Someone doing this use case would use this capability to get it done.', examples: ['Capability "Scan a receipt" and use case "File this month\'s expenses".'] },
    false: { definition: 'The capability plays no part in getting this use case done.', examples: ['Capability "Scan a receipt" and use case "Invite a teammate".'] },
  },
  'capability|satisfies|problem': {
    ask: (n, c) => `Does the new capability "${n}" remove or reduce the problem "${c}"?`,
    true: { definition: 'Having this capability removes or reduces this obstacle for the people who face it.', examples: ['Capability "Scan a receipt" and problem "Typing expenses by hand takes too long".'] },
    false: { definition: 'The capability does not touch this obstacle, even when both are about the same area.', examples: ['Capability "Scan a receipt" and problem "Reports are hard to share with the accountant".'] },
  },
};

function pairQuestion(p: Plan, c: Node): S1Question {
  const kind = label(p.node.kind), target = label(p.rule.target);
  const rel = PAIR_ASKS[`${p.node.kind}|${p.rule.edge}|${p.rule.target}`];
  const blurb = kindById[p.node.kind]?.blurb ?? '';
  if (rel) return { type: 'noul', instructions: `${rel.ask(p.node.title, c.title)} (A ${kind} is: ${blurb})`, criteria: { true: rel.true, false: rel.false } };
  const verb = baseVerb(edgeTypeById[p.rule.edge]?.label ?? p.rule.edge);
  const ask = p.rule.dir === 'in'
    ? `Does ${target} "${c.title}" ${verb} the new ${kind} "${p.node.title}"?`
    : `Does the new ${kind} "${p.node.title}" ${verb} ${target} "${c.title}"?`;
  return { type: 'noul', instructions: `${ask} (A ${kind} is: ${blurb})` };
}

function questions(input: LinkAnswerIn): S1Request | null {
  const { plans } = planFor(input.answerId);
  if (!plans.length) return null;
  const qs: S1Request['questions'] = {};
  plans.forEach((p, i) => {
    if (p.rule.many) {
      p.candidates.forEach((c, j) => { qs[`n${i}c${j}`] = pairQuestion(p, c); });
      return;
    }
    const kind = label(p.node.kind), target = label(p.rule.target);
    const verb = edgeTypeById[p.rule.edge]?.label ?? p.rule.edge;
    const blurb = kindById[p.node.kind]?.blurb ?? '';
    const ask = p.rule.dir === 'in'
      ? `Which ${target} ${verb} the new ${kind} "${p.node.title}"?`
      : `The new ${kind} "${p.node.title}" ${verb} which ${target}?`;
    qs[`n${i}`] = {
      type: 'choice',
      instructions: `${ask} (A ${kind} is: ${blurb}) Pick none if it matches none of them.`,
      criteria: {
        ...Object.fromEntries(p.candidates.map((c) => [c.id, `"${c.title}" (${label(c.kind)})`])),
        none: 'none of these',
      },
    };
  });
  const answer = state.answers.find((a) => a.id === input.answerId)?.content ?? '';
  return { state: { answer }, questions: qs };
}

// ── deciding, one answer at a time ───────────────────────────────────────────────────────────────

function decide(answers: S1Answers, input: LinkAnswerIn): LinkAnswerOut {
  const { plans, linkable } = planFor(input.answerId);
  const pairMin = thresholdFor('link-answer-pair'), choiceMin = thresholdFor('link-answer');
  const uncertain: Record<string, string[]> = {};
  const edges = plans.flatMap((p, i) => {
    if (p.rule.many) {
      const yes: Node[] = [];
      p.candidates.forEach((c, j) => {
        const a = answers[`n${i}c${j}`];
        if (!a || a.type !== 'noul' || answerConfidence(a) < pairMin) { addUncertain(uncertain, p.node.id, [c.id]); return; }
        if (a.noul >= 0.5) yes.push(c);
      });
      return edgesFor(p, yes);
    }
    const a = answers[`n${i}`];
    if (!a || a.type !== 'choice' || answerConfidence(a) < choiceMin) { addUncertain(uncertain, p.node.id, p.candidates.map((c) => c.id)); return []; }
    const hit = p.candidates.find((c) => c.id === a.choice);
    return hit ? edgesFor(p, [hit]) : [];
  });
  return summarise(input.answerId, edges, linkable.length, uncertain);
}

/** Recorded only (gate 'answer'): the mean per-answer confidence, for the Reference AI-calls table. */
function meanConfidence(answers: S1Answers): number {
  const vals = Object.values(answers).map((a) => answerConfidence(a as { type: string; confidence?: number; noul?: number }));
  return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : 0;
}

function toCues(out: LinkAnswerOut, callId: string): Cue[] {
  // v4.5: every uncertain (node, candidates) becomes one link follow-up once the node is committed
  noteUncertain(out.answerId, out.uncertain);
  const staged = state.staged;
  // the user already approved or discarded that answer's changeset: nothing to append to
  if (!staged || !staged.effects.some((e) => e.answerId === out.answerId)) return [];
  const key = (e: ProposedEdge) => `${e.src}|${e.type}|${e.dst}`;
  const have = new Set([
    ...state.graph.edges.map(key),
    ...staged.effects.flatMap((e) => (e.op === 'add-edge' ? [key(e.edge)] : [])),
  ]);
  const fresh: ProposedEdge[] = [];
  for (const e of out.edges) if (!have.has(key(e))) { have.add(key(e)); fresh.push(e); }
  const needsYou = Object.values(out.uncertain).some((c) => c.length);
  // restage only when something changed or the note has news (an uncertain node the user must see)
  if (!fresh.length && !needsYou) return [];
  const effects: Effect[] = [
    ...staged.effects,
    ...fresh.map((e, i): Effect => ({ id: `${callId}-e${i}`, op: 'add-edge', edge: { id: `e-${e.src}-${e.type}-${e.dst}`, src: e.src, dst: e.dst, type: e.type, status: 'draft', answerId: out.answerId }, answerId: out.answerId })),
  ];
  const kept = staged.warnings
    .map((w) => w.replace(/^linked \d+ of \d+ new nodes?(; \d+ needs? you)?\.\s*/, ''))
    .filter((w) => w && w !== 'Nothing to stage.');
  return [{ t: 'stage', effects, note: `${out.note}.${kept.length ? ' ' + kept.join(' ') : ''}` }];
}

const decision: DecisionSpec<LinkAnswerIn, LinkAnswerOut> = { id: 'link-answer', questions, decide, confidence: meanConfidence, gate: 'answer' };

export const linkAnswer: AIFunctionImpl<LinkAnswerIn, LinkAnswerOut> = {
  context: { digest: (ctx: Context) => `staged=${state.staged?.effects.length ?? 0} nodes=${ctx.graph.nodes}` },
  stub,
  toCues,
  decision,
};
