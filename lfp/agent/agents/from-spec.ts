// Turns an AgentSpec (src/agents.ts) into Flue hooks. Two modes, because Flue forbids the
// instance-scoped hooks inside a delegate (guide/subagents.md: useModel / useSandbox /
// usePersistentState throw there — a delegate's model comes from its definition and it shares the
// parent's environment):
//   applySpec(spec)      — inside a top-level agent function: model, sandbox, tools, turn budget.
//   delegateTools(spec)  — inside a delegate's render: tools only.
//   asSubagent(spec, fn) — the SubagentDefinition a parent passes to useSubagent.
import { useModel, useSandbox, useTool, usePersistentState, useResponseStart, type SubagentDefinition } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import { TIER_MODELS, DIRECT_MODELS, type AgentSpec } from '../../src/agents.ts';
import { toolsFor } from './tools.ts';

/** The env var a caller sets to steer a top-level agent's tier for its *next* run without changing
 * its call signature — needed for the reviewer precheck (docs/AGENT-RUNTIME.md §8): `Reviewer()`
 * (agent/agents/reviewer.ts) takes no params, so `talk.ts::run_review` can't pass a tier straight
 * through. It sets/clears this instead, right around `init(Reviewer, ...)`. */
export const tierOverrideEnvKey = (id: AgentSpec['id']) => `TIER_OVERRIDE_${id.toUpperCase()}`;

/** OpenRouter when its key is present, else direct Anthropic — TIER_MODELS is the only other place
 * that knows. `tierOverride` (explicit param, or the `TIER_OVERRIDE_<ID>` env var) replaces the
 * spec's own tier for this call only; the spec itself is never mutated. */
export function modelFor(spec: AgentSpec, tierOverride?: AgentSpec['tier']): string | null {
  const envTier = process.env[tierOverrideEnvKey(spec.id)] as AgentSpec['tier'] | undefined;
  const tier = tierOverride ?? envTier ?? spec.tier;
  if (tier === 'none') return null;
  const table = process.env.OPENROUTER_API_KEY ? TIER_MODELS : DIRECT_MODELS;
  return table[tier];
}

export function applySpec(spec: AgentSpec, opts: { cwd?: string; extraTools?: { name: string }[]; tierOverride?: AgentSpec['tier'] } = {}): string {
  const model = modelFor(spec, opts.tierOverride);
  if (model) useModel(model, spec.thinkingLevel ? { thinkingLevel: spec.thinkingLevel } : undefined);
  if (spec.sandbox === 'local') useSandbox(local({ cwd: opts.cwd ?? process.cwd() }));
  else if (spec.sandbox === 'remote') throw new Error(`agent ${spec.id}: remote sandbox is not configured yet (docs/AGENT-RUNTIME.md §6)`);
  // 'bash' (just-bash) is not installed in this prototype; treat as none.
  for (const t of toolsFor(spec.tools, opts.extraTools)) useTool(t as any);

  // Turn budget: a durable counter per conversation; past the limit the prompt tells the model to stop.
  // Renders are pure reads in Flue 2.0.6 — the setter throws during render ("State was written
  // during render"), so the count moves inside the response-start seam (once per response).
  // Found 2026-09-28: every live Talk turn had been failing on this since v4.1's Sonnet pass.
  const [turns, setTurns] = usePersistentState<number>(`turns:${spec.id}`, 0);
  useResponseStart(() => { setTurns((n) => (n ?? 0) + 1); });
  // The count stays out of the prompt text: the first render of a response reads it before the
  // bump above, every later one after it, so "Turn N" changed at the first tool result and Flue
  // sent "System instructions updated." — Sonnet answered it with a second, near-identical say
  // (found 2026-09-28 driving a design session). Only the STOP line below depends on it (flips once).
  const exhausted = turns >= spec.budget.maxTurns;
  return [
    `You are the ${spec.id} agent (v${spec.version}). ${spec.purpose}`,
    `Budget: ${spec.budget.maxTurns} turns, ${Math.round(spec.budget.maxWallMs / 60000)} min, $${spec.budget.maxCostUsd}. Checkpoint: ${spec.checkpoint}.`,
    exhausted ? 'STOP: turn budget exhausted. Summarise what you did and end.' : '',
  ].filter(Boolean).join('\n');
}

export function delegateTools(spec: AgentSpec, extra: { name: string }[] = []): string {
  for (const t of toolsFor(spec.tools, extra)) useTool(t as any);
  return `You are the ${spec.id} delegate (v${spec.version}). ${spec.purpose} Checkpoint: ${spec.checkpoint}.`;
}

export function asSubagent(spec: AgentSpec, agent: () => string, description = spec.purpose): SubagentDefinition {
  const model = modelFor(spec);
  return { name: spec.id, description, agent, ...(model ? { model } : {}), ...(spec.thinkingLevel ? { thinkingLevel: spec.thinkingLevel } : {}) };
}
