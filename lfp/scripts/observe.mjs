#!/usr/bin/env node
// Stage 1-D: observe smoke results and git metrics, merge into src/reality.json

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkInvariants, conditionPairs } from '../src/checks.ts';
import { groupViolations } from '../src/consolidate.ts';
import { QUESTIONS, kindById } from '../src/kernel.ts';
import { system1Available, askSystem1 } from '../agent/system1.ts';

const cwd = process.cwd();
const outDir = process.env.OUT ?? '/tmp/lfp-smoke-' + Date.now();
const realityPath = process.env.LFP_REALITY_PATH ? join(cwd, process.env.LFP_REALITY_PATH) : join(cwd, 'src/reality.json');
const tmpResults = join(outDir, 'results.json');

mkdirSync(outDir, { recursive: true });

let smokeExitCode = 0;
if (process.env.S1_ONLY !== '1') {
  try {
    // Run smoke.mjs with REALITY_OUT to capture test results
    console.log('Running smoke tests...');
    execSync(`node smoke.mjs`, {
      cwd,
      env: { ...process.env, BIN: process.env.BIN, OUT: outDir, REALITY_OUT: tmpResults },
      stdio: 'inherit'
    });
  } catch (e) {
    // Smoke may fail on assertions; we still need to merge results
    smokeExitCode = 1;
    console.error('Smoke tests failed (this is expected at v4.1)');
  }
} else {
  console.log('S1_ONLY=1: skipping smoke, running only the System One pass.');
}

// Read smoke results from temp file
let results = {};
try {
  const tmp = JSON.parse(readFileSync(tmpResults, 'utf8'));
  results = tmp.results || {};
} catch (e) {
  if (process.env.S1_ONLY !== '1') console.warn('No smoke results to merge:', e.message);
}

// Read existing reality.json
let reality = { results: {}, metrics: {}, verdicts: {}, matches: {}, decisions: {} };
try {
  reality = JSON.parse(readFileSync(realityPath, 'utf8'));
} catch (e) {
  console.warn('No existing reality.json, starting fresh');
}
reality.matches = reality.matches ?? {};
reality.decisions = reality.decisions ?? {};

// Merge smoke results (do not overwrite existing runs, only add new or update failed→pass).
// `verdicts` (v4.2: the reviewer gate, written server-side by agent/agents/talk.ts::run_review)
// is untouched here — `reality` already carries whatever was on disk, this just guards the case
// where the file didn't exist yet.
reality.verdicts = reality.verdicts ?? {};
reality.results = { ...reality.results, ...results };

// Add git metrics: commits since reset commit (look for 'reset' in git log)
try {
  const resetLog = execSync('git log --oneline --grep "reset" --all', { cwd }).toString().split('\n')[0];
  const resetCommit = resetLog.split(' ')[0];
  const count = parseInt(
    execSync(`git rev-list --count ${resetCommit}..HEAD`, { cwd }).toString().trim()
  );
  reality.metrics['metric-commits-since-reset'] = { value: String(count), at: new Date().toISOString() };
} catch (e) {
  console.warn('Could not calculate commits-since-reset:', e.message);
}

// Try to import checks and count violations
let graph = null;
try {
  graph = JSON.parse(readFileSync(join(cwd, 'src/graph.json'), 'utf8'));
  const violations = checkInvariants(graph, { matches: reality.matches });
  reality.metrics['metric-violations'] = { value: String(violations.length), at: new Date().toISOString() };
} catch (e) {
  console.warn('Could not calculate violations:', e.message);
}

// ── System One pass (v4.3): condition-match caching + consolidate-pair/raise-parent cross-checks.
// Never fails observe — any error here is warned and skipped. S1_SKIP=1 skips the whole pass. ──
if (process.env.S1_SKIP === '1') {
  console.log('S1_SKIP=1: skipping the System One pass.');
} else {
  try {
    await runSystem1Pass(graph, reality);
  } catch (e) {
    console.warn('System One pass failed, skipping:', e.message);
  }
}

/** `store.ts::parentFor`, mirrored: given a `produces` kind id (not a subject node — observe has
 * no subjects to look at, only the violation's `produces`), pick the template question a raised
 * gap of that kind would hang under. Kept in lockstep with store.ts by hand (store.ts imports Vue,
 * so it cannot be shared directly). */
function mirrorParentFor(producesKind) {
  const kind = kindById[producesKind];
  if (kind) {
    const exact = QUESTIONS.find((q) => q.produces === kind.id);
    if (exact) return exact.id;
    const sameSpace = QUESTIONS.filter((q) => kindById[q.produces]?.space === kind.space);
    if (sameSpace.length) return sameSpace[sameSpace.length - 1].id;
  }
  return 'q-capability';
}

async function askInChunks(state, questions, chunkSize = 150) {
  const ids = Object.keys(questions);
  const answers = {};
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunkIds = ids.slice(i, i + chunkSize);
    const chunk = Object.fromEntries(chunkIds.map((id) => [id, questions[id]]));
    const res = await askSystem1(state, chunk);
    Object.assign(answers, res.answers);
  }
  return answers;
}

async function runSystem1Pass(graph, reality) {
  if (!graph || !system1Available()) {
    console.log('System One pass: no graph or no System One client available; skipping.');
    return;
  }

  // (a) condition-match: one noul per (rule condition, verifying test) pair not already an exact
  // string match, cached into reality.matches[condHash][testId].
  const pairs = conditionPairs(graph);
  if (pairs.length) {
    const questions = {};
    pairs.forEach((p, i) => {
      questions[`match-${p.ruleId}-${i}-${p.testId}`] = {
        type: 'noul',
        instructions: 'Does the test condition verify the rule line? Answer yes only if a test passing that condition would establish that the rule line holds.',
      };
    });
    const state = {};
    pairs.forEach((p, i) => {
      state[`match-${p.ruleId}-${i}-${p.testId}`] = { ruleLine: p.cond, ruleTitle: p.ruleTitle, testCondition: p.testCondition, testTitle: p.testTitle };
    });
    // Jev reads state literally per-question; pass one shared state object (it is not counted,
    // only read), matching the shape agent/system1.ts's fake honours (any JSON it can stringify).
    const answers = await askInChunks(state, questions);
    for (const [i, p] of pairs.entries()) {
      const id = `match-${p.ruleId}-${i}-${p.testId}`;
      const a = answers[id];
      const noul = a && a.type === 'noul' ? a.noul : undefined;
      if (noul === undefined) continue;
      reality.matches[p.condHash] = reality.matches[p.condHash] ?? {};
      reality.matches[p.condHash][p.testId] = noul;
    }
    console.log(`System One condition-match: ${pairs.length} pair(s) asked, ${Object.keys(reality.matches).length} condition(s) now cached.`);
  } else {
    console.log('System One condition-match: no candidate pairs.');
  }

  // (b) cross-checks -> reality.decisions, compared against what the code already decided.
  reality.decisions['consolidate-pair'] = reality.decisions['consolidate-pair'] ?? {};
  reality.decisions['raise-parent'] = reality.decisions['raise-parent'] ?? {};

  const violations = checkInvariants(graph, { matches: reality.matches }).filter((v) => v.raise === 'question');
  const groups = groupViolations(violations, graph);
  const violationById = new Map(violations.map((v) => [v.id, v]));

  // consolidate-pair: every pair of violations co-grouped by groupViolations (code already grouped
  // them, so agreedWithCode is whether System One's noul also says yes).
  const pairQuestions = {};
  const pairState = {};
  const pairKeys = [];
  for (const g of groups) {
    if (g.by === 'single' || g.violationIds.length < 2) continue;
    for (let i = 0; i < g.violationIds.length; i++) {
      for (let j = i + 1; j < g.violationIds.length; j++) {
        const a = violationById.get(g.violationIds[i]);
        const b = violationById.get(g.violationIds[j]);
        if (!a || !b) continue;
        const key = `${g.id}-${i}-${j}`;
        pairKeys.push(key);
        pairQuestions[key] = { type: 'noul', instructions: 'Would one answer from the user settle both of these gaps at once?' };
        pairState[key] = { a: a.message, b: b.message };
      }
    }
  }
  if (pairKeys.length) {
    const answers = await askInChunks(pairState, pairQuestions);
    for (const key of pairKeys) {
      const a = answers[key];
      const noul = a && a.type === 'noul' ? a.noul : undefined;
      if (noul === undefined) continue;
      const agreedWithCode = (noul >= 0.5) === true; // code always grouped these, so "true" is the code's answer
      reality.decisions['consolidate-pair'][key] = { value: noul, confidence: Math.abs(noul - 0.5) * 2, agreedWithCode, at: new Date().toISOString() };
    }
    console.log(`System One consolidate-pair: ${pairKeys.length} co-grouped pair(s) checked.`);
  } else {
    console.log('System One consolidate-pair: no co-grouped pairs.');
  }

  // raise-parent: one choice question per distinct violation.produces kind, over the 11 template
  // question ids; agreedWithCode = choice === mirrorParentFor(kind).
  const kinds = [...new Set(violations.map((v) => v.produces).filter(Boolean))];
  if (kinds.length) {
    const criteria = Object.fromEntries(QUESTIONS.map((q) => [q.id, q.prompt]));
    const parentQuestions = {};
    const parentState = {};
    for (const kind of kinds) {
      const id = `raise-parent-${kind}`;
      parentQuestions[id] = { type: 'choice', instructions: `Under which template question should a gap that produces a ${kind} be asked?`, criteria };
      parentState[id] = { kind };
    }
    const answers = await askInChunks(parentState, parentQuestions);
    for (const kind of kinds) {
      const id = `raise-parent-${kind}`;
      const a = answers[id];
      if (!a || a.type !== 'choice') continue;
      const codePick = mirrorParentFor(kind);
      reality.decisions['raise-parent'][kind] = { value: a.choice, confidence: a.confidence ?? 0, agreedWithCode: a.choice === codePick, at: new Date().toISOString() };
    }
    console.log(`System One raise-parent: ${kinds.length} distinct produces-kind(s) checked.`);
  } else {
    console.log('System One raise-parent: no violations with a produces kind.');
  }
}

// Write merged reality.json
writeFileSync(realityPath, JSON.stringify(reality, null, 2));

// Print summary
const passCount = Object.values(results).filter(r => r.status === 'pass').length;
const failCount = Object.values(results).filter(r => r.status === 'fail').length;
console.log(`\n✓ Observed ${passCount} pass, ${failCount} fail. Wrote src/reality.json`);
console.log(`  Metrics: commits-since-reset=${reality.metrics['metric-commits-since-reset']?.value}, violations=${reality.metrics['metric-violations']?.value}`);

// Exit with smoke's exit code
process.exit(smokeExitCode);
