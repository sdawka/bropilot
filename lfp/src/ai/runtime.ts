// The AI runtime: the one place a stub (or a real model, over the bus) actually gets invoked and
// tracked. `runAI` is the only way any Director should call an AI function (S128, S131).
import { state, persist, describe, type AICall } from '../store.ts';
import { applyCues, type Context, type Cue } from '../director.ts';
import type { AIFunctionDef, S1Request } from './types.ts';
import { backendFor } from './backend.ts';
import { decideGated, system1Enabled } from './system1.ts';

/** The System One path: ask Jev the function's typed questions, let `decide()` make the answer
 * when the (weakest) confidence clears the threshold, else the stub answers exactly as before.
 * Same shape as the flue path — an immediate placeholder cue, the real cues when the answer lands —
 * but a fallback is never a failure: the stub's answer is the pre-v4.3 answer, so the call stays
 * `ok` and only its `runtime`/`fallback`/`confidence` columns say what happened. */
function runDecision<I, O>(fn: AIFunctionDef<I, O>, req: S1Request, input: I, ctx: Context, callId: string): Cue[] {
  const dec = fn.decision!;
  const pendingSayId = `${callId}-s0`;
  const pending: AICall = {
    id: callId,
    fn: fn.id,
    version: fn.version,
    runtime: 'system1',
    at: Date.now(),
    contextDigest: fn.context.digest(ctx),
    input: inputText(input),
    output: '',
    cueIds: [pendingSayId],
    status: 'pending',
  };
  state.aiCalls.push(pending);
  persist();

  const settle = (out: O, patch: Partial<AICall>) => {
    const cues = fn.toCues(out, callId);
    applyCues(cues);
    updateCall(callId, { output: describeOutput(cues), cueIds: cues.flatMap(cueIdsOf), status: 'ok', ...patch });
  };
  decideGated(dec.id, req, dec.confidence, dec.next ? (a) => dec.next!(a, input, ctx) : undefined).then(
    (res) => {
      if (res.ok) settle(dec.decide(res.answers, input, ctx), { runtime: 'system1', confidence: res.confidence, model: res.model, costUsd: res.costUsd });
      else settle(fn.stub(input, ctx), { runtime: 'stub', fallback: 'low-confidence', confidence: res.confidence, model: res.model, costUsd: res.costUsd });
    },
    (err: unknown) => {
      const reason = err instanceof Error ? err.message : String(err);
      settle(fn.stub(input, ctx), { runtime: 'stub', fallback: /timed out/.test(reason) ? 'timeout' : 'error' });
    },
  );
  return [{ t: 'say', id: pendingSayId, text: 'Deciding…' }];
}

const genId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Every id a call produced: say/ask cue ids and every staged effect id (director.ts's `Context.staged.ids`
 * pattern relies on this to look a call up from a staged changeset). */
function cueIdsOf(cue: Cue): string[] {
  if (cue.t === 'say' || cue.t === 'ask') return cue.id ? [cue.id] : [];
  if (cue.t === 'stage') return cue.effects.map((e) => e.id);
  if (cue.t === 'sequence') return cue.steps.flatMap((step) => step.flatMap(cueIdsOf));
  return [];
}

/** What the call produced, for the tracking table: utterance text, or one line per staged effect. */
function describeOutput(cues: Cue[]): string {
  const lines: string[] = [];
  const walk = (cs: Cue[]) => {
    for (const c of cs) {
      if (c.t === 'say' || c.t === 'ask') lines.push(c.text);
      else if (c.t === 'stage') lines.push(...c.effects.map(describe));
      else if (c.t === 'sequence') c.steps.forEach(walk);
    }
  };
  walk(cues);
  return lines.join(' ');
}

const inputText = (input: unknown): string => (typeof input === 'string' ? input : input === undefined ? '' : JSON.stringify(input));

function updateCall(callId: string, patch: Partial<AICall>) {
  const call = state.aiCalls.find((c) => c.id === callId);
  if (!call) return;
  Object.assign(call, patch);
  persist();
}

/** Run an AI function: `stub` today, or a real model over the bus for `flue` (AGENT-RUNTIME.md §7).
 * Records an `AICall` with the context digest, input, output, and every id the returned cues
 * carry — the hard rule being that every `say`/`ask` cue a function returns carries an explicit
 * id, never the `s-<Date.now()>` fallback in `applyCue`, so the Talk panel can look this call back
 * up by cue id.
 *
 * `runAI` itself stays synchronous so today's callers (`directors/scripted.ts`) don't need to
 * change: for the stub backend it behaves exactly as before. For `flue` it returns an immediate
 * "Asking the agent…" cue and applies the real cues (or, on error/timeout, a fallback message plus
 * the stub's own cues) once the backend's promise settles. */
export function runAI<I, O>(fn: AIFunctionDef<I, O>, input: I, ctx: Context): Cue[] {
  const callId = genId(`call-${fn.id}`);
  const backend = backendFor(state.aiRuntime);

  // System One first (v4.3, AGENT-RUNTIME.md §9): a function that declares a `decision` and has a
  // System One client on the bus is decided by Jev, whatever `aiRuntime` says — classification is
  // orthogonal to generation. `questions()` returning null means there was nothing worth asking.
  let nothingToAsk = false;
  if (fn.decision && system1Enabled()) {
    const req = fn.decision.questions(input, ctx);
    if (req) return runDecision(fn, req, input, ctx, callId);
    nothingToAsk = true;
  }

  if (backend.kind === 'stub') {
    const out = fn.stub(input, ctx);
    const cues = fn.toCues(out, callId);
    const call: AICall = {
      id: callId,
      fn: fn.id,
      version: fn.version,
      runtime: 'stub',
      at: Date.now(),
      contextDigest: fn.context.digest(ctx),
      input: inputText(input),
      output: describeOutput(cues),
      cueIds: cues.flatMap(cueIdsOf),
      status: 'ok',
      ...(nothingToAsk ? { fallback: 'nothing-to-ask' as const } : {}),
    };
    state.aiCalls.push(call);
    persist();
    return cues;
  }

  const pendingSayId = `${callId}-s0`;
  const pending: AICall = {
    id: callId,
    fn: fn.id,
    version: fn.version,
    runtime: 'flue',
    at: Date.now(),
    contextDigest: fn.context.digest(ctx),
    input: inputText(input),
    output: '',
    cueIds: [pendingSayId],
    status: 'pending',
  };
  state.aiCalls.push(pending);
  persist();

  backend.run(fn, input, ctx).then(
    (res) => {
      const cues = fn.toCues(res.output, callId);
      applyCues(cues);
      updateCall(callId, {
        output: describeOutput(cues),
        cueIds: cues.flatMap(cueIdsOf),
        model: res.model,
        costUsd: res.costUsd,
        status: 'ok',
      });
    },
    (err: unknown) => {
      const reason = err instanceof Error ? err.message : String(err);
      const fallbackOut = fn.stub(input, ctx);
      const fallbackCues = fn.toCues(fallbackOut, callId);
      const sayCue: Cue = { t: 'say', id: `${callId}-err`, text: `The agent didn't answer (${reason}); the stub result is shown instead.` };
      applyCues([sayCue, ...fallbackCues]);
      updateCall(callId, {
        output: describeOutput([sayCue, ...fallbackCues]),
        cueIds: [sayCue.id!, ...fallbackCues.flatMap(cueIdsOf)],
        status: 'failed',
      });
    },
  );

  return [{ t: 'say', id: pendingSayId, text: 'Asking the agent…' }];
}
