// The Director protocol: everything an agent can do to the main screen, as a small typed vocabulary.
// Whoever speaks it (a scripted tour today, a Flue agent tomorrow) has the same powers. It doubles as the LLM tool list.

import {
  state, nodeById, upsertTerm, removeNodeDirect, persist, describe,
  answer, answerFollowUp, addFollowUp, commit, discardStaged, undo,
  revalidate, rankOpen, directCommit, refineFollowUp,
  type Effect, type FollowUp, type OpenItem,
} from './store';
import { QUESTIONS, kindById, edgeTypeById } from './kernel';
import { computeGaps } from './ai/functions/find-gaps.ts';

export type View = 'overview' | 'definition' | 'domain' | 'flows' | 'kernel';

export type Cue =
  // transient: a placeholder ("Deciding…") shown on the strip until the real cues land, never
  // written to the transcript (found in session 2026-09-28: each one read as an agent message).
  | { t: 'say'; text: string; id?: string; transient?: true }
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
  | { t: 'undo' }
  | { t: 'revalidate'; nodeId: string }
  | { t: 'raise'; prompt: string; produces: string; subjects: string[]; source: 'agent' | 'contradiction'; taskId?: string }
  | { t: 'refine'; followupId: string; prompt: string; options?: string[] };

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
  next: OpenItem | null; // top of rankOpen(): tier 1 (agent-blocking) > 2 (template) > 3 (violation) > 4 (rest)
  suspect: { edges: number; nodes: string[] }; // count of suspect edges; titles of nodes touched by one, capped at 10
  gaps: string[]; // exactly two checks: nodes with no edges, hypotheses with no metric
}
type ScreenItemLite = { id: string; kind: string; title: string; group?: string };

export type UserTurn =
  | { text: string; forItem?: string } // forItem: the Now item (template question or follow-up id) this text answers — applied as an `answer` cue in code, no director turn
  | { choice: string; forAsk: string } // forAsk an open item's id (a Now-strip option): answered in code like forItem; an ask cue's id: a director turn
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

/** Effects as the store applies them, from either the code's own Effect objects or an agent's flat
 * `{op, kind, title}` / `{op, src|from, dst|to, type|edgeType}` / `{op, nodeId, patch}`. Unknown
 * kinds, edge types and node ids (not in the graph nor added in this changeset) are dropped with a
 * warning instead of poisoning the changeset. */
export function normaliseEffects(raw: unknown[], staged: Effect[]): { effects: Effect[]; warnings: string[] } {
  const effects: Effect[] = []; const warnings: string[] = [];
  const known = new Set<string>([...state.graph.nodes.map((n) => n.id), ...staged.filter((e) => e.op === 'add-node').map((e) => (e as Extract<Effect, { op: 'add-node' }>).node.id)]);
  const kebab = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  const nextId = () => `ef-${staged.length + effects.length}`;
  for (const r of raw) {
    const e = (r ?? {}) as Record<string, any>;
    if (e.op === 'add-node') {
      const node = e.node ?? (e.kind && e.title ? { id: `${e.kind}-${kebab(String(e.title))}`, kind: e.kind, title: String(e.title), ...(e.description ? { description: String(e.description) } : {}), status: 'draft' } : null);
      if (!node?.id || !node.kind || !node.title) { warnings.push('An add-node effect had no kind and title; skipped.'); continue; }
      if (!kindById[node.kind]) { warnings.push(`Unknown kind "${node.kind}"; skipped.`); continue; }
      if (known.has(node.id)) { warnings.push(`"${node.title}" already exists; skipped.`); continue; }
      known.add(node.id);
      effects.push({ id: e.id ?? nextId(), op: 'add-node', node, answerId: e.answerId ?? '' });
    } else if (e.op === 'add-edge') {
      const edge = e.edge ?? { src: e.src ?? e.from, dst: e.dst ?? e.to, type: e.type ?? e.edgeType };
      if (!edge.src || !edge.dst || !edge.type) { warnings.push('An add-edge effect had no src, dst and type; skipped.'); continue; }
      if (!edgeTypeById[edge.type]) { warnings.push(`Unknown edge type "${edge.type}"; skipped.`); continue; }
      const missing = [edge.src, edge.dst].find((id) => !known.has(id));
      if (missing) { warnings.push(`No node "${missing}"; skipped.`); continue; }
      if (state.graph.edges.some((x) => x.src === edge.src && x.dst === edge.dst && x.type === edge.type)) { warnings.push(`Edge ${edge.src} —${edge.type}→ ${edge.dst} already exists; skipped.`); continue; }
      effects.push({ id: e.id ?? nextId(), op: 'add-edge', edge: { id: edge.id ?? `e-${edge.src}-${edge.type}-${edge.dst}`, src: edge.src, dst: edge.dst, type: edge.type, status: 'draft', ...(edge.answerId ? { answerId: edge.answerId } : {}) }, answerId: e.answerId ?? '' });
    } else if (e.op === 'update-node' || e.op === 'remove-node') {
      const nodeId = e.nodeId ?? e.id;
      if (!nodeId || !known.has(nodeId)) { warnings.push(`No node "${nodeId ?? '?'}" to ${e.op === 'remove-node' ? 'remove' : 'update'}; skipped.`); continue; }
      if (e.op === 'update-node') effects.push({ id: e.id && e.id !== nodeId ? e.id : nextId(), op: 'update-node', nodeId, patch: e.patch ?? {}, answerId: e.answerId ?? '' });
      else effects.push({ id: e.id && e.id !== nodeId ? e.id : nextId(), op: 'remove-node', nodeId, answerId: e.answerId ?? '' });
    } else warnings.push(`Unknown effect op "${e.op ?? '?'}"; skipped.`);
  }
  return { effects, warnings };
}

export function applyCue(cue: Cue) {
  switch (cue.t) {
    case 'say':
      state.ask = null; // one thing at a time: a new utterance replaces a pending question (inv-one-utterance)
      state.say = { id: cue.id ?? `s-${Date.now()}`, text: cue.text };
      if (!cue.transient) state.transcript.push({ who: 'agent', text: cue.text, at: Date.now() });
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
    case 'stage': {
      // An agent's effects arrive in whatever shape the model chose (live 2026-09-28: a critique
      // staged `{op:'add-edge', from, to, type}`; commit then threw on `e.edge.src` and the page
      // was dead from there). Normalise to the Effect shape, drop what cannot be applied, and say so.
      // the code's own changesets (answer, link-answer, need repair) arrive as full Effects with an
      // answerId and replace what is staged, exactly as before
      if (cue.effects.length && cue.effects.every((e) => e && typeof e === 'object' && 'answerId' in e)) {
        state.staged = { effects: cue.effects, warnings: [cue.note] };
        state.transcript.push({ who: 'agent', text: `Staged ${cue.effects.length} change${cue.effects.length === 1 ? '' : 's'}: ${cue.note}`, at: Date.now() });
        persist();
        break;
      }
      const { effects, warnings } = normaliseEffects(cue.effects as unknown[], state.staged?.effects ?? []);
      if (!effects.length) {
        state.transcript.push({ who: 'agent', text: `Nothing staged: ${warnings.join(' ') || 'no valid effects.'} (${cue.note})`, at: Date.now() });
        persist();
        break;
      }
      // an agent stage while the user's own answer is staged adds to that changeset, not over it
      const prior = state.staged && state.staged.effects.some((e) => e.answerId) ? state.staged : null;
      state.staged = { effects: [...(prior?.effects ?? []), ...effects], warnings: [...(prior?.warnings ?? []), cue.note, ...warnings] };
      state.transcript.push({ who: 'agent', text: `Staged ${effects.length} change${effects.length === 1 ? '' : 's'}: ${cue.note}${warnings.length ? ` (${warnings.join(' ')})` : ''}`, at: Date.now() });
      persist();
      break;
    }
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
    case 'revalidate':
      revalidate(cue.nodeId);
      state.transcript.push({ who: 'agent', text: `Revalidated ${nodeById(cue.nodeId)?.title ?? cue.nodeId}.`, at: Date.now() });
      break;
    case 'raise': {
      const parentId = QUESTIONS.find((q) => q.produces === cue.produces)?.id ?? 'q-capability';
      const f = addFollowUp(parentId, cue.prompt, 'thread', cue.produces);
      f.raisedBy = { kind: cue.source, ref: cue.taskId ?? cue.source };
      f.subjects = cue.subjects;
      if (cue.taskId) directCommit([{ id: 'ef-0', op: 'update-node', nodeId: cue.taskId, patch: { props: { ...(nodeById(cue.taskId)?.props ?? {}), status: 'blocked' } }, answerId: 'direct' }], 'blocked by question');
      state.transcript.push({ who: 'agent', text: `Raised: "${cue.prompt}"${cue.taskId ? ` — blocked ${cue.taskId}` : ''}`, at: Date.now() });
      persist();
      break;
    }
    case 'refine': {
      refineFollowUp(cue.followupId, cue.prompt, cue.options);
      state.transcript.push({ who: 'agent', text: `Rewrote ${cue.followupId} as one question: "${cue.prompt}"`, at: Date.now() });
      break;
    }
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
  const suspectEdges = state.graph.edges.filter((e) => e.trace === 'suspect');
  const suspectNodeIds = [...new Set(suspectEdges.flatMap((e) => [e.src, e.dst]))];
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
    next: rankOpen()[0] ?? null,
    suspect: { edges: suspectEdges.length, nodes: suspectNodeIds.slice(0, 10).map((id) => nodeById(id)?.title ?? id) },
    gaps: computeGaps(),
  };
}
