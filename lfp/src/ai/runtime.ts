// The AI runtime: the one place a stub (or, later, a real model) actually gets invoked and
// tracked. `runAI` is the only way any Director should call an AI function (S128, S131).
import { state, persist, describe, type AICall } from '../store.ts';
import type { Context, Cue } from '../director.ts';
import type { AIFunctionDef } from './types.ts';

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

/** Run an AI function: `stub` today, throws for `flue` (not wired yet, S128). Records an `AICall`
 * with the context digest, input, output, and every id the returned cues carry — the hard rule
 * being that every `say`/`ask` cue a function returns carries an explicit id, never the `s-<Date.now()>`
 * fallback in `applyCue`, so the Talk panel can look this call back up by cue id. */
export function runAI<I, O>(fn: AIFunctionDef<I, O>, input: I, ctx: Context): Cue[] {
  if (state.aiRuntime === 'flue') throw new Error(`runAI(${fn.id}): runtime 'flue' is not wired yet`);
  const callId = genId(`call-${fn.id}`);
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
  };
  state.aiCalls.push(call);
  persist();
  return cues;
}
