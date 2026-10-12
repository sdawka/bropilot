import type { Question } from "../meta/schema";
import { answerKey } from "./policy";
import type { S1Question } from "./types";

const cap = (s: string, n = 255) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** The catalogue entry as a System One question; `benign` stays on for the fake provider and is stripped on the wire. */
export function toWire(q: Question): S1Question {
  const instructions = q.text ?? `Judge ${q.id} for state.subject, given state.candidate.`;
  if (q.answer === "yes-no") {
    return {
      type: "noul", instructions,
      criteria: { true: cap(`Yes: ${instructions}`), false: cap(`No: ${instructions}`) },
      benign: answerKey(q.benign) === "no" ? "no" : "yes",
    };
  }
  if (q.answer === "choice") {
    return { type: "choice", instructions, criteria: Object.fromEntries((q.choices ?? []).map((c) => [c, cap(c)])), benign: String(q.benign) };
  }
  const benign = Number(q.benign);
  return { type: "score", instructions, criteria: (q.choices ?? []).map((c) => cap(c)), ...(Number.isInteger(benign) && { benign }) };
}
