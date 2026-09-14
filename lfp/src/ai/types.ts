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
}

/** Implementation: the code half, browser-only. */
export interface AIFunctionImpl<I, O> {
  context: { digest: (ctx: Context) => string };
  stub: (input: I, ctx: Context) => O; // deterministic implementation used by runtime 'stub'
  toCues: (out: O, callId: string) => Cue[];
}

export type AIFunctionDef<I = unknown, O = unknown> = AIFunctionMeta & AIFunctionImpl<I, O>;
