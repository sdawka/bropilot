// System One thresholds for the uip: a copy of lfp/src/ai/decisionConfig.ts values plus the uip keys
// (SPEC §6). Pure (no imports) so the browser, node tests and the Worker read the same numbers.
export const S1_MODEL = 'clef-flash';

export const S1_THRESHOLDS: Record<string, number> = {
  // copied from lfp
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
  'link-answer': 0.6,
  'link-answer-pair': 0.55,
  // uip keys
  'lens-pick': 0.65,
  'uses-context': 0.55,
  'project-pick': 0.65,
  'next-hop': 0.65,
  // checks (CHECKS-SPEC §5; starting points from lfp equivalents, tune from the eval)
  'sol-edge': 0.6, 'sol-satisfies': 0.6, 'sol-implements': 0.6, 'sol-verifies': 0.7, 'sol-evidence': 0.7, 'sol-monitors': 0.6,
  'sol-realises': 0.6, 'sol-bet-metric': 0.55, 'sol-retype': 0.65,
  'cmp-need': 0.65, 'cmp-problem-audience': 0.55, 'cmp-outcome-metric': 0.6, 'cmp-interface-carries': 0.55, 'cmp-flow-screen': 0.55, 'cmp-purpose-outcome': 0.6,
  'con-rule-pair': 0.75, 'con-bet-evidence': 0.7, 'con-outcome-metric': 0.6, 'con-test-case': 0.7, 'con-feature-stages': 0.55,
  'con-dup-title': 0.8, 'con-summary': 0.75, 'con-term-usage': 0.65,
};
export const S1_DEFAULT_THRESHOLD = 0.7;
/** Below this every band is `ask` (SPEC §6). */
export const S1_OFFER_FLOOR = 0.4;
export const thresholdFor = (id: string): number => S1_THRESHOLDS[id] ?? S1_DEFAULT_THRESHOLD;

/** Confidence of one answer in [0, 1]: choice/score carry their own; a noul's is its distance from 0.5. */
export function answerConfidence(a: { type: string; confidence?: number; noul?: number }): number {
  if (a.type === 'noul') return Math.abs((a.noul ?? 0.5) - 0.5) * 2;
  return a.confidence ?? 0;
}

/** Confidence of a whole answer set = the weakest answer. */
export function minConfidence(answers: Record<string, { type: string; confidence?: number; noul?: number }>): number {
  const vals = Object.values(answers).map(answerConfidence);
  return vals.length ? Math.min(...vals) : 0;
}

/** act ≥ threshold, offer ≥ 0.40, else ask. */
export function bandFor(confidence: number, threshold: number): 'act' | 'offer' | 'ask' {
  if (confidence >= threshold) return 'act';
  if (confidence >= S1_OFFER_FLOOR) return 'offer';
  return 'ask';
}
