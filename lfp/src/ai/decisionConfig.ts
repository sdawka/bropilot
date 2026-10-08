// System One thresholds (v4.3): the one place a decision's minimum confidence lives. Node-runnable
// (no imports) so agent/*.ts, scripts/*.mjs and the browser all read the same numbers.
//
// Below the threshold (or with no key, or on timeout) every decision falls back to exactly the
// code that answered it before v4.3 — Jev only ever narrows or speeds up a decision that already
// has a shipped fallback. Tune from Reference's AI-calls table (runtime + confidence columns),
// never by feel. `ask-or-act` is deliberately the strictest: a wrong "act" is a silently wrong build.

export const S1_MODEL = 'jev-1.13.0'; // pinned: `jev-latest` moves and can change answers under a threshold

export const S1_THRESHOLDS: Record<string, number> = {
  'route-utterance': 0.7,
  'find-by-title': 0.65,
  'duplicate-detect': 0.8,
  'find-contradictions': 0.75,
  'review-change': 0.8,
  'reviewer-tier': 0.7,
  'edit-vs-new': 0.7,
  'ask-or-act': 0.85,
  'condition-match': 0.85,
  'consolidate-pair': 0.75,
  'raise-parent': 0.65,
  // link-answer gates per answer (v4.5): the single-target `choice` on its own confidence, each
  // (new node, candidate) `noul` on |p−.5|·2. Separate keys: a noul threshold does not carry over
  // to a choice (docs.typesafe.ai/model-jaggedness/jev-1.13). Live 2026-09-28: noul means .61–.67,
  // single-target choices .36–.64.
  'link-answer': 0.6,
  'link-answer-pair': 0.55,
};
export const S1_DEFAULT_THRESHOLD = 0.7;
export const thresholdFor = (id: string): number => S1_THRESHOLDS[id] ?? S1_DEFAULT_THRESHOLD;

/** Confidence of one answer in [0, 1]: choice/score carry their own; a noul's is its distance from 0.5. */
export function answerConfidence(a: { type: string; confidence?: number; noul?: number }): number {
  if (a.type === 'noul') return Math.abs((a.noul ?? 0.5) - 0.5) * 2;
  return a.confidence ?? 0;
}

/** Confidence of a whole answer set = the weakest answer (a decision is only as sure as its least sure part). */
export function minConfidence(answers: Record<string, { type: string; confidence?: number; noul?: number }>): number {
  const vals = Object.values(answers).map(answerConfidence);
  return vals.length ? Math.min(...vals) : 0;
}
