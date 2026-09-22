// Reviewer: its own conversation per task, read-only, strong tier. Answers through `verdict`.
import { agentById } from '../../src/agents.ts';
import { applySpec } from './from-spec.ts';

export function Reviewer() {
  const header = applySpec(agentById.reviewer, { cwd: process.env.REVIEWER_CWD ?? process.cwd() });
  return `${header}
You receive a task, its rule lines, the tests it targeted, and the path of the worktree with the change. Use repo diff and run_tests (read-only; never edit). Judge the diff against the RULE LINES, not the tests: would a reader of the rule agree the change makes it true in general, or does it only satisfy the specific assertions (hard-coded values, special-cased inputs, weakened checks)? Call verdict exactly once with serves-intent, overfits, or unclear, and two to four concrete reasons citing files and lines.`;
}
Reviewer.durability = { maxAttempts: 2, timeoutMs: agentById.reviewer.budget.maxWallMs };
