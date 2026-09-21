#!/usr/bin/env node
// Stage 1-D: dispatch work orders and manage task state

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// Helper: extract rule conditions from description
const conditionsOf = (rule) => {
  const lines = (rule.description ?? '').split('\n').map(l => l.trim()).filter(Boolean);
  return lines.length ? lines : [rule.title];
};

const cwd = process.cwd();
const graphPath = join(cwd, 'src/graph.json');
const taskId = process.argv[2];
const stateIdx = process.argv.indexOf('--state');
const newState = stateIdx !== -1 ? process.argv[stateIdx + 1] : null;
const outDir = process.argv.indexOf('--out') !== -1 ? process.argv[process.argv.indexOf('--out') + 1] : null;

if (!taskId) {
  console.error('Usage: dispatch <taskId> [--state queued|running|blocked|done|verified] [--out dir]');
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

// If --state given, update task status
if (newState) {
  const validTransitions = {
    'queued': ['running'],
    'running': ['blocked', 'done'],
    'blocked': ['running'],
    'done': ['verified'],
    'verified': []
  };

  const currentState = task.props?.status || 'queued';
  const allowed = validTransitions[currentState] || [];

  if (!allowed.includes(newState)) {
    console.error(`Invalid transition: ${currentState} → ${newState}`);
    process.exit(1);
  }

  task.props = task.props || {};
  task.props.status = newState;
  writeFileSync(graphPath, JSON.stringify(graph, null, 2));
  console.log(`Task ${taskId}: ${currentState} → ${newState}`);
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
    const conditions = conditionsOf(rule);
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
const workorderDir = outDir ? outDir : join(cwd, 'scratch/workorders');
mkdirSync(workorderDir, { recursive: true });
const workorderPath = join(workorderDir, `${taskId}.md`);
writeFileSync(workorderPath, markdown);
console.error(`\n✓ Wrote ${workorderPath}`);
