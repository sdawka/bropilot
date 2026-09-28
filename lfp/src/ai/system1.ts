// System One in the browser (v4.3, AGENT-RUNTIME.md §9): publish typed questions on the bus, await
// the typed answers the agent server gets from Jev. The key never leaves the server. This is the
// only browser file that knows the system1-request/system1-response messages exist; runtime.ts
// (registry functions) and directors/scripted.ts (the router) call `askDecision`.
import { state } from '../store.ts';
import { publish, subscribe } from '../bus.ts';
import type { S1Answers, S1Request } from './types.ts';
import { minConfidence, thresholdFor } from './decisionConfig.ts';

/** Jev answers in 70–500 ms; one bus hop each way. 3 s is generous, and the fallback is instant. */
export const S1_TIMEOUT_MS = 3000;

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

/** One decision, gated: the answers plus whether their (weakest) confidence clears the threshold. */
export async function decideGated(id: string, req: S1Request, confidenceOf: (a: S1Answers) => number = minConfidence) {
  const res = await askDecision(id, req);
  const confidence = confidenceOf(res.answers);
  return { ...res, confidence, ok: confidence >= thresholdFor(id) };
}
