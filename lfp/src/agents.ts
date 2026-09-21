// The agent roster, declared once (docs/AGENT-RUNTIME.md §3). Node-runnable: imported by
// kernel.ts (digest), scripts/emit-docs.mjs (docs/AGENTS.md), the Reference page, and
// agent/agents/from-spec.ts, which turns each spec into Flue hooks. Change model, tools, budget or
// checkpoint here and nowhere else.
import { said, inferred, type Provenance } from './provenance.ts';

export type AgentId = 'talk' | 'observer' | 'planner' | 'builder' | 'reviewer' | 'clarifier';
export type Tier = 'none' | 'cheap' | 'mid' | 'strong';

export interface AgentSpec {
  id: AgentId;
  version: string;
  purpose: string;
  tier: Tier; // resolved to a model id by TIER_MODELS
  thinkingLevel?: 'off' | 'low' | 'medium' | 'high';
  /** How the agent is hosted in Flue: its own conversation (`top`) or a delegate of Talk (`delegate`).
   * Delegates share Talk's model unless overridden and never get their own sandbox or state. */
  hosting: 'top' | 'delegate' | 'path';
  tools: string[]; // tool ids from agent/tools.ts (cue tools) and agent/agents/tools.ts
  aiFunctions: string[]; // ids from src/ai/registry.ts this agent is allowed to call
  sandbox: 'none' | 'bash' | 'local' | 'remote'; // remote = the configured provider (E2B first)
  trigger: 'user-turn' | 'event' | 'schedule' | 'delegate';
  checkpoint: 'commit-gate' | 'auto-stage' | 'clarify-block' | 'none';
  budget: { maxTurns: number; maxWallMs: number; maxCostUsd: number };
  runsIn: 'browser' | 'local-node' | 'cloud' | 'sandbox';
  source: Provenance;
}

// Provider decision (2026-09-21): OpenRouter — one key (OPENROUTER_API_KEY), every vendor's models
// as `openrouter/<vendor>/<model>`, swappable per tier here. Direct `anthropic/...` specifiers still
// work when ANTHROPIC_API_KEY is set; agent/agents/from-spec.ts picks whichever key is present.
export const TIER_MODELS = {
  cheap: 'openrouter/anthropic/claude-haiku-4.5',
  mid: 'openrouter/anthropic/claude-sonnet-4.6',
  strong: 'openrouter/anthropic/claude-opus-4.6',
} as const;
export const DIRECT_MODELS = {
  cheap: 'anthropic/claude-haiku-4-5',
  mid: 'anthropic/claude-sonnet-4-6',
  strong: 'anthropic/claude-opus-4-6',
} as const;

const CUE_TOOLS = ['say', 'ask', 'navigate', 'point', 'clear', 'sequence', 'stage', 'glossary', 'answer', 'followup', 'commit', 'discard', 'undo', 'read_graph'];

export const AGENTS: AgentSpec[] = [
  {
    id: 'talk',
    version: '0.2',
    purpose: 'The one conversation the user has. Drives the screen through the Cue protocol, owns the observer and planner as delegates, dispatches builder and reviewer, and is the clarification path.',
    tier: 'mid',
    thinkingLevel: 'low',
    hosting: 'top',
    tools: [...CUE_TOOLS, 'read_open', 'raise_question', 'revalidate', 'dispatch_task', 'run_review'],
    aiFunctions: ['describe-screen', 'next-decision', 'answer-to-effects', 'propose-followup', 'explain-node', 'walk-map', 'find-gaps', 'define-term'],
    sandbox: 'none',
    trigger: 'user-turn',
    checkpoint: 'commit-gate',
    budget: { maxTurns: 200, maxWallMs: 3_600_000, maxCostUsd: 5 },
    runsIn: 'local-node',
    source: said(118, 123, 124),
  },
  {
    id: 'observer',
    version: '0.1',
    purpose: 'Runs the kernel checks and the observed test suite, then summarises only — never proposes changes.',
    tier: 'cheap',
    hosting: 'delegate',
    tools: ['run_checks', 'run_tests'],
    aiFunctions: ['find-gaps'],
    sandbox: 'none',
    trigger: 'event',
    checkpoint: 'none',
    budget: { maxTurns: 20, maxWallMs: 600_000, maxCostUsd: 0.5 },
    runsIn: 'local-node',
    source: said(147, 148),
  },
  {
    id: 'planner',
    version: '0.1',
    purpose: 'Turns violations and uncovered tests into staged epics and tasks. Stages, never commits.',
    tier: 'mid',
    hosting: 'delegate',
    tools: ['read_graph', 'read_open', 'stage'],
    aiFunctions: ['next-decision', 'unrealised-to-tasks'],
    sandbox: 'none',
    trigger: 'event',
    checkpoint: 'auto-stage',
    budget: { maxTurns: 30, maxWallMs: 600_000, maxCostUsd: 1 },
    runsIn: 'local-node',
    source: said(87, 88),
  },
  {
    id: 'builder',
    version: '0.1',
    purpose: 'Executes one work order (task + rule lines + tests + quotes) in a sandboxed worktree until the full suite is green, or raises a clarification question and stops.',
    tier: 'mid',
    thinkingLevel: 'medium',
    hosting: 'top',
    tools: ['repo', 'run_tests', 'raise_question'],
    aiFunctions: ['raise-question'],
    sandbox: 'local',
    trigger: 'delegate',
    checkpoint: 'commit-gate',
    budget: { maxTurns: 150, maxWallMs: 3_600_000, maxCostUsd: 5 },
    runsIn: 'sandbox',
    source: said(27, 88, 148),
  },
  {
    id: 'reviewer',
    version: '0.1',
    purpose: 'After the suite is green, judges whether the change serves the rule’s intent or only the test. Read-only; answers with a verdict.',
    tier: 'strong',
    thinkingLevel: 'high',
    hosting: 'top',
    tools: ['repo', 'run_tests', 'verdict'],
    aiFunctions: ['review-change'],
    sandbox: 'local',
    trigger: 'event',
    checkpoint: 'commit-gate',
    budget: { maxTurns: 30, maxWallMs: 900_000, maxCostUsd: 2 },
    runsIn: 'sandbox',
    source: said(152),
  },
  {
    id: 'clarifier',
    version: '0.1',
    purpose: 'Not a process: the escalation path from builder or reviewer into Talk’s ask. A raised question blocks its task until the user answers.',
    tier: 'none',
    hosting: 'path',
    tools: ['raise_question', 'ask', 'answer'],
    aiFunctions: ['raise-question'],
    sandbox: 'none',
    trigger: 'delegate',
    checkpoint: 'clarify-block',
    budget: { maxTurns: 10, maxWallMs: 300_000, maxCostUsd: 0.2 },
    runsIn: 'browser',
    source: said(148),
  },
];

export const agentById = Object.fromEntries(AGENTS.map((a) => [a.id, a])) as Record<AgentId, AgentSpec>;

/** One line per agent for the kernel digest and prompts. */
export function agentsDigest(): string {
  return AGENTS.map((a) => `- ${a.id} v${a.version} [${a.tier}, ${a.hosting}, ${a.trigger} → ${a.checkpoint}]: ${a.purpose}`).join('\n');
}

export const AGENTS_SOURCE: Provenance = inferred('Roster and tiers follow docs/AGENT-RUNTIME.md (2026-09-21 literature review); budgets are first guesses.');
