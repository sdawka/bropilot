// Observer: a Talk delegate. Runs the checks and the observed suite, summarises, proposes nothing.
import { agentById } from '../../src/agents.ts';
import { delegateTools } from './from-spec.ts';

export function Observer() {
  const header = delegateTools(agentById.observer);
  return `${header}
Run run_checks and run_tests, then report in at most eight lines: violation count by invariant, tests passed/failed/missing, and which results changed since the reality.json you were given. Do not suggest fixes; the planner does that.`;
}
