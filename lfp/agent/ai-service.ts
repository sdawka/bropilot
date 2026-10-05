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
// instance (`aifn:<request id>`). The request's prompt is the dispatched message, and the agent's
// only tool is `result`, whose input schema is `{ result: <the function's output schema> }` and
// whose return carries `terminate: true` — so a well-behaved request is exactly one model turn
// (tools.md: terminate ends the turn once the batch settles; input validation failures go back to
// the model, which retries). The v4.2 shape ran `harness.prompt(text, { result })` inside a
// `run_prompt` tool: three model calls per request (the call to run_prompt, the scratch prompt,
// the closing "then stop" turn). The schema is wrapped because output schemas include
// `v.variant` unions and a tool input must be a top-level object. The schema itself isn't
// JSON-serialisable, so it can't travel through Flue's `initialData` (which is durably recorded);
// instead it rides a module-level `current` slot, valid only because requests are strictly
// sequential — the queue is what makes that safe.
import { init, useModel, useTool, useAgentFinish, defineTool, observe } from '@flue/runtime';
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

// Reasoning effort per function. Flue's default is 'medium' when useModel names none; a registry
// function is a single structured answer to a fully specified prompt, so the default here is
// 'off'. src/ai/registry.ts has no tier/thinking field (AIFunctionMeta), so the exceptions live
// here, keyed by fn id: review-change judges whether a diff serves a rule's intent.
type Thinking = 'off' | 'minimal' | 'low' | 'medium' | 'high';
const THINKING_BY_FN: Record<string, Thinking> = { 'review-change': 'low' };
const thinkingForFn = (fn: string): Thinking => THINKING_BY_FN[fn] ?? 'off';

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
let current: { model: string; thinking: Thinking; schema: unknown; output?: unknown; nudged?: boolean } | null = null;

export function AiFunction() {
  if (!current) throw new Error('AiFunction rendered with no pending request');
  const slot = current;
  useModel(slot.model, { thinkingLevel: slot.thinking });
  useTool(
    defineTool({
      name: 'result',
      description: 'Return your answer to the request. Put the whole answer object under `result`. Call this exactly once; it ends the call.',
      input: v.object({ result: (slot.schema as v.GenericSchema) ?? v.any() }),
      async run({ data }: any) {
        slot.output = data.result ?? {};
        return { output: 'recorded', terminate: true };
      },
    }) as any,
  );
  // One retry when the model answered in prose instead of calling `result` (the harness's own
  // `finish` did the same follow-up). Once only: the browser shows the stub on failure anyway.
  useAgentFinish((ctx) => {
    if (slot.output !== undefined || slot.nudged) return;
    slot.nudged = true;
    ctx.append({ kind: 'signal', type: 'contract', body: 'You did not call `result`. Call it now with your answer under `result`; no prose.' });
  });
  return 'You are a structured single-purpose function runner for one Bropilot AI function call. The user message is the request. Answer it by calling the `result` tool exactly once, with your answer object under its `result` argument. Do not reply in prose.';
}
AiFunction.agentName = 'AiFunction';

// Every `turn` event of the running request, summed — normally one. The event's conversationId is
// Flue's internal id (conv_…), not the instance id, so the match is "an AiFunction turn while a
// request is in flight": safe only because requests run strictly one at a time (the queue below).
let usageFor: { input: number; output: number; cacheRead: number; costUsd: number; turns: number } | null = null;
observe((ev: any) => {
  if (ev.type === 'turn' && ev.agentName === 'AiFunction' && ev.response?.usage && usageFor) {
    const u = ev.response.usage;
    usageFor.input += u.input ?? 0;
    usageFor.output += u.output ?? 0;
    usageFor.cacheRead += u.cacheRead ?? 0;
    usageFor.costUsd += u.cost?.total ?? 0;
    usageFor.turns += 1;
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
  const conversationId = `aifn:${msg.id}`;
  current = { model, thinking: thinkingForFn(msg.fn), schema };
  usageFor = { input: 0, output: 0, cacheRead: 0, costUsd: 0, turns: 0 };
  try {
    const instance = init(AiFunction, { id: conversationId });
    const receipt = await instance.dispatch(msg.prompt);
    await instance.read(receipt);
    const output = current.output;
    if (output === undefined) throw new Error('model never called result');
    const u = usageFor;
    console.log(`[ai-request] ${msg.fn} done: turns=${u.turns} in=${u.input} out=${u.output} cacheRead=${u.cacheRead} cost=$${u.costUsd.toFixed(4)} thinking=${current.thinking}`);
    send({ kind: 'ai-response', id: msg.id, output, model, usage: { input: u.input, output: u.output, costUsd: u.costUsd } });
  } catch (err) {
    send({ kind: 'ai-response', id: msg.id, error: (err as Error).message ?? String(err) });
  } finally {
    current = null;
    usageFor = null;
  }
}
