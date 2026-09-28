// System One in the browser (v4.3, AGENT-RUNTIME.md §9): publish typed questions on the bus, await
// the typed answers the agent server gets from Jev. The key never leaves the server. This is the
// only browser file that knows the system1-request/system1-response messages exist; runtime.ts
// (registry functions) and directors/route.ts (the shared router) call `askDecision`.
import { state } from '../store.ts';
import { publish, subscribe } from '../bus.ts';
import type { S1Answers, S1Request } from './types.ts';
import { minConfidence, thresholdFor } from './decisionConfig.ts';

/** Per level of a chain. Jev measured live answers in 0.2–2 s; the server cuts a hung attempt at
 * 2.5 s and retries once (agent/system1.ts), so its worst case ≈5.2 s fits under 6 s. */
export const S1_TIMEOUT_MS = 6000;

export interface S1Result { answers: S1Answers; model?: string; ms?: number; costUsd?: number }

/** Is a System One client on the bus and has the user left it on? */
export const system1Enabled = (): boolean => state.system1 && state.system1Ready;

let seq = 0;
const genRequestId = () => `s1-${Date.now().toString(36)}-${(seq++).toString(36)}`;

/** Ask Jev. Rejects with Error('timed out …') or the server's error string; never throws synchronously. */
export function askDecision(fn: string, req: S1Request): Promise<S1Result> {
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
    publish({ kind: 'system1-request', id, fn, state: req.state, questions: req.questions });
  });
}

/** One decision, gated: the answers plus whether their (weakest) confidence clears the threshold.
 * `next` walks a chained decision level by level (at most `maxLevels` round trips); answers merge. */
export async function decideGated(id: string, req: S1Request, confidenceOf: (a: S1Answers) => number = minConfidence, next?: (answers: S1Answers) => S1Request | null, maxLevels = 4) {
  let res = await askDecision(id, req);
  let answers: S1Answers = { ...res.answers };
  let ms = res.ms ?? 0, costUsd = res.costUsd ?? 0;
  for (let level = 1; next && level < maxLevels; level++) {
    const more = next(answers);
    if (!more) break;
    res = await askDecision(id, more);
    answers = { ...answers, ...res.answers };
    ms += res.ms ?? 0; costUsd += res.costUsd ?? 0;
  }
  const confidence = confidenceOf(answers);
  return { answers, model: res.model, ms, costUsd, confidence, ok: confidence >= thresholdFor(id) };
}
