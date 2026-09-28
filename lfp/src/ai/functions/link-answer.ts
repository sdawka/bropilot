// link-answer (v4.3): proposes the edges for the nodes a just-staged answer added, and appends them
// to the same staged changeset so the user approves nodes and edges together. Without it every
// template answer lands as orphans (the kernel's `orphans` invariant). The edge shape per kind is
// the LINKS table (../links.ts); only *which* committed node to link to is a decision.
//
// `stub`: exactly one candidate → link it; a `many` kind → link every candidate; else nothing.
// `decision` (AGENT-RUNTIME.md §9, threshold 'link-answer'): a `many` kind asks one `noul` per
// (new node, candidate) pair ("Does audience "A" have the new context "X"?") and links every pair
// ≥ 0.5; a single-target kind asks one `choice` over the candidates + `none`. The call's confidence
// is the MEAN of the per-answer confidences, so one borderline pair does not sink the confident
// ones (measured live 2026-09-28: one mixed choice with `all` split its mass and fell back 7/7).
// State is only the answer text — Jev reads literally, so title and kind blurb go in the question.
import { state, type Effect, type Node } from '../../store.ts';
import { kindById, edgeTypeById } from '../../kernel.ts';
import { LINKS, endpoints, type LinkRule } from '../links.ts';
import { answerConfidence } from '../decisionConfig.ts';
import type { Cue, Context } from '../../director.ts';
import type { AIFunctionImpl, DecisionSpec, S1Answers, S1Request } from '../types.ts';

export interface LinkAnswerIn { answerId: string }
export interface ProposedEdge { src: string; dst: string; type: string }
export interface LinkAnswerOut { answerId: string; edges: ProposedEdge[]; note: string }

interface Plan { node: Node; rule: LinkRule; candidates: Node[] }

const label = (kind: string) => kindById[kind]?.label ?? kind;

/** The new nodes this answer staged that have a LINKS rule and at least one committed candidate. */
function planFor(answerId: string): { plans: Plan[]; added: number } {
  const added = (state.staged?.effects ?? []).filter((e): e is Extract<Effect, { op: 'add-node' }> => e.op === 'add-node' && e.answerId === answerId);
  const plans: Plan[] = [];
  for (const e of added) {
    const rule = LINKS[e.node.kind];
    if (!rule) continue;
    const candidates = state.graph.nodes.filter((n) => n.kind === rule.target);
    if (candidates.length) plans.push({ node: e.node, rule, candidates });
  }
  return { plans, added: added.filter((e) => LINKS[e.node.kind]).length };
}

const edgesFor = (p: Plan, targets: Node[]): ProposedEdge[] => targets.map((t) => ({ ...endpoints(p.rule, p.node.id, t.id), type: p.rule.edge }));

/** "linked 3 of 3 new nodes": how many of the answer's linkable new nodes got at least one edge. */
function summarise(answerId: string, edges: ProposedEdge[], total: number): LinkAnswerOut {
  const staged = new Set((state.staged?.effects ?? []).flatMap((e) => (e.op === 'add-node' ? [e.node.id] : [])));
  const linked = new Set(edges.flatMap((e) => [e.src, e.dst].filter((id) => staged.has(id)))).size;
  return { answerId, edges, note: total ? `linked ${linked} of ${total} new node${total === 1 ? '' : 's'}` : 'no new nodes to link' };
}

function stub(input: LinkAnswerIn): LinkAnswerOut {
  const { plans, added } = planFor(input.answerId);
  const edges = plans.flatMap((p) => (p.candidates.length === 1 || p.rule.many ? edgesFor(p, p.candidates) : []));
  return summarise(input.answerId, edges, added);
}

/** The verb in its base form for a yes/no question ("has" → "have", "satisfies" → "satisfy"). */
const baseVerb = (v: string) => (v === 'has' ? 'have' : v.endsWith('ies') ? `${v.slice(0, -3)}y` : v.endsWith('s') ? v.slice(0, -1) : v);

function questions(input: LinkAnswerIn): S1Request | null {
  const { plans } = planFor(input.answerId);
  if (!plans.length) return null;
  const qs: S1Request['questions'] = {};
  plans.forEach((p, i) => {
    const kind = label(p.node.kind), target = label(p.rule.target);
    const verb = edgeTypeById[p.rule.edge]?.label ?? p.rule.edge;
    const blurb = kindById[p.node.kind]?.blurb ?? '';
    if (p.rule.many) {
      p.candidates.forEach((c, j) => {
        const ask = p.rule.dir === 'in'
          ? `Does ${target} "${c.title}" ${baseVerb(verb)} the new ${kind} "${p.node.title}"?`
          : `Does the new ${kind} "${p.node.title}" ${baseVerb(verb)} ${target} "${c.title}"?`;
        qs[`n${i}c${j}`] = { type: 'noul', instructions: `${ask} (A ${kind} is: ${blurb})` };
      });
      return;
    }
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

function decide(answers: S1Answers, input: LinkAnswerIn): LinkAnswerOut {
  const { plans, added } = planFor(input.answerId);
  const edges = plans.flatMap((p, i) => {
    if (p.rule.many) {
      return edgesFor(p, p.candidates.filter((_, j) => {
        const a = answers[`n${i}c${j}`];
        return !!a && a.type === 'noul' && a.noul >= 0.5;
      }));
    }
    const a = answers[`n${i}`];
    const pick = a && a.type === 'choice' ? a.choice : 'none';
    const hit = p.candidates.find((c) => c.id === pick);
    return hit ? edgesFor(p, [hit]) : [];
  });
  return summarise(input.answerId, edges, added);
}

/** Mean, not min: with one noul per (node, candidate) pair, the weakest pair would sink the call. */
function meanConfidence(answers: S1Answers): number {
  const vals = Object.values(answers).map((a) => answerConfidence(a as { type: string; confidence?: number; noul?: number }));
  return vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : 0;
}

function toCues(out: LinkAnswerOut, callId: string): Cue[] {
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
  if (!fresh.length) return [];
  const effects: Effect[] = [
    ...staged.effects,
    ...fresh.map((e, i): Effect => ({ id: `${callId}-e${i}`, op: 'add-edge', edge: { id: `e-${e.src}-${e.type}-${e.dst}`, src: e.src, dst: e.dst, type: e.type, status: 'draft', answerId: out.answerId }, answerId: out.answerId })),
  ];
  const kept = staged.warnings.filter((w) => w !== 'Nothing to stage.');
  return [{ t: 'stage', effects, note: `${out.note}.${kept.length ? ' ' + kept.join(' ') : ''}` }];
}

const decision: DecisionSpec<LinkAnswerIn, LinkAnswerOut> = { id: 'link-answer', questions, decide, confidence: meanConfidence };

export const linkAnswer: AIFunctionImpl<LinkAnswerIn, LinkAnswerOut> = {
  context: { digest: (ctx: Context) => `staged=${state.staged?.effects.length ?? 0} nodes=${ctx.graph.nodes}` },
  stub,
  toCues,
  decision,
};
