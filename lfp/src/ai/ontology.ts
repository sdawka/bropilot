// The kernel's ontology as a question tree for System One (v4.3, AGENT-RUNTIME.md §9). Layer →
// space → kind → node is what the kernel already declares (kernel.ts SPACES/KINDS/QUESTIONS); this
// file turns each level into a typed question and walks the tree in code. Node-runnable (kernel.ts
// only), shared by the browser functions, scripts/observe.mjs and scripts/s1-eval.mjs.
//
// Why chain instead of one flat question: Jev reads literally and degrades as the option set or the
// state fills with things the question is not about. A 40-way choice over nodes of every kind mixes
// "Reviewer" the agent with "Review change" the ai-function; asking "which space?", "which kind in
// that space?", then "which node of that kind?" keeps every option set small and homogeneous. Jev
// answers every question in a request in one parallel pass and output is free, so sibling branches
// are asked together and only the chosen branch is read — one round trip per *dependent* level.
import { KINDS, QUESTIONS, SPACES, kindById, type SpaceId } from '../kernel.ts';
import type { S1Answers, S1Question, S1Request } from './types.ts';
import { answerConfidence } from './decisionConfig.ts';

type NodeLike = { id: string; kind: string; title: string };

const NONE = 'none';

// ── level 1+2 in one request: space, and kind-within-each-space ─────────────────────────────────
/** "What does this text refer to?" → a space, and for every space the kind within it. Only the
 * chosen space's kind answer is read. `nodesByKind` limits the kind options to kinds that have
 * nodes (a kind with nothing in it can never be the answer). */
/** Kinds a text can point at: present in the graph and not singular (name/purpose/summary are
 * one-offs nobody refers to by title; left in, they became the sink for every vague phrase). */
export function pointableKinds(nodes: NodeLike[]) {
  const present = new Set(nodes.map((n) => n.kind));
  return KINDS.filter((k) => present.has(k.id) && !k.singular);
}
const sampleTitles = (nodes: NodeLike[], kind: string, n: number) => nodes.filter((x) => x.kind === kind).slice(0, n).map((x) => `"${x.title.slice(0, 40)}"`).join(', ');

/** Level 2 alone: one choice over every pointable kind, grounded with example titles. */
export function kindRequest(text: string, nodes: NodeLike[], examples = 3): S1Request {
  const kinds = pointableKinds(nodes);
  return {
    state: { text },
    questions: { kind: { type: 'choice', instructions: 'The text refers to one item in a product description. Which kind of item is it?', criteria: Object.fromEntries(kinds.map((k) => [k.id, `${k.label}: ${k.blurb} e.g. ${sampleTitles(nodes, k.id, examples)}`])) } },
  };
}
export function resolveKind(answers: S1Answers): { kind: string | null; confidence: number } {
  const a = answers.kind;
  if (!a || a.type !== 'choice') return { kind: null, confidence: 0 };
  return { kind: a.choice === NONE ? null : a.choice, confidence: answerConfidence(a) };
}

// ── node by text, the chain the functions use: candidates + kind in one request, then node ──────
/** Level 1: the substring candidates (when any) and the kind question side by side. A confident
 * candidate answer ends the chain; otherwise level 2 asks for the node within the chosen kind.
 * Measured on 20 labelled phrases over the seed graph (scripts/s1-eval.mjs): substring-only 6/20,
 * kind→node without examples 12/20, kind→node with example titles 17/20. */
export function nodeByTextRequest(text: string, nodes: NodeLike[], candidates: NodeLike[]): S1Request {
  const req = kindRequest(text, nodes);
  if (candidates.length) {
    req.questions.cand = {
      type: 'choice',
      instructions: 'Which of these nodes does the text refer to? Pick none if the text refers to nothing listed.',
      criteria: { ...Object.fromEntries(candidates.map((n) => [n.id, `${n.title} (${kindById[n.kind]?.label ?? n.kind})`])), [NONE]: 'None of these' },
    };
  }
  return req;
}
/** Level 2, or null when level 1 already resolved (a confident candidate, or no kind). */
export function nodeByTextNext(text: string, nodes: NodeLike[], answers: S1Answers, candidateThreshold: number): S1Request | null {
  const c = answers.cand;
  if (c && c.type === 'choice' && c.choice !== NONE && answerConfidence(c) >= candidateThreshold) return null;
  const k = resolveKind(answers);
  return k.kind ? nodeRequest(text, k.kind, nodes) : null;
}
export function resolveNodeByText(answers: S1Answers, candidateThreshold: number): { id: string | null; confidence: number; via: 'candidates' | 'kind' | 'none' } {
  const c = answers.cand;
  if (c && c.type === 'choice' && c.choice !== NONE && answerConfidence(c) >= candidateThreshold) return { id: c.choice, confidence: answerConfidence(c), via: 'candidates' };
  const k = resolveKind(answers);
  if (!k.kind) return { id: null, confidence: k.confidence, via: 'none' };
  const n = resolveNode(answers);
  if (!answers.node) return { id: null, confidence: k.confidence, via: 'kind' }; // level 2 never ran
  // A real pick within the kind confirms the kind (a wrong kind answers none at level 2), so it
  // stands on its own confidence: "H5" is a vague kind (≈0.5) but an unambiguous bet (≈0.97).
  // A none keeps the weaker of the two — it is only a not-found if the kind was right.
  if (n.id) return { id: n.id, confidence: n.confidence, via: 'kind' };
  return { id: null, confidence: Math.min(k.confidence, n.confidence), via: 'kind' };
}

export function spaceKindRequest(text: string, nodes: NodeLike[], examples = 3): S1Request {
  const pointable = pointableKinds(nodes);
  const present = new Set(pointable.map((k) => k.id));
  const spaces = SPACES.filter((s) => pointable.some((k) => k.space === s.id));
  // Each level's options are grounded in the level below: a space lists its kinds, a kind lists a
  // few real titles. Abstract blurbs alone sent Jev to "summary"/"name"/"asset" for concrete things.
  const sample = (kind: string) => sampleTitles(nodes, kind, examples);
  const questions: Record<string, S1Question> = {
    space: {
      type: 'choice',
      instructions: 'The text refers to one item in a product description. Which space is that item in?',
      criteria: Object.fromEntries(spaces.map((s) => [s.id, `${s.label} — ${KINDS.filter((k) => k.space === s.id && present.has(k.id)).map((k) => k.plural).join(', ')}`])),
    },
  };
  for (const s of spaces) {
    const kinds = KINDS.filter((k) => k.space === s.id && present.has(k.id));
    questions[`kind-${s.id}`] = {
      type: 'choice',
      instructions: `Assume the text refers to an item in the "${s.label}" space. Which kind of item is it?`,
      criteria: Object.fromEntries(kinds.map((k) => [k.id, `${k.label}: ${k.blurb} e.g. ${sample(k.id)}`])),
    };
  }
  return { state: { text }, questions };
}

export interface SpaceKindPick { space: SpaceId | null; kind: string | null; confidence: number }
export function resolveSpaceKind(answers: S1Answers): SpaceKindPick {
  const s = answers.space;
  if (!s || s.type !== 'choice' || s.choice === NONE) return { space: null, kind: null, confidence: s ? answerConfidence(s) : 0 };
  const k = answers[`kind-${s.choice}`];
  if (!k || k.type !== 'choice') return { space: s.choice as SpaceId, kind: null, confidence: answerConfidence(s) };
  return { space: s.choice as SpaceId, kind: k.choice, confidence: Math.min(answerConfidence(s), answerConfidence(k)) };
}

// ── level 3: node within a kind ─────────────────────────────────────────────────────────────────
export function nodeRequest(text: string, kind: string, nodes: NodeLike[], limit = 40): S1Request {
  const label = kindById[kind]?.label ?? kind;
  const ofKind = nodes.filter((n) => n.kind === kind).slice(0, limit);
  return {
    state: { text },
    questions: {
      node: {
        type: 'choice',
        // The kind's blurb grounds the pick: "the phone view" → Mirror went from ≈0.56 to ≈0.83 live.
        instructions: `The text refers to a ${label} (${kindById[kind]?.blurb ?? label}). Which of these ${label} items is it? Pick none if it is none of them.`,
        criteria: { ...Object.fromEntries(ofKind.map((n) => [n.id, n.title])), [NONE]: 'None of these' },
      },
    },
  };
}
export function resolveNode(answers: S1Answers): { id: string | null; confidence: number } {
  const a = answers.node;
  if (!a || a.type !== 'choice') return { id: null, confidence: 0 };
  return { id: a.choice === NONE ? null : a.choice, confidence: answerConfidence(a) };
}

// ── gaps: is one answer enough for two of them? three levels, one request ───────────────────────
/** The gap ontology: subject (which node) → invariant (what is missing) → repair (one combined
 * question). Two gaps consolidate when the repair level holds and at least one of the first two
 * does (same item, or same missing thing across sibling items) — three nouls asked together and
 * combined in code. The literal messages ride in the instructions, not in a shared
 * state, so a batch of many pairs never pads one pair's context with another's. */
export interface GapFact { message: string; subjectTitle?: string; subjectKind?: string; invariant: string; produces?: string }
export function gapPairQuestions(key: string, a: GapFact, b: GapFact): Record<string, S1Question> {
  const about = (g: GapFact) => (g.subjectTitle ? ` (about the ${g.subjectKind ?? 'item'} "${g.subjectTitle}")` : '');
  const pair = `Gap A${about(a)}: "${a.message}"\nGap B${about(b)}: "${b.message}"`;
  return {
    [`${key}:subject`]: { type: 'noul', instructions: `Are gap A and gap B about the same item (the same title)?\n${pair}`, criteria: { true: 'Same item', false: 'Different items' } },
    [`${key}:missing`]: { type: 'noul', instructions: `Is the same kind of thing missing in gap A and gap B — for example both lack a metric, both lack a test for a condition, both lack an interface — even if each item needs its own?\n${pair}`, criteria: { true: 'Same kind of thing missing', false: 'Different kinds of thing missing' } },
    [`${key}:repair`]: { type: 'noul', instructions: `Could both gaps be put to the user as one combined question that they answer in a single reply (the reply may have one part per gap)?\n${pair}`, criteria: { true: 'One combined question works', false: 'They must be asked separately' } },
  };
}
export interface GapPairVerdict { subject: number; missing: number; repair: number; together: boolean; confidence: number }
export function resolveGapPair(key: string, answers: S1Answers): GapPairVerdict | null {
  const pick = (level: string) => { const x = answers[`${key}:${level}`]; return x && x.type === 'noul' ? x.noul : undefined; };
  const subject = pick('subject'), missing = pick('missing'), repair = pick('repair');
  if (subject === undefined || missing === undefined || repair === undefined) return null;
  // consolidate when the chain holds end to end; a pair about the same item that needs two answers stays apart
  const together = repair >= 0.5 && (subject >= 0.5 || missing >= 0.5);
  const confidence = Math.min(...[subject, missing, repair].map((p) => Math.abs(p - 0.5) * 2));
  return { subject, missing, repair, together, confidence };
}

// ── raise-parent: which template question a gap hangs under, space first ────────────────────────
export function parentRequest(producesKind: string): S1Request {
  const kind = kindById[producesKind];
  const what = kind ? `${kind.label} (${kind.blurb})` : producesKind;
  const spaces = SPACES.filter((s) => QUESTIONS.some((q) => q.space === s.id));
  const questions: Record<string, S1Question> = {
    space: {
      type: 'choice',
      instructions: `A gap in the product description will be filled by adding a ${what}. Which space does that belong to?`,
      criteria: Object.fromEntries(spaces.map((s) => [s.id, `${s.label}: ${s.blurb}`])),
    },
  };
  for (const s of spaces) {
    const qs = QUESTIONS.filter((q) => q.space === s.id);
    questions[`q-${s.id}`] = {
      type: 'choice',
      instructions: `Assume the gap belongs to the "${s.label}" space. Under which of these template questions should the user be asked to supply the ${what}?`,
      criteria: Object.fromEntries(qs.map((q) => [q.id, q.prompt])),
    };
  }
  return { state: { missing: what }, questions };
}
export function resolveParent(answers: S1Answers): { questionId: string | null; space: string | null; confidence: number } {
  const s = answers.space;
  if (!s || s.type !== 'choice') return { questionId: null, space: null, confidence: 0 };
  const q = answers[`q-${s.choice}`];
  if (!q || q.type !== 'choice') return { questionId: null, space: s.choice, confidence: answerConfidence(s) };
  return { questionId: q.choice, space: s.choice, confidence: Math.min(answerConfidence(s), answerConfidence(q)) };
}

/** The flat alternative, kept for the eval and as the level a tiny question set can skip to. */
export function flatParentRequest(producesKind: string): S1Request {
  const kind = kindById[producesKind];
  const what = kind ? `${kind.label} (${kind.blurb})` : producesKind;
  return {
    state: { missing: what },
    questions: { q: { type: 'choice', instructions: `A gap in the product description will be filled by adding a ${what}. Under which of these template questions should the user be asked for it?`, criteria: Object.fromEntries(QUESTIONS.map((q) => [q.id, q.prompt])) } },
  };
}
