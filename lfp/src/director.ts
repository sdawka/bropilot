// The Director protocol: everything an agent can do to the main screen, as a small typed vocabulary.
// Whoever speaks it (a scripted tour today, a Flue agent tomorrow) has the same powers. It doubles as the LLM tool list.

import {
  state, nodeById, upsertTerm, removeNodeDirect, persist, describe, nextQuestion,
  answer, answerFollowUp, addFollowUp, commit, discardStaged, undo,
  type Effect, type FollowUp,
} from './store';
import { QUESTIONS } from './kernel';
import { computeGaps } from './ai/functions/find-gaps.ts';

export type View = 'overview' | 'definition' | 'domain' | 'flows' | 'kernel';

export type Cue =
  | { t: 'say'; text: string; id?: string }
  | { t: 'navigate'; view: View; params?: { level?: 0 | 1 | 2 | 3; module?: string; question?: string } }
  | { t: 'point'; nodes?: string[]; edges?: string[]; focus?: string }
  | { t: 'clear' }
  | { t: 'sequence'; steps: Cue[][]; dwellMs?: number }
  | { t: 'stage'; effects: Effect[]; note: string }
  | { t: 'glossary'; op: 'upsert' | 'remove'; title: string; description?: string; id?: string }
  | { t: 'ask'; text: string; options?: string[]; id: string }
  | { t: 'answer'; questionId: string; content: string }
  | { t: 'followup'; parentId: string; prompt: string; kind: FollowUp['kind']; produces?: string }
  | { t: 'commit'; accept?: string[] }
  | { t: 'discard' }
  | { t: 'undo' };

export interface Ask { id: string; text: string; options?: string[] }
export interface Tour { steps: Cue[][]; i: number; dwellMs: number; paused: boolean }

/** What the main screen tells the agent and the mirror about itself. */
export interface Context {
  view: string;
  params: Record<string, string>;
  selectedId: string | null;
  say: { id: string; text: string } | null;
  ask: Ask | null;
  pointing: string[]; // titles of highlighted nodes
  tour: { i: number; n: number; paused: boolean } | null;
  staged: { count: number; note: string; effects: string[]; ids: string[] } | null;
  topics: { id: string; label: string }[]; // tour starters the director offers
  graph: { nodes: number; edges: number };
  transport: string;
  screen: { view: string; params: Record<string, string>; items: ScreenItemLite[] }; // what the active view is rendering, capped at 80
  next: { questionId: string; prompt: string; produces: string; unlocks: string[] } | null;
  gaps: string[]; // exactly two checks: nodes with no edges, hypotheses with no metric
}
type ScreenItemLite = { id: string; kind: string; title: string; group?: string };

export type UserTurn =
  | { text: string }
  | { choice: string; forAsk: string }
  | { control: 'next' | 'back' | 'stop' | 'approve' | 'discard' | 'undo' }
  | { topic: string };

export interface Director {
  topics(): { id: string; label: string }[];
  start(topic: string): Cue[];
  onUser(turn: UserTurn): Cue[];
  onContext?(ctx: Context): void;
}

// ── applying cues on the main screen ────────────────────────────────────────
let dwellTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<(cue: Cue) => void>();
export function onCueApplied(fn: (cue: Cue) => void) { listeners.add(fn); return () => listeners.delete(fn); }

export function applyCue(cue: Cue) {
  switch (cue.t) {
    case 'say':
      state.ask = null; // one thing at a time: a new utterance replaces a pending question (inv-one-utterance)
      state.say = { id: cue.id ?? `s-${Date.now()}`, text: cue.text };
      state.transcript.push({ who: 'agent', text: cue.text, at: Date.now() });
      break;
    case 'navigate':
      if (cue.params?.level !== undefined) state.domainLevel = cue.params.level;
      if (cue.params?.module) state.domainModule = cue.params.module;
      if (cue.params?.question) state.definitionQuestion = cue.params.question;
      if (location.hash.slice(1).split('?')[0] !== cue.view) location.hash = cue.view;
      break;
    case 'point':
      state.highlight = { nodes: cue.nodes ?? [], edges: cue.edges ?? [], focus: cue.focus ?? null };
      state.selectedId = cue.focus ?? state.selectedId;
      if (cue.focus) document.querySelector(`[data-node-id="${cue.focus}"]`)?.scrollIntoView({ block: 'center' });
      break;
    case 'clear':
      state.highlight = { nodes: [], edges: [], focus: null };
      state.selectedId = null;
      break;
    case 'sequence':
      stopTour();
      state.tour = { steps: cue.steps, i: -1, dwellMs: cue.dwellMs ?? 0, paused: !(cue.dwellMs && cue.dwellMs > 0) };
      tourStep(1);
      break;
    case 'stage':
      state.staged = { effects: cue.effects, warnings: [cue.note] };
      state.transcript.push({ who: 'agent', text: `Staged ${cue.effects.length} change${cue.effects.length === 1 ? '' : 's'}: ${cue.note}`, at: Date.now() });
      persist();
      break;
    case 'glossary':
      if (cue.op === 'upsert') upsertTerm(cue.title, cue.description ?? '', cue.id);
      else if (cue.id) removeNodeDirect(cue.id);
      break;
    case 'ask':
      state.ask = { id: cue.id, text: cue.text, options: cue.options };
      state.say = { id: cue.id, text: cue.text };
      state.transcript.push({ who: 'agent', text: cue.text, at: Date.now() });
      break;
    case 'answer': {
      const isRoot = QUESTIONS.some((q) => q.id === cue.questionId);
      if (isRoot) answer(cue.questionId, cue.content); else answerFollowUp(cue.questionId, cue.content);
      state.transcript.push({ who: 'agent', text: `Answered ${cue.questionId}: "${cue.content}"`, at: Date.now() });
      break;
    }
    case 'followup': {
      const f = addFollowUp(cue.parentId, cue.prompt, cue.kind, cue.produces);
      state.transcript.push({ who: 'agent', text: `Added ${cue.kind} "${cue.prompt}" (${f.id}) under ${cue.parentId}`, at: Date.now() });
      break;
    }
    case 'commit': {
      const ids = new Set(cue.accept ?? (state.staged?.effects.map((e) => e.id) ?? []));
      const r = commit(ids);
      state.transcript.push({ who: 'agent', text: `Committed ${r?.applied ?? 0} change${r?.applied === 1 ? '' : 's'}.`, at: Date.now() });
      break;
    }
    case 'discard':
      discardStaged();
      state.transcript.push({ who: 'agent', text: 'Discarded. Nothing changed.', at: Date.now() });
      break;
    case 'undo':
      undo();
      state.transcript.push({ who: 'agent', text: 'Undone.', at: Date.now() });
      break;
  }
  listeners.forEach((fn) => fn(cue));
}

export function applyCues(cues: Cue[]) { for (const c of cues) applyCue(c); }

/** Advance (+1) or go back (−1) in the current tour; applies that step's cues. */
export function tourStep(delta: 1 | -1) {
  const t = state.tour; if (!t) return;
  const next = t.i + delta;
  if (next < 0 || next >= t.steps.length) { if (next >= t.steps.length) stopTour(); return; }
  t.i = next;
  for (const c of t.steps[next]) applyCue(c);
  if (dwellTimer) clearTimeout(dwellTimer);
  if (!t.paused && t.dwellMs > 0 && next < t.steps.length - 1) dwellTimer = setTimeout(() => tourStep(1), t.dwellMs);
}
export function stopTour() { if (dwellTimer) clearTimeout(dwellTimer); dwellTimer = null; state.tour = null; }
export function pauseTour() { const t = state.tour; if (t) { t.paused = true; if (dwellTimer) clearTimeout(dwellTimer); } }

// ── context the main screen publishes ───────────────────────────────────────
export function currentContext(topics: { id: string; label: string }[], transport: string): Context {
  const [view, qs] = location.hash.slice(1).split('?');
  const nq = nextQuestion.value;
  return {
    view: view || 'overview',
    params: Object.fromEntries(new URLSearchParams(qs ?? '')),
    selectedId: state.selectedId,
    say: state.say,
    ask: state.ask,
    pointing: [...(state.highlight.focus ? [state.highlight.focus] : []), ...state.highlight.nodes]
      .filter((v, i, a) => a.indexOf(v) === i)
      .map((id) => nodeById(id)?.title ?? state.screen.items.find((it) => it.id === id)?.title ?? id)
      .slice(0, 6),
    tour: state.tour ? { i: state.tour.i, n: state.tour.steps.length, paused: state.tour.paused } : null,
    staged: state.staged ? { count: state.staged.effects.length, note: state.staged.warnings[0] ?? '', effects: state.staged.effects.map(describe), ids: state.staged.effects.map((e) => e.id) } : null,
    topics,
    graph: { nodes: state.graph.nodes.length, edges: state.graph.edges.length },
    transport,
    screen: { view: state.screen.view, params: state.screen.params, items: state.screen.items.slice(0, 80) },
    next: nq ? { questionId: nq.id, prompt: nq.prompt, produces: nq.produces, unlocks: QUESTIONS.filter((q) => q.unlocksAfter.includes(nq.id)).map((q) => q.id) } : null,
    gaps: computeGaps(),
  };
}
