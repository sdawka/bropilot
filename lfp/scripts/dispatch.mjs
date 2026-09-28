#!/usr/bin/env node
// Stage 1-D: dispatch work orders and manage task state
//
// v4.3 (System One, AGENT-RUNTIME.md §9): before a work order is written, `askOrAct` gives Jev one
// noul — can a builder derive a measurable "done" from these rule lines and test conditions alone,
// with nothing else? A confident "no" blocks the task instead of dispatching it, exactly the way an
// agent's own `raise_question` blocks a task mid-build. `--no-gate` skips the question and always
// proceeds (pre-v4.3 behaviour); so does System One being off, or the question erroring.
//
// NOTE on where the raise lands: an in-app `raise` (src/director.ts) creates a FollowUp in the
// browser's own reactive state (persisted to `localStorage`, never to disk) and patches the task's
// status directly in that same in-memory graph. `graph.json` on disk is only ever the *seed* graph
// (src/store.ts::hydrate reads it once, if `localStorage` is empty) — there is no on-disk store for
// FollowUps today. So this script does the two things that genuinely round-trip through files: (1)
// it flips the task's own `props.status` in `graph.json`, reusing the same transition machinery
// `--state` already uses (below) — that half is real and other tooling reading `graph.json` sees it
// immediately; (2) it appends the raised item to `src/reality.json` under a new `raised` map,
// alongside `verdicts` (the only precedent for a Node script handing the browser something to
// reconcile — `src/store.ts::applyReality`), which turns each `raised` entry into the same
// agent-raised FollowUp the `raise` cue would have made, at hydrate time.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { conditionsOf, checkInvariants } from '../src/checks.ts';
import { askSystem1, system1Available } from '../agent/system1.ts';
import { thresholdFor, answerConfidence } from '../src/ai/decisionConfig.ts';

// Helper: extract rule conditions from description
// (kept as a thin re-export call so this file's own history of "how conditions are read" doesn't
// fork from src/checks.ts::conditionsOf, which is now the one definition.)
const conditionsOfRule = (rule) => conditionsOf(rule);

const cwd = process.cwd();
const flagValue = (name) => { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : null; };
const graphPath = flagValue('--graph') ?? (process.env.LFP_GRAPH_PATH ? join(cwd, process.env.LFP_GRAPH_PATH) : join(cwd, 'src/graph.json'));
const realityPath = flagValue('--reality') ?? (process.env.LFP_REALITY_PATH ? join(cwd, process.env.LFP_REALITY_PATH) : join(cwd, 'src/reality.json'));
const taskId = process.argv[2];
const stateIdx = process.argv.indexOf('--state');
const newState = stateIdx !== -1 ? process.argv[stateIdx + 1] : null;
const outDir = process.argv.indexOf('--out') !== -1 ? process.argv[process.argv.indexOf('--out') + 1] : null;
const noGate = process.argv.includes('--no-gate');
const dryRun = process.argv.includes('--dry-run');

if (!taskId) {
  console.error('Usage: dispatch <taskId> [--state queued|running|blocked|done|verified] [--out dir] [--no-gate] [--dry-run] [--graph path] [--reality path]');
  process.exit(1);
}

// Parse graph
let graph;
try {
  graph = JSON.parse(readFileSync(graphPath, 'utf8'));
} catch (e) {
  console.error('Failed to read graph.json:', e.message);
  process.exit(1);
}

// Find task node
const task = graph.nodes.find(n => n.id === taskId);
if (!task) {
  console.error(`Task ${taskId} not found in graph`);
  process.exit(1);
}

const validTransitions = {
  'queued': ['running', 'blocked'], // 'blocked' added in v4.3: the ask-or-act gate can block a task
  'running': ['blocked', 'done'],   // before it ever runs, same as an agent's own raise would
  'blocked': ['running'],
  'done': ['verified'],
  'verified': []
};

/** Apply one status transition to `task` in place, validating against `validTransitions`. Returns
 * `{ ok: true, from }` or `{ ok: false, from }` (invalid transitions are never applied). Shared by
 * the `--state` CLI path and the ask-or-act gate so both flip status the same way. */
function transition(task, to) {
  const from = task.props?.status || 'queued';
  const allowed = validTransitions[from] || [];
  if (!allowed.includes(to)) return { ok: false, from };
  task.props = task.props || {};
  task.props.status = to;
  return { ok: true, from };
}

// If --state given, update task status
if (newState) {
  const { ok, from } = transition(task, newState);
  if (!ok) {
    console.error(`Invalid transition: ${from} → ${newState}`);
    process.exit(1);
  }
  if (!dryRun) writeFileSync(graphPath, JSON.stringify(graph, null, 2));
  console.log(`Task ${taskId}: ${from} → ${newState}${dryRun ? ' (dry run, not written)' : ''}`);
  process.exit(0);
}

// Generate work order (no --state given)
// Find rules served by this task (task → targets → test → verifies → rule)
const tests = graph.edges
  .filter(e => e.src === taskId && e.type === 'targets')
  .map(e => graph.nodes.find(n => n.id === e.dst))
  .filter(Boolean);

const rules = new Set();
tests.forEach(test => {
  graph.edges
    .filter(e => e.src === test.id && e.type === 'verifies')
    .forEach(e => rules.add(e.dst));
});

const ruleNodes = Array.from(rules)
  .map(ruleId => graph.nodes.find(n => n.id === ruleId))
  .filter(Boolean);

// ── ask-or-act gate (v4.3) ──────────────────────────────────────────────────────────────────────
/** Find the first rule line or test condition a builder could not turn into a pass/fail check, so
 * the raised question can name it. Deterministic, not model-derived: reuses `checkInvariants`'s own
 * `rule-condition-has-test` read (an uncovered condition) and, failing that, the first targeted
 * test with no `props.condition`. Returns `{ line, options } | null` ("null" = nothing obviously
 * unclear by this reading — the gate still asks Jev, since a line can be checkable-looking and
 * still be a wish). */
function firstUnclear(ruleNodes, tests, graph) {
  const ruleIds = new Set(ruleNodes.map(r => r.id));
  const violations = checkInvariants(graph);
  const uncovered = violations.find(v => v.invariant === 'rule-condition-has-test' && ruleIds.has(v.subjects[0]));
  if (uncovered) {
    const rule = ruleNodes.find(r => r.id === uncovered.subjects[0]);
    const idx = Number(uncovered.subjects[1].replace('cond', ''));
    const line = conditionsOfRule(rule)[idx];
    if (line) return { line, options: uncovered.options };
  }
  const bare = tests.find(t => !t.props?.condition);
  if (bare) return { line: bare.title, options: null };
  return null;
}

/** Append a raised item for this task the way an on-disk script can: flip the task's own status to
 * 'blocked' in graph.json (real, reused from `--state`), and record the raise itself in
 * `reality.json.raised[taskId]` (see the file-header note on why not graph.json). */
function raiseAskOrAct(task, prompt, options) {
  const { ok, from } = transition(task, 'blocked');
  if (!ok) {
    console.error(`[ask-or-act] wanted to block ${task.id} but ${from} → blocked is not a valid transition; leaving status as-is.`);
  }
  let reality = {};
  try { reality = JSON.parse(readFileSync(realityPath, 'utf8')); } catch { reality = { results: {}, metrics: {} }; }
  const record = {
    raisedBy: { kind: 'agent', ref: task.id },
    prompt,
    options: options ?? ['Answer it', 'Skip'],
    at: new Date().toISOString(),
  };
  reality.raised = { ...(reality.raised ?? {}), [task.id]: record };
  if (!dryRun) {
    writeFileSync(graphPath, JSON.stringify(graph, null, 2));
    writeFileSync(realityPath, JSON.stringify(reality, null, 2));
  }
  console.log(`[ask-or-act] blocked ${task.id}: "${prompt}"${dryRun ? ' (dry run, not written)' : ''}`);
  return record;
}

async function gate() {
  if (noGate) {
    console.log('[system1] ask-or-act: skipped (--no-gate)');
    return null;
  }
  if (!system1Available()) {
    console.log('[system1] ask-or-act: System One off → proceed');
    return null;
  }
  const state = {
    task: task.title,
    tests: tests.map(t => ({ title: t.title, condition: t.props?.condition ?? null })),
    rules: ruleNodes.map(r => ({ title: r.title, lines: conditionsOfRule(r) })),
  };
  try {
    const reply = await askSystem1(state, {
      measurable: {
        type: 'noul',
        instructions: 'From these rule lines and test conditions alone, can a builder derive a pass/fail criterion for "done" that a test could check without asking the user anything? Answer no if any targeted test has no condition, or any rule line is a wish rather than a checkable statement.',
        criteria: { true: 'A checkable done-criterion follows from the lines', false: 'Something must be asked before building' },
      },
    });
    const ans = reply.answers.measurable;
    const confidence = answerConfidence(ans);
    const threshold = thresholdFor('ask-or-act');
    const blocked = ans.noul < 0.5 && confidence >= threshold;
    console.log(`[system1] ask-or-act noul=${ans.noul} conf=${confidence.toFixed(2)} → ${blocked ? 'block' : 'proceed'}`);
    if (!blocked) return null;
    const unclear = firstUnclear(ruleNodes, tests, graph);
    const line = unclear?.line ?? '(no single line stood out — ask which condition is unclear)';
    const prompt = `Before building "${task.title}": what is the measurable "done" for ${line}?`;
    raiseAskOrAct(task, prompt, unclear?.options);
    return prompt;
  } catch (e) {
    console.log(`[system1] ask-or-act: unavailable (${e.message}) → proceed`);
    return null;
  }
}

const blockedPrompt = await gate();
if (blockedPrompt) process.exit(0);

// Build work order markdown
const lines = [];
lines.push(`# Work Order: ${task.title}`);
lines.push('');
lines.push(`**Task:** \`${task.id}\``);
lines.push(`**State:** ${task.props?.status || 'queued'}`);
lines.push('');

if (task.description) {
  lines.push('## Description');
  lines.push(task.description);
  lines.push('');
}

if (ruleNodes.length > 0) {
  lines.push('## Rules Served');
  ruleNodes.forEach(rule => {
    lines.push(`- **${rule.title}**`);
    const conditions = conditionsOfRule(rule);
    conditions.forEach(cond => lines.push(`  - ${cond}`));
  });
  lines.push('');
}

if (tests.length > 0) {
  lines.push('## Tests Targeted');
  tests.forEach(test => {
    const cond = test.props?.condition || '(no condition)';
    const resultNode = graph.nodes.find(n => n.kind === 'test-result' && graph.edges.some(e => e.src === n.id && e.dst === test.id && e.type === 'reports'));
    const resultStatus = resultNode?.props?.status || 'unknown';
    lines.push(`- **${test.title}** (\`${test.id}\`)`);
    lines.push(`  - Condition: ${cond}`);
    lines.push(`  - Result: ${resultStatus}`);
  });
  lines.push('');
}

lines.push('## Acceptance');
lines.push('Full suite green (all tests pass) + reviewer verdict serves intent.');
lines.push('');

lines.push('## Run Record Template');
const runRecord = {
  runId: 'run-' + Date.now(),
  agent: 'builder',
  taskId,
  commit: 'HEAD', // To be filled by agent
  startedAt: new Date().toISOString(),
  actions: [],
  result: null
};
lines.push('```json');
lines.push(JSON.stringify(runRecord, null, 2));
lines.push('```');

const markdown = lines.join('\n');
console.log(markdown);

// Write to scratch/workorders/<taskId>.md if --out given or default location
if (!dryRun) {
  const workorderDir = outDir ? outDir : join(cwd, 'scratch/workorders');
  mkdirSync(workorderDir, { recursive: true });
  const workorderPath = join(workorderDir, `${taskId}.md`);
  writeFileSync(workorderPath, markdown);
  console.error(`\n✓ Wrote ${workorderPath}`);
} else {
  console.error('\n(dry run, work order not written)');
}
