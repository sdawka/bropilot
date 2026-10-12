import type { Level } from "../evaluate/findings";
import type { Question } from "../meta/schema";
import type { Answer, JudgmentStatus, Thresholds } from "./types";

export const DEFAULT_THRESHOLDS: Thresholds = { confident: 0.9, review: 0.5 };

export function thresholdsOf(t: Partial<Thresholds> = {}): Thresholds {
  const out = { ...DEFAULT_THRESHOLDS, ...t };
  if (!(0 <= out.review && out.review <= out.confident && out.confident <= 1)) throw new RangeError("thresholds need 0 <= review <= confident <= 1");
  return out;
}

/** Policy answers compare as strings; booleans read as yes and no. */
export const answerKey = (v: string | number | boolean): string => (v === true ? "yes" : v === false ? "no" : String(v));

export const band = (confidence: number, t: Thresholds): JudgmentStatus =>
  confidence >= t.confident ? "confident" : confidence >= t.review ? "review" : "unknown";

/** The provider's answer to `q` as a policy key and the probability behind it, or undefined when it does not fit the answer type. */
export function readAnswer(q: Question, a: Answer | undefined): { answer: string; confidence: number } | undefined {
  const ok = (x: unknown): x is number => typeof x === "number" && !Number.isNaN(x);
  if (q.answer === "yes-no" && a?.type === "noul" && ok(a.noul)) return a.noul >= 0.5 ? { answer: "yes", confidence: a.noul } : { answer: "no", confidence: 1 - a.noul };
  if (q.answer === "choice" && a?.type === "choice" && ok(a.confidence)) return { answer: a.choice, confidence: a.confidence };
  if (q.answer === "score" && a?.type === "score" && ok(a.confidence)) return { answer: String(a.score), confidence: a.confidence };
  return undefined;
}

export interface Decision { status: JudgmentStatus; level: Level; answer?: string; confidence?: number }

/**
 * Unknown never passes: an unreadable answer, one below `review`, or one the policy does not map is `unknown` at `info`.
 * Between `review` and `confident` is `review`. At or above `confident` the policy's level applies.
 */
export function decide(q: Question, a: Answer | undefined, t: Thresholds): Decision {
  const r = readAnswer(q, a);
  if (!r) return { status: "unknown", level: "info" };
  const entry = q.policy.find((p) => answerKey(p.answer) === r.answer);
  const status = entry ? band(r.confidence, t) : "unknown";
  const level: Level = status === "confident" ? (entry!.level as Level) : status === "review" ? "review" : "info";
  return { status, level, ...r };
}
