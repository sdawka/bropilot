// Planner: a Talk delegate. Turns violations and uncovered tests into staged epics/tasks.
import { agentById } from '../../src/agents.ts';
import { delegateTools } from './from-spec.ts';

export function Planner() {
  const header = delegateTools(agentById.planner);
  return `${header}
Read read_open and read_graph. For the top open item that raises a task (an uncovered or failing test with no task), stage exactly one epic and one to three tasks: each task targets one test and names the rule condition it covers, in the user's own words where a quote exists. Use the stage tool once; never commit. Then report what you staged in two lines.`;
}
