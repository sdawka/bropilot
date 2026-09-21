// AIBackend: the seam between any AI-function call and where it actually gets answered — the
// deterministic stub, or a real model over the bus (AGENT-RUNTIME.md §7). `runtime.ts` is the
// only caller; it picks a backend from `state.aiRuntime` via `backendFor`.
import * as v from 'valibot';
import { state, nodeById } from '../store.ts';
import type { Context } from '../director.ts';
import type { AIFunctionDef } from './types.ts';
import { renderPrompt, contextText, type ContextData } from './prompt.ts';
import { schemaFor } from './schemas.ts';
import { publish, subscribe } from '../bus.ts';

export interface AIBackendResult<O> { output: O; model?: string; costUsd?: number }

export interface AIBackend {
  kind: 'stub' | 'flue';
  run<I, O>(fn: AIFunctionDef<I, O>, input: I, ctx: Context): Promise<AIBackendResult<O>>;
}

export const inputText = (input: unknown): string => (typeof input === 'string' ? input : input === undefined ? '' : JSON.stringify(input));

export const StubBackend: AIBackend = {
  kind: 'stub',
  async run(fn, input, ctx) {
    return { output: fn.stub(input, ctx) };
  },
};

/** graph = counts + up to 40 node titles by kind, per AGENT-RUNTIME.md §7. */
function graphData(): NonNullable<ContextData['graph']> {
  const counts: Record<string, number> = {};
  for (const n of state.graph.nodes) counts[n.kind] = (counts[n.kind] ?? 0) + 1;
  const titles = state.graph.nodes.slice(0, 40).map((n) => ({ kind: n.kind, title: n.title }));
  return { counts, titles };
}

/** selection = the selected node with its edges' titles. */
function selectionData(ctx: Context): ContextData['selection'] {
  if (!ctx.selectedId) return null;
  const node = nodeById(ctx.selectedId);
  if (!node) return null;
  const edges = state.graph.edges
    .filter((e) => e.src === node.id || e.dst === node.id)
    .map((e) => ({
      type: e.type,
      title: nodeById(e.src === node.id ? e.dst : e.src)?.title ?? '',
      dir: (e.src === node.id ? 'out' : 'in') as 'out' | 'in',
    }));
  return { id: node.id, title: node.title, kind: node.kind, edges };
}

/** transcript = last 6 lines. */
function transcriptData(): string[] {
  return state.transcript.slice(-6).map((t) => `${t.who}: ${t.text}`);
}

const TIMEOUT_MS = 15000;
let seq = 0;
const genRequestId = () => `ai-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export const BusBackend: AIBackend = {
  kind: 'flue',
  run<I, O>(fn: AIFunctionDef<I, O>, input: I, ctx: Context) {
    return new Promise<AIBackendResult<O>>((resolve, reject) => {
      const id = genRequestId();
      const data: ContextData = { selection: selectionData(ctx), graph: graphData(), transcript: transcriptData() };
      const prompt = renderPrompt(fn, contextText(fn, ctx, data), inputText(input));
      let settled = false;
      const finish = (fn2: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        unsubscribe();
        fn2();
      };
      const timer = setTimeout(() => {
        finish(() => reject(new Error('timed out waiting for the agent')));
      }, TIMEOUT_MS);
      const unsubscribe = subscribe((m) => {
        if (m.kind !== 'ai-response' || m.id !== id) return;
        finish(() => {
          if (m.error) { reject(new Error(m.error)); return; }
          const schema = schemaFor(fn.id);
          const result = v.safeParse(schema, m.output);
          if (!result.success) {
            reject(new Error(`response failed schema validation: ${result.issues.map((i) => i.message).join('; ')}`));
            return;
          }
          resolve({ output: result.output as O, model: m.model, costUsd: m.usage?.costUsd });
        });
      });
      publish({ kind: 'ai-request', id, fn: fn.id, prompt, input: inputText(input), schemaId: fn.id });
    });
  },
};

export function backendFor(runtime: 'stub' | 'flue'): AIBackend {
  return runtime === 'flue' ? BusBackend : StubBackend;
}
