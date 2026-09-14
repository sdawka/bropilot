// The AI-function registry: metadata only, no implementations (S128). Node-runnable (imported by
// kernel.ts for the digest and by scripts/emit-docs.mjs) — imports nothing but ./types.ts and
// ../provenance.ts. Stage 1-A fills in `prompt`; functions/*.ts (browser-only) hold the stubs.

import type { AIFunctionMeta } from './types.ts';
import { said } from '../provenance.ts';

const decides: AIFunctionMeta['feedback'] = [
  { value: 'makes-sense', label: 'Makes sense' },
  { value: 'doesnt', label: "Doesn't make sense" },
  { value: 'bad-question', label: 'Bad question' },
];
const states: AIFunctionMeta['feedback'] = [
  { value: 'makes-sense', label: 'Makes sense' },
  { value: 'doesnt', label: "Doesn't make sense" },
];

export const AI_FUNCTIONS: AIFunctionMeta[] = [
  {
    id: 'describe-screen',
    version: '0.1',
    purpose: 'Names what is visible on the active view and points at the matching cards.',
    context: { needs: ['screen', 'selection', 'graph'] },
    prompt: `The user said: {{input}}\nHere is the current screen and graph context:\n{{context}}\n\nIf the text names a node (by title, or close to it), point at that node and its immediate neighbours, then explain it in one or two sentences: what it is, why it exists, what it connects to. Quote the user's own words if you have them.\nIf the text names nothing in the graph, say so plainly and suggest a node name, "edit bet: …", or a tour instead.\nIf the text is empty, just describe what the active screen is currently showing (counts by kind are enough).`,
    output: 'One utterance describing the active view, plus a point cue at the items it names.',
    feedback: states,
    source: said(119, 120),
  },
  {
    id: 'next-decision',
    version: '0.1',
    purpose: 'Ranks the next unanswered question and open gaps, and surfaces the single most important one.',
    context: { needs: ['next', 'gaps'] },
    prompt: `Context:\n{{context}}\n\nPick exactly one thing to surface next: the next unlocked, unanswered question if there is one, otherwise the single most important open gap. Ask about it in one sentence, say why it matters, and offer "Answer it" / "Skip" as options. Never surface more than one item.`,
    output: 'One ask/say cue naming the next question or gap, with a one-line reason.',
    feedback: decides,
    source: said(116, 117),
  },
  {
    id: 'answer-to-effects',
    version: '0.1',
    purpose: 'Turns free-text answer content into staged add/update node and edge effects.',
    context: { needs: ['next', 'graph'] },
    prompt: `The user's answer: {{input}}\nContext (the question being answered, and the current graph):\n{{context}}\n\nSplit the answer into one node per distinct idea (one per non-empty line for a plural kind; the whole answer as one node/update for a singular kind). Keep the user's own wording as the title. Skip anything that already exists under that kind — warn instead of duplicating. Never touch the graph directly: only produce the effects to stage.`,
    output: 'A changeset: one effect per non-empty line (or one update for a singular kind).',
    feedback: states,
    source: said(21, 27),
  },
  {
    id: 'propose-followup',
    version: '0.1',
    purpose: 'Given a question or node, proposes one sub-question or follow-up thread.',
    context: { needs: ['selection', 'next'] },
    prompt: `Parent (a selected node, or the next open question):\n{{context}}\n\nPropose exactly one concrete sub-question that would make the parent more specific or testable — a request for an example, a number, or a name, not another open-ended question. One sentence.`,
    output: 'One followup cue: a sub-question or thread prompt under the parent.',
    feedback: decides,
    source: said(52, 53, 54),
  },
  {
    id: 'explain-node',
    version: '0.1',
    purpose: 'Explains a selected node in context: why it exists, what it connects to, its verdict.',
    context: { needs: ['selection', 'graph'] },
    prompt: `Selected node and its neighbours:\n{{context}}\nUser text (if this was a text command, e.g. "edit bet: …"): {{input}}\n\nWalk the node: what it is, why it exists (its edges to problems/causes), what depends on or is satisfied by it, and any verdict/evidence it carries. Point at each group of neighbours before describing it. Two sentences per step, at most.\nIf the user asked to reword it, ask for the new wording first, then stage the rename — never edit without asking.`,
    output: 'A short sequence of say + point cues walking the node and its neighbours.',
    feedback: states,
    source: said(62, 65),
  },
  {
    id: 'walk-map',
    version: '0.1',
    purpose: 'Tours the level-0 Map: problem, bets, solution, then the reality-side test loop.',
    context: { needs: ['graph'] },
    prompt: `Graph summary:\n{{context}}\n\nWalk the level-0 Map in this fixed order: (1) what the Map shows (representation vs. reality, joined by tests), (2) the main problem, (3) the bets, (4) the capabilities and which problems they satisfy, (5) how many tests are unfulfilled on the reality side. One or two sentences per step; point at what you're naming before you say it.`,
    output: 'A sequence cue: a fixed set of navigate/point/say steps over the Map.',
    feedback: states,
    source: said(79, 80, 81),
  },
  {
    id: 'find-gaps',
    version: '0.1',
    purpose: 'Runs the gap checks (nodes with no edges; bets with no metric) and reports them.',
    context: { needs: ['gaps', 'graph'] },
    prompt: `Graph:\n{{context}}\n\nReport every open gap in one line each: nodes with no edges at all, and bets (hypotheses) with no linked metric. Name up to three examples per gap type. If there are none, say the graph has no gaps right now.`,
    output: 'A list of one-line gap descriptions; extensible with more checks later.',
    feedback: states,
    source: said(83),
  },
  {
    id: 'unrealised-to-tasks',
    version: '0.1',
    purpose: 'Finds protocols with no realising practice and stages an epic plus one task each.',
    context: { needs: ['graph'] },
    prompt: `Protocols and which practices realise them:\n{{context}}\n\nFind every protocol with no realising practice. If there are none, say so and stop. Otherwise propose one epic ("Realise N unrealised protocols") containing one task per missing protocol ("Put "<protocol>" into practice"), and stage it — never commit directly. Name every missing protocol in the summary.`,
    output: 'A stage cue: one epic node and one task node + contains edge per unrealised protocol.',
    feedback: decides,
    source: said(101, 105, 107),
  },
  {
    id: 'define-term',
    version: '0.1',
    purpose: 'Two-step glossary flow: asks for a term, then its definition, then commits it.',
    context: { needs: ['selection'] },
    prompt: `Conversation so far: {{context}}\nLatest user text: {{input}}\n\nThis is a two-step flow. If no term has been collected yet, ask for the term (a word or phrase) and nothing else. Once you have a term, ask for its definition in one sentence. Once you have both, commit the glossary upsert immediately — this is the one flow allowed to skip the stage/approve step — and tell the user it's done and undoable.`,
    output: 'A glossary upsert cue, committed immediately (the escape hatch).',
    feedback: states,
    source: said(59),
  },
];

export const aiFunctionById = Object.fromEntries(AI_FUNCTIONS.map((f) => [f.id, f])) as Record<string, AIFunctionMeta>;
