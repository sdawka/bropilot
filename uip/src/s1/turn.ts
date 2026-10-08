// One System One request per chat turn (SPEC §6): every branch fanned out, only the chosen chain is
// read by resolve.ts. Pure (no Vue, no fetch) so node tests and the Worker can import it.
import type { DecideRequest, Graph, Node, Perspective, PerspId, S1Question } from '../types';
import type { OntoKind, Ontology } from './onto';
import { containsPhrase, overlap, stripTokens, tokens } from './text';

export const MAX_QUESTIONS = 64;     // Clef cap per request
export const MAX_TOKENS = 64_000;    // state + questions, tokens ≈ JSON chars / 4
export const NODE_LIMIT = 40;
export const CAND_LIMIT = 12;
export const NONE = 'none';
export const approxTokens = (x: unknown): number => Math.ceil(JSON.stringify(x ?? '').length / 4);
export const nodeKey = (kind: string) => `node-${kind}`;
export const kindKey = (space: string) => `kind-${space}`;

export interface TurnInput {
  text: string;
  context: { node?: Node | null; persp: PerspId; level?: number };
  graph: Graph; ontology: Ontology; perspectives: Perspective[];
}
export interface BuiltTurn { request: DecideRequest; candidates: Node[]; dropped: string[]; tokens: number }

/** Kinds a text can point at: present in the graph and not singular (SPEC §6, lfp ontology.ts). */
export function pointableKinds(o: Ontology, nodes: Node[]): OntoKind[] {
  const present = new Set(nodes.map((n) => n.kind));
  return o.KINDS.filter((k) => present.has(k.id) && !k.singular);
}

/** ≤12 title hits: whole-title phrase first, then token overlap. */
export function candidatesFor(text: string, nodes: Node[], limit = CAND_LIMIT): Node[] {
  const clean = stripTokens(text);
  const tt = tokens(clean);
  const scored: { n: Node; s: number }[] = [];
  for (const n of nodes) {
    let s = containsPhrase(clean, n.title) ? 100 + n.title.length : 0;
    if (!s) { const o = overlap(tt, tokens(n.title)); s = o ? o * 10 - tokens(n.title).length * 0.1 : 0; }
    if (s > 0) scored.push({ n, s });
  }
  return scored.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.n);
}

const sampleTitles = (nodes: Node[], kind: string, n = 3) =>
  nodes.filter((x) => x.kind === kind).slice(0, n).map((x) => `"${x.title.slice(0, 40)}"`).join(', ');

export function chainText(p: Perspective, o: Ontology): string {
  const label = (k: string) => o.KINDS.find((x) => x.id === k)?.label.toLowerCase() ?? k;
  return p.steps.map((s) => s.kinds.map(label).join('/')).join(' → ');
}

export const INTENT_CRITERIA: Record<string, string> = {
  navigate: 'Go to or show a place or item in the product map (show, open, go to, where is)',
  ask: 'A question whose answer is a list of items in the map (which, what, how many)',
  propose: 'Change the map: add, create, link, rename or remove an item',
  explain: 'Explain why an item exists or what it means',
  check: 'Check whether part of the map is right: is a link solid, what is missing, what is inconsistent',
  [NONE]: 'Small talk, or nothing about the product map',
};

export function buildTurn(input: TurnInput): BuiltTurn {
  const { text, context, graph, ontology: o, perspectives } = input;
  const nodes = graph.nodes;
  const kinds = pointableKinds(o, nodes);
  const kindIds = new Set(kinds.map((k) => k.id));
  const kindById = Object.fromEntries(o.KINDS.map((k) => [k.id, k]));
  const candidates = candidatesFor(text, nodes);

  const questions: Record<string, S1Question> = {
    intent: { type: 'choice', instructions: 'What does the user want from this message about their product map?', criteria: INTENT_CRITERIA },
    persp: {
      type: 'choice',
      instructions: 'Which way of walking the product map fits this message best?',
      criteria: {
        ...Object.fromEntries(perspectives.map((p) => [p.id, `${p.label}: ${chainText(p, o)}`])),
        keep: `Keep the current perspective (${context.persp})`,
      },
    },
  };
  questions['check-family'] = {
    type: 'choice', instructions: 'If the message asks for a check, what kind of check?',
    criteria: { solidity: 'Whether existing links are right (is this solid, does X really satisfy Y)', completeness: 'What is missing (what is missing on X, what does X lack)', consistency: 'What disagrees (what is inconsistent, any contradictions, does X match Y)', all: 'Everything about the item, or not said' },
  };
  if (context.node) {
    questions['uses-context'] = {
      type: 'noul',
      instructions: `The user is looking at the ${kindById[context.node.kind]?.label ?? context.node.kind} "${context.node.title}". Does the text refer to the selected node (this, it, here)?`,
      criteria: { true: 'The text is about the selected node', false: 'The text is about something else or the whole project' },
    };
  }
  const spaces = o.SPACES.filter((s) => kinds.some((k) => k.space === s.id));
  questions.space = {
    type: 'choice',
    instructions: 'The text refers to one item in a product description. Which space is that item in?',
    criteria: {
      ...Object.fromEntries(spaces.map((s) => [s.id, `${s.label} — ${kinds.filter((k) => k.space === s.id).map((k) => k.plural).join(', ')}`])),
      [NONE]: 'None of these',
    },
  };
  for (const s of spaces) {
    questions[kindKey(s.id)] = {
      type: 'choice',
      instructions: `Assume the text refers to an item in the "${s.label}" space. Which kind of item is it?`,
      criteria: {
        ...Object.fromEntries(kinds.filter((k) => k.space === s.id).map((k) => [k.id, `${k.label}: ${k.blurb ?? ''} e.g. ${sampleTitles(nodes, k.id)}`])),
        [NONE]: 'None of these',
      },
    };
  }
  for (const k of kinds) {
    const ofKind = nodes.filter((n) => n.kind === k.id).slice(0, NODE_LIMIT);
    questions[nodeKey(k.id)] = {
      type: 'choice',
      instructions: `The text refers to a ${k.label} (${k.blurb ?? k.label}). Which of these ${k.label} items is it? Pick none if it is none of them.`,
      criteria: { ...Object.fromEntries(ofKind.map((n) => [n.id, n.title])), [NONE]: 'None of these' },
    };
  }
  if (candidates.length) {
    questions.cand = {
      type: 'choice',
      instructions: 'Which of these nodes does the text refer to? Pick none if the text refers to nothing listed.',
      criteria: { ...Object.fromEntries(candidates.map((n) => [n.id, `${n.title} (${kindById[n.kind]?.label ?? n.kind})`])), [NONE]: 'None of these' },
    };
  }

  const state = {
    text,
    context: {
      ...(context.node ? { node: { title: context.node.title, kind: context.node.kind } } : {}),
      persp: context.persp,
      ...(context.level != null ? { level: context.level } : {}),
    },
    candidates: candidates.map((n) => n.title),
  };

  // Budget: drop node-<kind> for the kinds with the fewest candidate hits first.
  const dropped: string[] = [];
  const tt = tokens(stripTokens(text));
  const hits = (kind: string) =>
    candidates.filter((n) => n.kind === kind).length * 10 +
    overlap(tt, tokens(`${kindById[kind]?.label ?? ''} ${kindById[kind]?.plural ?? ''}`)) * 5 +
    (context.node?.kind === kind ? 3 : 0);
  const size = () => approxTokens(state) + Object.values(questions).reduce((a, q) => a + approxTokens(q), 0);
  const droppable = [...kindIds].sort((a, b) => hits(a) - hits(b) || nodes.filter((n) => n.kind === b).length - nodes.filter((n) => n.kind === a).length);
  let tok = size();
  while ((Object.keys(questions).length > MAX_QUESTIONS || tok > MAX_TOKENS) && droppable.length) {
    const k = droppable.shift()!;
    delete questions[nodeKey(k)];
    dropped.push(k);
    tok = size();
  }
  return { request: { fn: 'turn', state, questions }, candidates, dropped, tokens: tok };
}
