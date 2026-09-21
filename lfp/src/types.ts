// Data model: Node/Edge/Graph and everything built on them (moved out of store.ts, v4.1 stage 0,
// so Node-runnable files — checks.ts, scripts/*.mjs — can use the shapes without pulling in the
// browser-only store. store.ts re-exports all of this so `from './store'` keeps working everywhere.
// Node-runnable: imports only ./provenance.ts.

import type { Provenance } from './provenance.ts';

export type Status = 'draft' | 'committed';

export interface Node {
  id: string;
  kind: string;
  title: string;
  description?: string;
  props?: Record<string, string>;
  status: Status;
  source?: Provenance;
  answerId?: string;
  v?: number; // content version; bumped whenever title/description/props change through commit/directCommit
  hash?: string; // contentHash(node) as of the last commit/revalidate; drives edge `trace`
}

export interface Edge {
  id: string;
  src: string;
  dst: string;
  type: string;
  status?: Status;
  answerId?: string;
  trace?: 'valid' | 'suspect'; // suspect once either endpoint's hash changes underneath it
}

export interface Graph { nodes: Node[]; edges: Edge[] }

/** One card/row currently rendered on screen, reported by the active view via `useScreen`. */
export interface ScreenItem { id: string; kind: string; title: string; group?: string }

export interface Answer { id: string; questionId: string; content: string; at: number }

/** One recorded call to an AI function (S128, S129, S131): tracking columns + optional efficacy feedback. */
export interface AICall {
  id: string;
  fn: string;
  version: string;
  runtime: 'stub' | 'flue';
  at: number;
  contextDigest: string; // short human-readable summary of the context slice the fn received
  input: string; // user text / trigger
  output: string; // what it produced (utterance text or effect descriptions)
  cueIds: string[]; // say/ask ids and/or effect ids it produced
  rating?: { value: string; note?: string; at: number };
  /** Outcome of the call as observed at the Talk panel: what the user actually did with it. */
  outcome?: { state: 'approved' | 'edited' | 'discarded' | 'ignored'; editDistance?: number; at: number };
  /** Flue-backed calls only: 'pending' while awaiting the agent's answer, then 'ok' or 'failed'. */
  status?: 'ok' | 'failed' | 'pending';
  model?: string;
  costUsd?: number;
}

export type Effect =
  | { id: string; op: 'add-node'; node: Node; answerId: string }
  | { id: string; op: 'update-node'; nodeId: string; patch: Partial<Node>; answerId: string }
  | { id: string; op: 'remove-node'; nodeId: string; answerId: string }
  | { id: string; op: 'add-edge'; edge: Edge; answerId: string };

export interface Changeset { effects: Effect[]; warnings: string[] }
export interface Commit { id: string; at: number; effects: Effect[]; before: Graph; label?: string }

/** Project-specific question under a template question (sub-question) or a follow-up on one
 * (thread) — or, since v4.1, one raised by the kernel itself (a violation) or by an agent stuck
 * on a task. S52, S53, S54. */
export interface FollowUp {
  id: string;
  parentId: string; // a QUESTIONS id or another FollowUp id
  prompt: string;
  kind: 'sub' | 'thread';
  produces: string; // kind id the answer creates nodes of
  answerIds: string[];
  createdAt: number;
  /** Where this follow-up came from, when it wasn't hand-added under a question in the tree. */
  raisedBy?: { kind: 'template' | 'violation' | 'agent' | 'contradiction'; ref: string };
  subjects?: string[]; // node ids the follow-up is about (mirrors Violation.subjects)
  deferred?: boolean;
}

// ── checks.ts shapes (kept here so Node-runnable files needn't import each other for types) ──────

/** One failed kernel invariant, as reported by `checks.ts::checkInvariants`. Never auto-repaired —
 * always surfaced as a question (or, for uncovered/failing/stale tests, a task). */
export interface Violation {
  id: string; // stable, deterministic: `${invariant}:${subjects.join('+')}`
  invariant: string;
  subjects: string[]; // node ids (and, for per-condition checks, a synthetic `cond{n}` tag)
  message: string;
  options: string[]; // 2-3 short repair strings
  raise: 'question' | 'task';
  produces?: string; // kind id the fix would most likely create
}

/** One ranked item at the top of `store.ts::rankOpen()` — what the Talk panel's "Now" strip shows. */
export interface OpenItem {
  id: string;
  prompt: string;
  produces: string;
  source: 'template' | 'violation' | 'agent' | 'contradiction';
  subjects: string[];
  tier: 1 | 2 | 3 | 4;
  options?: string[];
  blocking?: string; // a task id, when this item is blocking that task
}
