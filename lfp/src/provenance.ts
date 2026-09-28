// Provenance: every kernel/graph item traces to a brief statement or is flagged as inferred.
// Moved out of kernel.ts so Node-runnable files (ai/registry.ts, scripts/emit-docs.mjs) can import
// it without pulling in the rest of the kernel.

export type Provenance =
  | { kind: 'said'; statements: number[] }
  | { kind: 'inferred'; reason: string };

export const said = (...s: number[]): Provenance => ({ kind: 'said', statements: s });
export const inferred = (reason: string): Provenance => ({ kind: 'inferred', reason });
