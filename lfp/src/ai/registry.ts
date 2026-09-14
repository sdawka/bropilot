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
    context: { needs: ['screen', 'selection'] },
    prompt: '',
    output: 'One utterance describing the active view, plus a point cue at the items it names.',
    feedback: states,
    source: said(119, 120),
  },
  {
    id: 'next-decision',
    version: '0.1',
    purpose: 'Ranks the next unanswered question and open gaps, and surfaces the single most important one.',
    context: { needs: ['next', 'gaps'] },
    prompt: '',
    output: 'One ask/say cue naming the next question or gap, with a one-line reason.',
    feedback: decides,
    source: said(116, 117),
  },
  {
    id: 'answer-to-effects',
    version: '0.1',
    purpose: 'Turns free-text answer content into staged add/update node and edge effects.',
    context: { needs: ['next', 'graph'] },
    prompt: '',
    output: 'A changeset: one effect per non-empty line (or one update for a singular kind).',
    feedback: states,
    source: said(21, 27),
  },
  {
    id: 'propose-followup',
    version: '0.1',
    purpose: 'Given a question or node, proposes one sub-question or follow-up thread.',
    context: { needs: ['selection', 'next'] },
    prompt: '',
    output: 'One followup cue: a sub-question or thread prompt under the parent.',
    feedback: decides,
    source: said(52, 53, 54),
  },
  {
    id: 'explain-node',
    version: '0.1',
    purpose: 'Explains a selected node in context: why it exists, what it connects to, its verdict.',
    context: { needs: ['selection', 'graph'] },
    prompt: '',
    output: 'A short sequence of say + point cues walking the node and its neighbours.',
    feedback: states,
    source: said(62, 65),
  },
  {
    id: 'walk-map',
    version: '0.1',
    purpose: 'Tours the level-0 Map: problem, bets, solution, then the reality-side test loop.',
    context: { needs: ['graph'] },
    prompt: '',
    output: 'A sequence cue: a fixed set of navigate/point/say steps over the Map.',
    feedback: states,
    source: said(79, 80, 81),
  },
  {
    id: 'find-gaps',
    version: '0.1',
    purpose: 'Runs the gap checks (nodes with no edges; bets with no metric) and reports them.',
    context: { needs: ['gaps', 'graph'] },
    prompt: '',
    output: 'A list of one-line gap descriptions; extensible with more checks later.',
    feedback: states,
    source: said(83),
  },
  {
    id: 'unrealised-to-tasks',
    version: '0.1',
    purpose: 'Finds protocols with no realising practice and stages an epic plus one task each.',
    context: { needs: ['graph'] },
    prompt: '',
    output: 'A stage cue: one epic node and one task node + contains edge per unrealised protocol.',
    feedback: decides,
    source: said(101, 105, 107),
  },
  {
    id: 'define-term',
    version: '0.1',
    purpose: 'Two-step glossary flow: asks for a term, then its definition, then commits it.',
    context: { needs: ['selection'] },
    prompt: '',
    output: 'A glossary upsert cue, committed immediately (the escape hatch).',
    feedback: states,
    source: said(59),
  },
];

export const aiFunctionById = Object.fromEntries(AI_FUNCTIONS.map((f) => [f.id, f])) as Record<string, AIFunctionMeta>;
