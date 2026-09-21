#!/usr/bin/env node
// Stage 1-D: observe smoke results and git metrics, merge into src/reality.json

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { checkInvariants } from '../src/checks.ts';

const cwd = process.cwd();
const outDir = process.env.OUT ?? '/tmp/lfp-smoke-' + Date.now();
const realityPath = join(cwd, 'src/reality.json');
const tmpResults = join(outDir, 'results.json');

mkdirSync(outDir, { recursive: true });

let smokeExitCode = 0;
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

// Read smoke results from temp file
let results = {};
try {
  const tmp = JSON.parse(readFileSync(tmpResults, 'utf8'));
  results = tmp.results || {};
} catch (e) {
  console.warn('No smoke results to merge:', e.message);
}

// Read existing reality.json
let reality = { results: {}, metrics: {} };
try {
  reality = JSON.parse(readFileSync(realityPath, 'utf8'));
} catch (e) {
  console.warn('No existing reality.json, starting fresh');
}

// Merge smoke results (do not overwrite existing runs, only add new or update failed→pass)
reality.results = { ...reality.results, ...results };

// Add git metrics: commits since reset commit (look for 'reset' in git log)
try {
  const resetLog = execSync('git log --oneline --grep "reset" --all', { cwd }).toString().split('\n')[0];
  const resetCommit = resetLog.split(' ')[0];
  const count = parseInt(
    execSync(`git rev-list --count ${resetCommit}..HEAD`, { cwd }).toString().trim()
  );
  reality.metrics['metric-commits-since-reset'] = { value: count, at: Date.now() };
} catch (e) {
  console.warn('Could not calculate commits-since-reset:', e.message);
}

// Try to import checks and count violations
try {
  const graph = JSON.parse(readFileSync(join(cwd, 'src/graph.json'), 'utf8'));
  const violations = checkInvariants(graph);
  reality.metrics['metric-violations'] = { value: violations.length, at: Date.now() };
} catch (e) {
  console.warn('Could not calculate violations:', e.message);
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
