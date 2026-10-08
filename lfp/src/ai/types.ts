// AI-function shape: every place the "AI" acts is a named function with its own declared context
// needs, prompt, output shape, a deterministic stub, and a feedback mechanism (S128, S129).
//
// Split in two so registry.ts (Node-runnable, imported by kernel.ts and scripts/emit-docs.mjs) can
// hold just the metadata half, while functions/*.ts (browser-only, Stage 1-A) hold the code half.
// `import type` is fully erased, so this file stays Node-runnable even though it names browser types.

import type { Context, Cue } from '../director.ts';
import type { Provenance } from '../provenance.ts';

/** Metadata: what the function is, what it needs, and how efficacy is tracked. Documentation-grade. */
export interface AIFunctionMeta {
  id: string;
  version: string;
  purpose: string;
  context: { needs: (keyof Context | 'graph' | 'selection' | 'transcript')[] };
  prompt: string; // the model-facing instruction, templated with {{context}} and {{input}}
  output: string; // prose description of the expected output shape (documentation)
  feedback: { value: string; label: string }[]; // e.g. makes-sense / doesnt / bad-question
  source: Provenance;
  /** v4.3: the implementation declares a System One decomposition (`decision`); mirrored here so
   * scripts/emit-docs.mjs can print it without importing browser code. */
  hasDecision?: boolean;
  /** Router-only functions: logged as AI calls but hidden from the Reference prompt table. */
  internal?: boolean;
}

// ── System One (v4.3, AGENT-RUNTIME.md §9) ──────────────────────────────────────────────────────
// The wire shape is the TypeSafe SDK's own question/answer shape, so the browser builds questions,
// the bus carries them verbatim, and agent/system1.ts passes them straight to `client.systemOne`.

/** A noul outcome description: plain text, or the structured form TypeSafe recommends when the
 * yes/no boundary is subtle (docs.typesafe.ai/primitives/advanced). The SDK's EntryType admits both. */
export type S1Criterion = string | { definition: string; examples: string[] };

export type S1Question =
  | { type: 'noul'; instructions: string; criteria?: { true?: S1Criterion; false?: S1Criterion } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] };

export type S1Answer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: 'score'; score: number; confidence: number; probabilities: Record<string, number> };

export interface S1Request { state: unknown; questions: Record<string, S1Question> }
export type S1Answers = Record<string, S1Answer>;

/** A function's System One decomposition: code shapes the state and the typed questions, the
 * model answers them all in one pass, code makes the final answer. `questions` returning null
 * means "nothing worth asking here" and the stub answers as before. */
export interface DecisionSpec<I, O> {
  id: string; // threshold key in decisionConfig.ts (usually the function id)
  questions: (input: I, ctx: Context) => S1Request | null;
  decide: (answers: S1Answers, input: I, ctx: Context) => O;
  /** Override the default confidence (the weakest answer) when only some answers gate the decision. */
  confidence?: (answers: S1Answers) => number;
  /** 'answer' (v4.5): `decide` gates each answer against its own threshold(s) and keeps the
   * uncertain ones out of the result, so the call never falls back to the stub for low confidence;
   * `confidence` is then only recorded. Default 'call': the whole call is gated (above). */
  gate?: 'call' | 'answer';
  /** Chained levels (ontology.ts): given every answer so far, the next dependent request, or null
   * when the chain is complete. Sibling branches go in one request; only a level that needs an
   * earlier answer costs another round trip. */
  next?: (answers: S1Answers, input: I, ctx: Context) => S1Request | null;
  /** Fan-out (§9): every level at once — level 1 plus the dependent questions for *each* level-1
   * option, keyed so `decide` reads only the branch the level-1 choice selected. Null when a level
   * depends on a string an earlier level produces (not just a choice). Used instead of `questions`
   * only when it fits Jev's budget (system1.ts `withFanout`), else the chain walks via `next`. */
  fanout?: (input: I, ctx: Context) => S1Request | null;
}

/** Implementation: the code half, browser-only. */
export interface AIFunctionImpl<I, O> {
  context: { digest: (ctx: Context) => string };
  stub: (input: I, ctx: Context) => O; // deterministic implementation used by runtime 'stub'
  toCues: (out: O, callId: string) => Cue[];
  decision?: DecisionSpec<I, O>;
}

export type AIFunctionDef<I = unknown, O = unknown> = AIFunctionMeta & AIFunctionImpl<I, O>;
