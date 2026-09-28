// The one file that talks to TypeSafe's Jev (System One model), v4.3 — AGENT-RUNTIME.md §9.
// `askSystem1(state, questions)` passes the browser-built questions straight to `client.systemOne`
// (the bus carries the SDK's own question shape) and returns the SDK's own answer shape.
//
// FAKE_S1=1 answers from a canned table keyed by question id and never imports the SDK, so smoke
// exercises the whole seam (browser → bus → here → bus → decide()) with no key and no network.
// The SDK is imported lazily so importing this module is always safe without a key.
//
// Jev is early access: if `@typesafe-ai/sdk` reshapes its request or answers, this file changes
// and nothing else does.

export const S1_MODEL = 'jev-1.13.0';

export type S1Mode = 'live' | 'fake' | 'off';
export function system1Mode(): S1Mode {
  if (process.env.FAKE_S1 === '1') return 'fake';
  if (process.env.TYPESAFE_API_KEY) return 'live';
  return 'off';
}
export const system1Available = () => system1Mode() !== 'off';

export interface S1Reply { answers: Record<string, unknown>; model: string; ms: number; usage?: { input: number; output: number; costUsd: number } }

// ── FAKE_S1: canned answers ──────────────────────────────────────────────────────────────────────
// Keyed by question id. The fake honours a directive so smoke can drive both branches of every
// gate without a second server: a question id ending `#low`/`#no`, or the tokens `#s1low`/`#s1no`
// anywhere in the state (smoke puts them in a node title or an utterance, which the questions'
// state then carries). `low` → a low-confidence answer; `no` → noul false / choice 'none' (or the
// last option) / score 0; `#s1pick:<key>` → that choice key when the question offers it.
// Otherwise a confident "yes" / first option / top score.
function fakeAnswer(id: string, q: any, flatState: string): unknown {
  const low = id.endsWith('#low') || flatState.includes('#s1low');
  const no = id.endsWith('#no') || flatState.includes('#s1no');
  const wanted = /#s1pick:([\w-]+)/.exec(flatState)?.[1];
  const conf = low ? 0.3 : 0.95;
  if (q?.type === 'noul') return { type: 'noul', noul: low ? 0.55 : no ? 0.05 : 0.95 };
  if (q?.type === 'choice') {
    const labels = Object.keys(q.criteria ?? {});
    const pick = wanted && labels.includes(wanted) ? wanted : no ? (labels.includes('none') ? 'none' : (labels[labels.length - 1] ?? 'none')) : (labels[0] ?? 'none');
    const probabilities = Object.fromEntries(labels.map((l) => [l, l === pick ? conf : (1 - conf) / Math.max(1, labels.length - 1)]));
    return { type: 'choice', choice: pick, confidence: conf, probabilities };
  }
  if (q?.type === 'score') {
    const n = (q.criteria ?? []).length;
    const score = no ? 0 : Math.max(0, n - 1);
    const probabilities = Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i), i === score ? conf : (1 - conf) / Math.max(1, n - 1)]));
    return { type: 'score', score, confidence: conf, probabilities };
  }
  return { type: 'noul', noul: 0.95 };
}

// ── the client ───────────────────────────────────────────────────────────────────────────────────
let client: any = null;
async function getClient() {
  if (client) return client;
  const { TypeSafeClient } = await import('@typesafe-ai/sdk');
  client = new TypeSafeClient({ apiKey: process.env.TYPESAFE_API_KEY });
  return client;
}

/** Price per million input tokens (output is free) — for the cost column, not billing. */
const USD_PER_M_INPUT = 0.042;

export async function askSystem1(state: unknown, questions: Record<string, unknown>): Promise<S1Reply> {
  const t0 = Date.now();
  if (system1Mode() === 'fake') {
    const flat = JSON.stringify(state ?? '');
    const answers = Object.fromEntries(Object.entries(questions).map(([id, q]) => [id, fakeAnswer(id, q, flat)]));
    return { answers, model: `${S1_MODEL} (fake)`, ms: Date.now() - t0, usage: { input: 0, output: 0, costUsd: 0 } };
  }
  if (system1Mode() === 'off') throw new Error('System One is off: set TYPESAFE_API_KEY (or FAKE_S1=1) in lfp/.env');
  const c = await getClient();
  const res = await c.systemOne({ state: state as any, questions: questions as any, model: S1_MODEL });
  const input = res.usage?.input_tokens ?? 0;
  const output = res.usage?.output_tokens ?? 0;
  return { answers: res.answers as Record<string, unknown>, model: res.model ?? S1_MODEL, ms: Date.now() - t0, usage: { input, output, costUsd: (input / 1e6) * USD_PER_M_INPUT } };
}
