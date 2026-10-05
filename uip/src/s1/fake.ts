// Fake System One (SPEC §6): pure and deterministic, imported by the client (fallback) and the Worker
// (no AI binding / timeout). Answers any DecideRequest by keyword regex (intent), keyword lists
// (persp), and token overlap with option text (every other choice). No DOM, no Vue.
import type { DecideRequest, DecideResponse, S1Answer, S1Question } from '../types';
import { containsPhrase, forced, labelPart, overlap, stripTokens, tokens, words } from './text';

export const CONF = { exact: 0.92, strong: 0.75, several: 0.5, none: 0.2 } as const;
const NONE = 'none';

const CHECK_RULE = /\b(solid|check|audit|consistent|inconsistent|contradict\w*|missing|lacks?|sound|holds?)\b/i;
const INTENT_RULES: [string, RegExp][] = [
  ['check', CHECK_RULE],
  ['explain', /\b(why|explain|meaning|what is|what's|whats)\b/],
  ['propose', /\b(add|create|propose|link|new|rename|remove|delete|split|connect)\b/],
  ['navigate', /\b(show|go|open|where|take|jump|find|navigate|focus)\b/],
  ['ask', /\?|\b(which|what|how|list|who|count|does|do|is|are)\b/],
];
const PERSP_WORDS: Record<string, string[]> = {
  user: ['user', 'audience', 'usecase', 'use case', 'journey', 'flow', 'screen', 'persona', 'customer'],
  domain: ['domain', 'module', 'system', 'interface', 'api', 'thing', 'rule', 'code', 'architecture', 'event'],
  intent: ['intent', 'purpose', 'outcome', 'hypothesis', 'bet', 'metric', 'assumption', 'evidence', 'goal'],
  delivery: ['delivery', 'epic', 'task', 'test', 'result', 'ship', 'progress', 'red', 'green'],
  product: ['product', 'capability', 'agent', 'feature', 'roadmap'],
};

/** The text a question reads: `state.text` when the state carries one. */
export function textOf(state: unknown): string {
  if (state && typeof state === 'object' && typeof (state as any).text === 'string') return (state as any).text;
  return typeof state === 'string' ? state : '';
}

/** Spread the rest of the mass over the others by score, so alternatives come back in a useful order. */
function probs(keys: string[], scores: Record<string, number>, chosen: string, conf: number): Record<string, number> {
  const others = keys.filter((k) => k !== chosen);
  const w = others.map((k) => (scores[k] ?? 0) + 0.1);
  const sum = w.reduce((a, b) => a + b, 0) || 1;
  const out: Record<string, number> = { [chosen]: conf };
  others.forEach((k, i) => { out[k] = +(((1 - conf) * w[i]) / sum).toFixed(4); });
  return out;
}
const choice = (keys: string[], scores: Record<string, number>, pick: string, conf: number): S1Answer =>
  ({ type: 'choice', choice: pick, confidence: conf, probabilities: probs(keys, scores, pick, conf) });

function intentAnswer(text: string, keys: string[]): S1Answer {
  const low = text.toLowerCase().trim();
  const first = words(low)[0] ?? '';
  const hits = INTENT_RULES.filter(([k, re]) => keys.includes(k) && re.test(low));
  const scores: Record<string, number> = Object.fromEntries(hits.map(([k], i) => [k, hits.length - i]));
  if (!hits.length) return choice(keys, scores, keys.includes(NONE) ? NONE : keys[0], CONF.none);
  // a check word wins over the generic question words ("is this solid?" starts with "is")
  if (hits[0]?.[0] === 'check') return choice(keys, scores, 'check', CHECK_RULE.test(first) ? CONF.exact : CONF.strong);
  const lead = hits.find(([, re]) => re.test(first));
  if (lead) return choice(keys, scores, lead[0], CONF.exact);
  return choice(keys, scores, hits[0][0], hits.length === 1 ? CONF.strong : CONF.several);
}

function perspAnswer(text: string, keys: string[]): S1Answer {
  const scores: Record<string, number> = {};
  for (const k of keys) scores[k] = (PERSP_WORDS[k] ?? []).filter((w) => containsPhrase(text, w)).length;
  const ranked = keys.filter((k) => scores[k] > 0).sort((a, b) => scores[b] - scores[a]);
  if (!ranked.length) return choice(keys, scores, keys.includes('keep') ? 'keep' : keys[0], CONF.strong);
  const tie = ranked.length > 1 && scores[ranked[1]] === scores[ranked[0]];
  return choice(keys, scores, ranked[0], tie ? CONF.several : CONF.strong);
}

/** Generic choice: exact title phrase 0.92, one strong overlap 0.75, several tied 0.50, nothing → none 0.20. */
export function overlapAnswer(text: string, criteria: Record<string, string>): S1Answer {
  const keys = Object.keys(criteria);
  const real = keys.filter((k) => k !== NONE);
  const fallback = keys.includes(NONE) ? NONE : real[0];
  if (!text.trim()) {
    // no text (e.g. next-hop): the first option, sure only when it is the only one
    return choice(keys, {}, real[0] ?? fallback, real.length === 1 ? CONF.strong : CONF.several);
  }
  const tt = tokens(text);
  const scores: Record<string, number> = {};
  const exact: { k: string; len: number }[] = [];
  for (const k of real) {
    const crit = criteria[k] ?? '';
    const label = labelPart(crit);
    if (containsPhrase(text, label)) exact.push({ k, len: label.length });
    const lt = tokens(label); // never the key: node ids carry their kind ("screen-overview")
    const rest = tokens(crit).filter((x) => !lt.includes(x));
    scores[k] = 3 * overlap(tt, lt) + overlap(tt, rest);
  }
  if (exact.length) {
    exact.sort((a, b) => b.len - a.len);
    for (const e of exact) scores[e.k] = (scores[e.k] ?? 0) + 10;
    return choice(keys, scores, exact[0].k, exact.length === 1 || exact[0].len > exact[1].len ? CONF.exact : CONF.strong);
  }
  const ranked = real.filter((k) => scores[k] > 0).sort((a, b) => scores[b] - scores[a]);
  if (!ranked.length) return choice(keys, scores, fallback, CONF.none);
  const tie = ranked.length > 1 && scores[ranked[1]] === scores[ranked[0]];
  return choice(keys, scores, ranked[0], tie ? CONF.several : CONF.strong);
}

const REFERS = /\b(this|it|its|here|that one|selected|current)\b/i;
function noulAnswer(id: string, text: string): S1Answer {
  if (id === 'uses-context') return { type: 'noul', noul: REFERS.test(text) ? 0.9 : 0.15 };
  return { type: 'noul', noul: 0.5 };
}

/** Apply `#s1low` (every confidence 0.50) / `#s1no` (0.20, choice none where offered). */
function force(a: S1Answer, mode: 'low' | 'no'): S1Answer {
  const conf = mode === 'low' ? CONF.several : CONF.none;
  if (a.type === 'noul') return { type: 'noul', noul: (a.noul >= 0.5 ? 0.5 + conf / 2 : 0.5 - conf / 2) };
  if (a.type === 'choice') {
    const keys = Object.keys(a.probabilities);
    const pick = mode === 'no' && keys.includes(NONE) ? NONE : a.choice;
    return choice(keys, a.probabilities, pick, conf);
  }
  return { ...a, confidence: conf };
}

export function fakeAnswer(id: string, q: S1Question, text: string): S1Answer {
  if (q.type === 'noul') return noulAnswer(id, text);
  if (q.type === 'score') return { type: 'score', score: 0, confidence: CONF.several, probabilities: { '0': CONF.several } };
  const keys = Object.keys(q.criteria);
  if (id === 'intent') return intentAnswer(text, keys);
  if (id === 'persp') return perspAnswer(text, keys);
  if (id === 'check-family') {
    const a = overlapAnswer(text, q.criteria);
    return a.type === 'choice' && a.confidence <= CONF.none && keys.includes('all') ? choice(keys, {}, 'all', CONF.strong) : a;
  }
  return overlapAnswer(text, q.criteria);
}

export function fakeDecide(req: DecideRequest, error?: string): DecideResponse {
  const raw = textOf(req.state);
  const mode = forced(raw);
  const text = stripTokens(raw);
  const answers: Record<string, S1Answer> = {};
  for (const [id, q] of Object.entries(req.questions)) {
    const a = fakeAnswer(id, q, text);
    answers[id] = mode ? force(a, mode) : a;
  }
  return { answers, model: 'fake', ms: 0, fake: true, ...(error ? { error } : {}) };
}
