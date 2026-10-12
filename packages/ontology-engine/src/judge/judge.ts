import { hashOf } from "../canon";
import { evaluate, type EvaluateOptions, type Readiness } from "../evaluate/evaluate";
import { compareFindings, isSemantic, verdicts, type Finding } from "../evaluate/findings";
import { parseGraph, type Graph } from "../graph/graph";
import { SliceSchema, type Question } from "../meta/schema";
import type { Template } from "../meta/template";
import { S1Error } from "./provider";
import { decide, thresholdsOf } from "./policy";
import { buildSlice } from "./slice";
import type { AskOptions, Provenance, SystemOne, Thresholds } from "./types";
import { toWire } from "./wire";

export interface JudgeOptions { thresholds?: Partial<Thresholds>; ask?: AskOptions }

const SEMANTIC = "semantic:";
const DEFAULT_SLICE = SliceSchema.parse({});

const errorOf = (e: unknown): NonNullable<Provenance["error"]> =>
  e instanceof S1Error ? { name: e.name, code: e.code, message: e.message, ...(e.status !== undefined && { status: e.status }) }
    : { name: (e as Error)?.name ?? "Error", message: String((e as Error)?.message ?? e) };

async function judgeOne(f: Finding, q: Question | undefined, g: Graph, s1: SystemOne, t: Thresholds, ask?: AskOptions): Promise<Finding> {
  const rule = f.rule.slice(SEMANTIC.length);
  const candidate = { rule, text: String(f.derivation.tuple[2] ?? "") };
  const state = buildSlice(g, f.subject ?? "", q?.slice ?? DEFAULT_SLICE, candidate);
  const base = { stateHash: hashOf(state), questionHash: hashOf(q ?? null), thresholds: t };
  if (!q) return { ...f, level: "info", judgment: { question: rule, status: "unknown" }, provenance: { provider: "off", model: "off", ...base } };
  try {
    const reply = await s1.ask(state, { [q.id]: toWire(q) }, ask);
    const d = decide(q, reply.answers[q.id], t);
    return {
      ...f, level: d.level,
      judgment: { question: q.id, status: d.status, ...(d.answer !== undefined && { answer: d.answer, confidence: d.confidence }) },
      provenance: { provider: reply.provider, model: reply.model, ...base, usage: reply.usage },
    };
  } catch (e) {
    const provider = e instanceof S1Error && e.code === "off" ? "off" : "error";
    return { ...f, level: "info", judgment: { question: q.id, status: "unknown" }, provenance: { provider, model: s1.model, ...base, error: errorOf(e) } };
  }
}

/** Resolves every semantic candidate against the template's question catalogue and applies policy. Never throws on provider failure. */
export async function judge(readiness: Readiness, template: Template, input: Graph | unknown, s1: SystemOne, opts: JudgeOptions = {}): Promise<Readiness> {
  const t = thresholdsOf(opts.thresholds);
  const g = parseGraph(input);
  const catalogue = new Map(template.questions.map((q) => [q.id, q]));
  const findings = (await Promise.all(readiness.findings.map((f) =>
    isSemantic(f) ? judgeOne(f, catalogue.get(f.rule.slice(SEMANTIC.length)), g, s1, t, opts.ask) : f))).sort(compareFindings);
  const count = (s: string) => findings.filter((f) => f.judgment?.status === s).length;
  return {
    ...readiness,
    findings,
    judgments: { confident: count("confident"), review: count("review"), unknown: count("unknown") },
    ...verdicts(findings, readiness.incomplete),
  };
}

export const evaluateAndJudge = (template: Template, graph: Graph | unknown, s1: SystemOne, opts: EvaluateOptions & JudgeOptions = {}): Promise<Readiness> =>
  judge(evaluate(template, graph, opts), template, graph, s1, opts);
