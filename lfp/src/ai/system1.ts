// System One in the browser (v4.3, AGENT-RUNTIME.md §9): publish typed questions on the bus, await
// the typed answers the agent server gets from Jev. The key never leaves the server. This is the
// only browser file that knows the system1-request/system1-response messages exist; runtime.ts
// (registry functions) and directors/route.ts (the shared router) call `askDecision`.
import { state } from '../store.ts';
import { publish, subscribe } from '../bus.ts';
import type { Context } from '../director.ts';
import type { DecisionSpec, S1Answers, S1Request } from './types.ts';
import { minConfidence, thresholdFor } from './decisionConfig.ts';

/** Per level of a chain. Jev measured live answers in 0.2–2 s; the server cuts a hung attempt at
 * 2.5 s and retries once (agent/system1.ts), so its worst case ≈5.2 s fits under 6 s. */
export const S1_TIMEOUT_MS = 6000;

export interface S1Result { answers: S1Answers; model?: string; ms?: number; costUsd?: number }

/** Is a System One client on the bus and has the user left it on? */
export const system1Enabled = (): boolean => state.system1 && state.system1Ready;

let seq = 0;
const genRequestId = () => `s1-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Where a request sits in its chain, for the server's `[system1]` log line only (not in bus.ts's
 * typed shape; the bus spreads the message, so the extra field rides along). */
export interface S1Level { level: number; fanout: boolean }

/** Ask Jev. Rejects with Error('timed out …') or the server's error string; never throws synchronously. */
export function askDecision(fn: string, req: S1Request, chain?: S1Level): Promise<S1Result> {
  return new Promise<S1Result>((resolve, reject) => {
    const id = genRequestId();
    let settled = false;
    const finish = (f: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      f();
    };
    const timer = setTimeout(() => finish(() => reject(new Error('timed out waiting for System One'))), S1_TIMEOUT_MS);
    const unsubscribe = subscribe((m) => {
      if (m.kind !== 'system1-response' || m.id !== id) return;
      finish(() => {
        if (m.error || !m.answers) { reject(new Error(m.error ?? 'empty System One response')); return; }
        resolve({ answers: m.answers as S1Answers, model: m.model, ms: m.ms, costUsd: m.usage?.costUsd });
      });
    });
    const msg = { kind: 'system1-request' as const, id, fn, state: req.state, questions: req.questions, ...(chain ? { chain } : {}) };
    publish(msg);
  });
}

// ── Fan-out (AGENT-RUNTIME.md §9) ────────────────────────────────────────────────────────────────
// Jev answers every question in a request in one pass and output is free, but each request is a
// 0.2–2 s round trip. So when a chain's level 2 depends only on level 1's *choice*, every branch is
// asked up front in one request, as long as it fits Jev's documented limits: state + all questions
// ≤ 64k tokens, state + the longest question ≤ 32k. Tokens ≈ JSON chars / 4. Mutable so smoke can
// shrink it to force the sequential walk.
export const S1_FANOUT_BUDGET = { total: 64_000, perQuestion: 32_000 };
export const approxTokens = (x: unknown): number => Math.ceil(JSON.stringify(x ?? '').length / 4);
export function fanoutSize(req: S1Request): { total: number; longest: number } {
  const st = approxTokens(req.state);
  const qs = Object.values(req.questions).map(approxTokens);
  return { total: st + qs.reduce((a, b) => a + b, 0), longest: st + Math.max(0, ...qs) };
}
export const fanoutFits = (req: S1Request, budget = S1_FANOUT_BUDGET): boolean => {
  const z = fanoutSize(req);
  return z.total <= budget.total && z.longest <= budget.perQuestion;
};

/** Requests built by a spec's `fanout`: decideGated tags them `fanout` in the levels marker. */
const fannedOut = new WeakSet<S1Request>();

/** Give a chained spec its fan-out without touching runtime.ts: `questions` returns the all-levels
 * request when the spec has `fanout` and it fits the budget, else the plain level-1 request; `next`
 * then finds the chosen branch already answered and ends the chain in one round trip. */
export function withFanout<I, O>(spec: DecisionSpec<I, O>): DecisionSpec<I, O> {
  const first = spec.questions;
  return {
    ...spec,
    questions: (input: I, ctx: Context) => {
      const all = spec.fanout?.(input, ctx);
      if (all && fanoutFits(all)) { fannedOut.add(all); return all; }
      return first(input, ctx);
    },
  };
}

/** One decision, gated: the answers plus whether their (weakest) confidence clears the threshold.
 * `next` walks a chained decision level by level (at most `maxLevels` round trips); answers merge.
 * Returns `{ answers, model, ms, costUsd, confidence, levels, fanout, ok }`: `levels` is the round
 * trips spent (1 for a fan-out), `fanout` whether level 1 carried every branch. The server logs
 * each request's `level=N[ fanout]` on its `[system1]` line; `model` stays the bare model id. */
export async function decideGated(id: string, req: S1Request, confidenceOf: (a: S1Answers) => number = minConfidence, next?: (answers: S1Answers) => S1Request | null, maxLevels = 4) {
  const fanout = fannedOut.has(req);
  let res = await askDecision(id, req, next || fanout ? { level: 1, fanout } : undefined);
  let answers: S1Answers = { ...res.answers };
  let ms = res.ms ?? 0, costUsd = res.costUsd ?? 0, levels = 1;
  for (; next && levels < maxLevels; levels++) {
    const more = next(answers);
    if (!more) break;
    res = await askDecision(id, more, { level: levels + 1, fanout: false });
    answers = { ...answers, ...res.answers };
    ms += res.ms ?? 0; costUsd += res.costUsd ?? 0;
  }
  const confidence = confidenceOf(answers);
  return { answers, model: res.model, ms, costUsd, confidence, levels, fanout, ok: confidence >= thresholdFor(id) };
}
