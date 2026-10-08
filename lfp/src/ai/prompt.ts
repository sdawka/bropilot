// Prompt rendering: fills a registry entry's `{{context}}`/`{{input}}` template with the same
// data the stub sees, so the stub and a real model share the same prompt (AGENT-RUNTIME.md §7).
// Node-runnable: only `.ts` imports, and only `import type` from browser modules (erased at
// compile time) — no store import, so this stays usable from scripts/emit-docs.mjs and Node tests.
import type { AIFunctionMeta } from './types.ts';
import type { Context } from '../director.ts';

/** Fills `{{context}}` and `{{input}}` in a registry entry's prompt template. */
export function renderPrompt(meta: AIFunctionMeta, contextTextValue: string, inputText: string): string {
  return meta.prompt.replace('{{context}}', contextTextValue).replace('{{input}}', inputText);
}

/** The richer slices `contextText` accepts for `'selection'`, `'graph'` and `'transcript'` needs —
 * gathered by the caller (`ai/backend.ts`) from `store.ts`, since this file must stay store-free. */
export interface ContextData {
  selection?: { id: string; title: string; kind: string; edges: { type: string; title: string; dir: 'out' | 'in' }[] } | null;
  graph?: { counts: Record<string, number>; titles: { kind: string; title: string }[] };
  transcript?: string[];
}

/** Compact JSON of only the `fn.context.needs` slices of `ctx` — the same shape the stub gets.
 * `'selection'` (the selected node with its edges' titles), `'graph'` (counts + up to 40 node
 * titles by kind) and `'transcript'` (last 6 lines) are richer than the raw `Context` fields of
 * the same name and come from `data` instead, when supplied. */
export function contextText(fn: AIFunctionMeta, ctx: Context, data: ContextData = {}): string {
  const out: Record<string, unknown> = {};
  for (const need of fn.context.needs) {
    if (need === 'selection') out.selection = 'selection' in data ? data.selection ?? null : (ctx.selectedId ?? null);
    else if (need === 'graph') out.graph = data.graph ?? ctx.graph;
    else if (need === 'transcript') out.transcript = data.transcript ?? [];
    else out[need] = (ctx as unknown as Record<string, unknown>)[need];
  }
  return JSON.stringify(out);
}
