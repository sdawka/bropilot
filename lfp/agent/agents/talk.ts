// Talk: the one conversation the user has (docs/AGENT-RUNTIME.md §3). Top-level Flue agent with
// the Cue tools, the observer and planner as delegates, and two tools that run the builder and
// reviewer as their own conversations (they need their own sandbox and budget, which delegates
// cannot have). The clarifier is not an agent: it is the paragraph below about raise_question.
import { useSubagent, defineTool, init } from '@flue/runtime';
import * as v from 'valibot';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { agentById } from '../../src/agents.ts';
import { applySpec, asSubagent } from './from-spec.ts';
import { Observer } from './observer.ts';
import { Planner } from './planner.ts';
import { Builder } from './builder.ts';
import { Reviewer } from './reviewer.ts';

// prompt.md is generated from src/ai/registry.ts (npm run docs); a missing file never crashes the server.
let PROMPT = '';
try {
  PROMPT = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'prompt.md'), 'utf8');
} catch {
  PROMPT = '';
}

// Set by server.mjs on every `snapshot` / `context` bus message; read fresh on every render.
let kernelDigest = '(no kernel snapshot yet — the main screen has not connected)';
let screenLine = '(no context yet — waiting for the main screen)';
export function setKernelDigest(text: string) { kernelDigest = text; }
export function setScreenLine(text: string) { screenLine = text; }

/** Run the builder on one work order in its own durable conversation (id = task id) and return its final text. */
const dispatchTask = defineTool({
  name: 'dispatch_task',
  description: 'Hand a work order (the markdown from scripts/dispatch.mjs) to the builder agent for one task id, wait for it, and return its report. Use after the user approved the task.',
  input: v.object({ taskId: v.string(), workOrder: v.string() }),
  async run({ data }: any) {
    const builder = init(Builder, { id: `builder:${data.taskId}` });
    const receipt = await builder.dispatch(data.workOrder);
    const reply = await builder.read(receipt);
    return { output: { taskId: data.taskId, report: reply.text } };
  },
});

/** Run the reviewer on a finished task and return its verdict tool output (or its text if it never called verdict). */
const runReview = defineTool({
  name: 'run_review',
  description: 'Ask the reviewer agent to judge a finished task: pass the task id, the rule lines, the tests, and the worktree path. Returns the verdict.',
  input: v.object({ taskId: v.string(), brief: v.string() }),
  async run({ data }: any) {
    const reviewer = init(Reviewer, { id: `reviewer:${data.taskId}` });
    const receipt = await reviewer.dispatch(data.brief);
    let verdict: unknown = null;
    const reply = await reviewer.read(receipt, {
      onEvent(chunk: any) {
        if (chunk.type === 'tool-output' && chunk.toolName === 'verdict') verdict = chunk.output;
      },
    });
    return { output: { taskId: data.taskId, verdict, text: reply.text } };
  },
});

export function Talk() {
  const header = applySpec(agentById.talk, { extraTools: [dispatchTask, runReview] });
  useSubagent(asSubagent(agentById.observer, Observer, 'Run the kernel checks and the test suite and summarise; use when the user asks what is failing or after a commit.'));
  useSubagent(asSubagent(agentById.planner, Planner, 'Turn the top open task-raising item into a staged epic and tasks; use when the user asks what to build next.'));
  return `${header}

${PROMPT}

## Clarification path (the "clarifier")
When you, the builder, or the reviewer cannot derive a measurable done-criterion from a rule's lines and its tests, or a line admits several plausible readings, call raise_question: name the subject nodes, what is missing, and the readings considered. The task becomes blocked; when the user answers, resume it by calling dispatch_task again with the answer appended to the work order.

## Kernel
${kernelDigest}

## Current screen
${screenLine}`;
}
Talk.agentName = 'Talk';
