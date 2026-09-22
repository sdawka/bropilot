// Answers `ai-request` bus messages published by src/ai/backend.ts::BusBackend (docs/AGENT-RUNTIME.md
// §7, plan Stage 3-B). Two modes:
//
//  - FAKE_AI=1: never calls a model. Canned output for the three functions the smoke suite exercises
//    (describe-screen, next-decision, find-gaps); `error` for everything else. Lets `npm run smoke`
//    and CI exercise the seam with no key. Checked first — the Flue imports below are still safe to
//    load without a key (they don't touch credentials at import time), but nothing below them runs.
//  - otherwise: one real model call per request, chosen from TIER_MODELS/DIRECT_MODELS the same way
//    agent/agents/from-spec.ts::modelFor does (mid for answer-to-effects/review-change, cheap else).
//
// Requests are drained one at a time (see `queue` below): each gets its own one-shot `AiFunction`
// instance (`aifn:<request id>`) whose harness tool runs `harness.prompt(text, { result: schema })`
// (node_modules/@flue/runtime/docs/guide/tools.md, "A harness tool can stage inputs, run focused
// model work, and validate the result behind one tool call" — the API this file uses; see the
// report for why the alternative, a model-called `result` tool, wasn't needed). The schema itself
// isn't JSON-serialisable, so it can't travel through Flue's `initialData` (which is durably
// recorded); instead it rides a module-level `current` slot, valid only because requests are
// strictly sequential — the queue is what makes that safe.
import { init, useModel, useTool, defineTool, observe } from '@flue/runtime';
import * as v from 'valibot';
import { aiFunctionById } from '../src/ai/registry.ts';
import { TIER_MODELS, DIRECT_MODELS } from '../src/agents.ts';

export interface AiRequest {
  kind: 'ai-request';
  id: string;
  fn: string;
  prompt: string;
  input?: unknown;
  schemaId?: string;
}

export interface AiResponse {
  kind: 'ai-response';
  id: string;
  output?: unknown;
  error?: string;
  model?: string;
  usage?: { input: number; output: number; costUsd: number };
}

const MID_TIER_FNS = new Set(['answer-to-effects', 'review-change']);

function modelForFn(fn: string): string {
  const table = process.env.OPENROUTER_API_KEY ? TIER_MODELS : DIRECT_MODELS;
  return table[MID_TIER_FNS.has(fn) ? 'mid' : 'cheap'];
}

// FAKE_AI canned output — deterministic, no model call. Each shape satisfies the matching schema in
// src/ai/schemas.ts (the browser validates every ai-response against it), so the seam is exercised
// end to end with no key: request → bus → this service → response → schema check → toCues.
const FAKE_OUTPUT: Record<string, unknown> = {
  'describe-screen': { op: 'screen', view: 'overview', itemIds: [], summary: 'This is the active screen. (fake output — FAKE_AI=1)', suspect: '' },
  'next-decision': { item: null, openCount: 0 },
  'find-gaps': { gaps: ['(fake output — FAKE_AI=1) no gaps computed'], pointIds: [] },
  'consolidate-questions': { prompt: '(fake output — FAKE_AI=1) one question', options: ['a', 'b'], answersAll: true },
  'find-contradictions': { contradictions: [] },
};

// ── the one-shot structured-function agent ──────────────────────────────────────────────────────
let current: { model: string; promptText: string; schema: unknown } | null = null;

export function AiFunction() {
  if (!current) throw new Error('AiFunction rendered with no pending request');
  const { model, promptText, schema } = current;
  useModel(model);
  useTool(
    defineTool({
      name: 'run_prompt',
      description:
        'Run the pending structured request in your own scratch conversation and return the validated result. Call this exactly once, with no arguments, then stop.',
      harness: true,
      input: v.object({}),
      async run({ harness }: any) {
        const { data } = await harness.prompt(promptText, schema ? { result: schema } : undefined);
        return { output: data ?? {} };
      },
    }) as any,
  );
  return 'You are a structured single-purpose function runner for one Bropilot AI function call. Call run_prompt exactly once with no arguments, then stop.';
}
AiFunction.agentName = 'AiFunction';

// The `turn` event for this render's model call — captured by the same `observe()` mechanism
// server.mjs already uses for Talk (see its `[turn]` log line). Safe to key off "most recent" only
// because requests are processed strictly one at a time (the queue below).
let lastUsage: { input: number; output: number; costUsd: number } | null = null;
observe((ev: any) => {
  if (ev.type === 'turn' && ev.agentName === 'AiFunction' && ev.response?.usage) {
    const u = ev.response.usage;
    lastUsage = { input: u.input, output: u.output, costUsd: u.cost?.total ?? 0 };
  }
});

// ── request handling ─────────────────────────────────────────────────────────────────────────────
let queue: Promise<void> = Promise.resolve();

export function createAiService({ send }: { send: (msg: AiResponse) => void }) {
  function handle(msg: AiRequest) {
    if (msg.kind !== 'ai-request') return Promise.resolve();
    const next = queue.then(() => processOne(msg, send));
    // Keep the chain alive even if this request failed, but don't let one bad request wedge later ones.
    queue = next.catch((err) => console.error('[ai-service] request failed:', err));
    return next;
  }
  return { handle };
}

async function processOne(msg: AiRequest, send: (msg: AiResponse) => void) {
  if (process.env.FAKE_AI === '1') {
    const output = FAKE_OUTPUT[msg.fn];
    if (output === undefined) send({ kind: 'ai-response', id: msg.id, error: 'fake: no canned output' });
    else send({ kind: 'ai-response', id: msg.id, output });
    return;
  }

  const meta = (aiFunctionById as Record<string, unknown>)[msg.fn];
  if (!meta) {
    send({ kind: 'ai-response', id: msg.id, error: `unknown AI function: ${msg.fn}` });
    return;
  }

  let schemaFor: ((id: string) => unknown) | undefined;
  try {
    ({ schemaFor } = await import('../src/ai/schemas.ts'));
  } catch {
    send({ kind: 'ai-response', id: msg.id, error: 'schemas not available' });
    return;
  }

  let schema: unknown;
  try {
    schema = schemaFor!(msg.schemaId ?? msg.fn);
  } catch (err) {
    send({ kind: 'ai-response', id: msg.id, error: `no output schema for ${msg.fn}: ${(err as Error).message}` });
    return;
  }

  const model = modelForFn(msg.fn);
  current = { model, promptText: msg.prompt, schema };
  lastUsage = null;
  try {
    const instance = init(AiFunction, { id: `aifn:${msg.id}` });
    const receipt = await instance.dispatch('run_prompt');
    let output: unknown;
    await instance.read(receipt, {
      onEvent(chunk: any) {
        if (chunk.type === 'tool-output' && chunk.toolName === 'run_prompt') output = chunk.output;
      },
    });
    if (output === undefined) throw new Error('model never called run_prompt');
    send({ kind: 'ai-response', id: msg.id, output, model, usage: lastUsage ?? undefined });
  } catch (err) {
    send({ kind: 'ai-response', id: msg.id, error: (err as Error).message ?? String(err) });
  } finally {
    current = null;
  }
}
