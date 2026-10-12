import { createHash, randomBytes } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLocalSession } from '../../../scripts/local-session.mjs';
import { runLocalCodexProvider, startOntologyLab } from '../runner.mjs';
import { BENCHMARK_CASES } from './cases.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const hash = value => createHash('sha256').update(value).digest('hex');

// Text matching is a triage signal, never an intelligence score. Source quotes,
// questions, and messages are deliberately excluded to avoid crediting echoes.
export function extractionText(proposal) {
  if (!proposal) return '';
  return [proposal.title, proposal.purpose, ...(proposal.entities ?? []).flatMap(entity =>
    [entity.title, ...(entity.properties ?? []).map(property => `${property.key}: ${property.value}`)])].join('\n');
}
export function lexicalSignals(benchmarkCase, proposal) {
  const text = extractionText(proposal);
  const inspect = facts => facts.map(fact => ({ id: fact.id, matched: fact.patterns.every(pattern => new RegExp(pattern, 'i').test(text)) }));
  return { expected: inspect(benchmarkCase.expectedFacts), forbiddenForReview: inspect(benchmarkCase.forbiddenFacts) };
}
export function summarizeRuns(runs) {
  const completed = runs.filter(run => run.terminal === 'run.completed');
  const times = completed.map(run => run.elapsedMs).sort((a, b) => a - b);
  return {
    attempted: runs.length, completed: completed.length, failed: runs.length - completed.length,
    readiness: Object.fromEntries(['ready', 'unknown', 'blocked'].map(status => [status, completed.filter(run => run.evaluation?.status === status).length])),
    latencyMs: times.length ? { median: times[Math.floor(times.length / 2)], max: times.at(-1) } : null,
    questionCounts: completed.map(run => ({ caseId: run.caseId, repeat: run.repeat, count: run.questionCards.length })),
    caveat: 'Curated synthetic cases, not population accuracy. Lexical signals require semantic review. Completion and graph readiness do not establish useful answers.',
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--live')) throw new Error('Live model calls require --live. Use --out DIR, --cases id,id, --repeat N, --concurrency 1|2.');
  const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
  const repeats = Number(option('--repeat', '1'));
  const concurrency = Number(option('--concurrency', '2'));
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3 || ![1, 2].includes(concurrency)) throw new Error('repeat must be 1–3 and concurrency 1–2');
  const selected = option('--cases', '').split(',').filter(Boolean);
  const cases = selected.length ? BENCHMARK_CASES.filter(item => selected.includes(item.id)) : BENCHMARK_CASES;
  if (!cases.length || selected.some(id => !cases.some(item => item.id === id))) throw new Error('Unknown or empty case selection');
  const output = resolve(option('--out', join(root, '.test-artifacts', `ontology-benchmark-${Date.now()}`)));
  await mkdir(output, { recursive: true });
  // Refuse to overwrite an experiment; labels and implementation are frozen first.
  const manifest = {
    startedAt: new Date().toISOString(), repeats, concurrency,
    gitHead: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
    codexVersion: execFileSync('codex', ['--version'], { encoding: 'utf8' }).trim(),
    model: 'Local Codex CLI default; current production runner does not expose resolved model ID or token usage.',
    sourceHashes: {}, casesHash: hash(JSON.stringify(cases)), cases,
    scoring: 'Pre-authored fact and question rubrics; lexical flags only. Independent semantic review follows. No production prompts or rules are changed during a run.',
  };
  for (const path of ['packages/ontology-lab/runner.mjs', 'packages/ontology-lab/domain.mjs', 'packages/contracts/fixtures/assistant-valid.json', 'crates/world-core/src/lib.rs']) {
    manifest.sourceHashes[path] = hash(await readFile(join(root, path)));
  }
  await writeFile(join(output, 'manifest.json'), JSON.stringify(manifest, null, 2), { flag: 'wx' });
  const directory = await mkdtemp(join(tmpdir(), 'bropilot-benchmark-'));
  const logs = createWriteStream(join(output, 'worker.log'));
  await once(logs, 'open');
  let session;
  const labs = [];
  const results = [];
  const queue = cases.flatMap(benchmarkCase => Array.from({ length: repeats }, (_, index) => ({ benchmarkCase, repeat: index + 1 })));
  try {
    session = await startLocalSession({ port: Number(option('--port', '8797')), directory, output: logs, verifier: false, ontologyLab: false });
    await Promise.all(Array.from({ length: concurrency }, async () => {
      let proposal = null;
      let extractionMs = null;
      const token = randomBytes(32).toString('hex');
      const lab = await startOntologyLab({ token, coreOrigin: session.origin, provider: async input => {
        const start = performance.now();
        proposal = await runLocalCodexProvider(input);
        extractionMs = Math.round(performance.now() - start);
        return proposal;
      } });
      labs.push(lab);
      while (queue.length) {
        const { benchmarkCase, repeat } = queue.shift();
        proposal = null; extractionMs = null;
        const started = performance.now();
        console.log(`START ${benchmarkCase.id} #${repeat}`);
        let events = [], transportError = null;
        try {
          const response = await fetch(`${lab.origin}/run`, {
            method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ mode: 'live', messages: benchmarkCase.messages }), signal: AbortSignal.timeout(200_000),
          });
          if (!response.ok) throw new Error(`Lab HTTP ${response.status}`);
          const trace = await response.text();
          await writeFile(join(output, `${benchmarkCase.id}-${repeat}.ndjson`), trace);
          events = trace.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
        } catch (error) { transportError = `${error.name}: ${error.message}`; }
        const terminal = events.at(-1);
        const result = {
          caseId: benchmarkCase.id, repeat, elapsedMs: Math.round(performance.now() - started), extractionMs,
          terminal: terminal?.kind ?? 'transport.failed', error: transportError ?? (terminal?.kind === 'run.failed' ? terminal.detail : null),
          proposal, snapshot: terminal?.snapshot ?? null, evaluation: terminal?.evaluation ?? null,
          questionCards: terminal?.questionCards ?? [], lexicalSignals: lexicalSignals(benchmarkCase, proposal), eventCount: events.length,
        };
        await writeFile(join(output, `${benchmarkCase.id}-${repeat}.json`), JSON.stringify(result, null, 2));
        results.push(result);
        console.log(`END ${benchmarkCase.id} #${repeat} ${result.terminal} ${result.evaluation?.status ?? '-'} ${result.elapsedMs}ms`);
      }
    }));
    const summary = { ...summarizeRuns(results), finishedAt: new Date().toISOString(), output };
    await writeFile(join(output, 'summary.json'), JSON.stringify(summary, null, 2));
    const packet = results.map(({ snapshot, ...result }) => ({ ...result, input: cases.find(item => item.id === result.caseId) }));
    await writeFile(join(output, 'review-packet.json'), JSON.stringify(packet, null, 2));
    console.log(JSON.stringify(summary));
  } finally {
    await Promise.all(labs.map(lab => lab.stop()));
    await session?.stop();
    logs.end();
    await rm(directory, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
