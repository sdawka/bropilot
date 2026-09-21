// Turns an AgentSpec (src/agents.ts) into Flue hooks. Two modes, because Flue forbids the
// instance-scoped hooks inside a delegate (guide/subagents.md: useModel / useSandbox /
// usePersistentState throw there — a delegate's model comes from its definition and it shares the
// parent's environment):
//   applySpec(spec)      — inside a top-level agent function: model, sandbox, tools, turn budget.
//   delegateTools(spec)  — inside a delegate's render: tools only.
//   asSubagent(spec, fn) — the SubagentDefinition a parent passes to useSubagent.
import { useModel, useSandbox, useTool, usePersistentState, type SubagentDefinition } from '@flue/runtime';
import { local } from '@flue/runtime/node';
import { TIER_MODELS, DIRECT_MODELS, type AgentSpec } from '../../src/agents.ts';
import { toolsFor } from './tools.ts';

/** OpenRouter when its key is present, else direct Anthropic — TIER_MODELS is the only other place that knows. */
export function modelFor(spec: AgentSpec): string | null {
  if (spec.tier === 'none') return null;
  const table = process.env.OPENROUTER_API_KEY ? TIER_MODELS : DIRECT_MODELS;
  return table[spec.tier];
}

export function applySpec(spec: AgentSpec, opts: { cwd?: string; extraTools?: { name: string }[] } = {}): string {
  const model = modelFor(spec);
  if (model) useModel(model, spec.thinkingLevel ? { thinkingLevel: spec.thinkingLevel } : undefined);
  if (spec.sandbox === 'local') useSandbox(local({ cwd: opts.cwd ?? process.cwd() }));
  else if (spec.sandbox === 'remote') throw new Error(`agent ${spec.id}: remote sandbox is not configured yet (docs/AGENT-RUNTIME.md §6)`);
  // 'bash' (just-bash) is not installed in this prototype; treat as none.
  for (const t of toolsFor(spec.tools, opts.extraTools)) useTool(t as any);

  // Turn budget: a durable counter per conversation; past the limit the prompt tells the model to stop.
  const [turns, setTurns] = usePersistentState<number>(`turns:${spec.id}`, 0);
  setTurns((n) => (n ?? 0) + 1);
  const exhausted = turns >= spec.budget.maxTurns;
  return [
    `You are the ${spec.id} agent (v${spec.version}). ${spec.purpose}`,
    `Budget: ${spec.budget.maxTurns} turns, ${Math.round(spec.budget.maxWallMs / 60000)} min, $${spec.budget.maxCostUsd}. Turn ${turns + 1}. Checkpoint: ${spec.checkpoint}.`,
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
