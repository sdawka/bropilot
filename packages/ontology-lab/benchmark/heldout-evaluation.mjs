#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { once } from "node:events";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { startLocalSession } from "../../../scripts/local-session.mjs";
import { localSemanticProvider } from "../local-config.mjs";
import { QUESTION_MODEL, questionPrompt, questionSchema } from "../question-model.mjs";
import { runLocalCodexProvider, startOntologyLab } from "../runner.mjs";
import { HELDOUT_BENCHMARK_VERSION, HELDOUT_CASES, validateHeldoutCases } from "./heldout-cases.mjs";

import { BENCHMARK_CASES } from "./cases.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const hash = value => createHash("sha256").update(value).digest("hex");
const STAGES = ["extractionMs", "mappingMs", "structuralMs", "semanticMs", "questionsMs", "rankingMs", "feedbackMs", "totalMs"];

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)];
}

function stageTiming(runs, key) {
  const values = runs.map(run => run.timings?.[key] ?? (key === "totalMs" ? run.elapsedMs : undefined)).filter(Number.isFinite);
  return { count: values.length, p50: percentile(values, 0.5), p95: percentile(values, 0.95) };
}

export function scoreHeldoutRuns(runs, distinctCases) {
  const completed = runs.filter(run => run.terminal === "run.completed");
  const semantic = completed.filter(run => run.semanticReview);
  const readiness = Object.fromEntries(["ready", "unknown", "blocked"].map(status => [status, completed.filter(run => run.evaluation?.status === status).length]));
  return {
    cases: { distinct: distinctCases, attemptedRepetitions: runs.length, completedRepetitions: completed.length },
    failures: { count: runs.length - completed.length, byTerminal: Object.fromEntries([...new Set(runs.filter(run => run.terminal !== "run.completed").map(run => run.terminal))].map(kind => [kind, runs.filter(run => run.terminal === kind).length])) },
    stageTimingMs: Object.fromEntries(STAGES.map(key => [key.replace(/Ms$/, ""), stageTiming(runs, key)])),
    semanticCoverage: {
      completedWithEvaluation: completed.filter(run => run.evaluation).length,
      completedWithSemanticReview: semantic.length,
      semanticJudgments: semantic.reduce((count, run) => count + (run.semanticReview?.judgments?.length ?? 0), 0),
      readiness,
    },
  };
}

export function summarizeRatings(ratings, expectedCompletedRuns) {
  const empty = () => ({ count: 0, pass: 0, fail: 0, uncertain: 0 });
  const summary = { expectedCompletedRuns, ratedRuns: ratings.length, unratedCompletedRuns: Math.max(0, expectedCompletedRuns - ratings.length), human: empty(), modelAssisted: empty() };
  for (const rating of ratings) {
    if (!rating || !["human", "model-assisted"].includes(rating.ratingSource) || !["pass", "fail", "uncertain"].includes(rating.disposition)) throw new Error("ratings must identify human or model-assisted source and pass, fail, or uncertain disposition");
    const bucket = rating.ratingSource === "human" ? summary.human : summary.modelAssisted;
    bucket.count += 1;
    bucket[rating.disposition] += 1;
  }
  return summary;
}

function parseCli(argv) {
  const { values } = parseArgs({ args: argv, options: {
    live: { type: "boolean", default: false }, "case-set": { type: "string", default: "heldout" }, "env-file": { type: "string" }, out: { type: "string" }, cases: { type: "string", default: "" }, repeat: { type: "string", default: "2" }, concurrency: { type: "string", default: "2" }, port: { type: "string", default: "8817" }, ratings: { type: "string" },
  }, strict: true });
  if (!values.live) throw new Error("live model calls require --live");
  if (!values["env-file"]) throw new Error("--env-file is required so held-out live runs include the configured System One review");
  if (!["heldout", "baseline"].includes(values["case-set"])) throw new Error("--case-set must be heldout or baseline");
  const repeats = Number(values.repeat), concurrency = Number(values.concurrency), port = Number(values.port);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw new Error("--repeat must be 1..3");
  if (!Number.isInteger(concurrency) || ![1, 2].includes(concurrency)) throw new Error("--concurrency must be 1 or 2");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("--port must be a valid unprivileged port");
  return { caseSet: values["case-set"], repeats, concurrency, port, envFile: resolve(values["env-file"]), output: resolve(values.out ?? join(root, ".test-artifacts", `ontology-heldout-${Date.now()}`)), selectedIds: values.cases.split(",").filter(Boolean), ratings: values.ratings ? resolve(values.ratings) : undefined };
}

async function writeFrozenManifest({ output, cases, repeats, concurrency }) {
  const manifest = {
    benchmarkVersion: HELDOUT_BENCHMARK_VERSION,
    startedAt: new Date().toISOString(), repeats, concurrency,
    gitHead: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    codexVersion: execFileSync("codex", ["--version"], { encoding: "utf8" }).trim(),
    models: { extraction: "Local Codex CLI default", questions: QUESTION_MODEL, semantic: "TypeSafe System One configured from an authorized env file" },
    sourceHashes: {}, casesHash: hash(JSON.stringify(cases)), cases,
    scoring: "Pre-authored facts, exclusions, question topics and coverage labels. Lexical signals are review aids only. Human and model-assisted ratings are counted separately; absence of a rating is reported as unrated.",
    privacy: "The authorized env-file path and credential are intentionally omitted from this artifact.",
  };
  for (const path of ["packages/ontology-lab/runner.mjs", "packages/ontology-lab/question-model.mjs", "packages/ontology-lab/question-policy.mjs", "packages/ontology-lab/domain.mjs", "packages/ontology-lab/semantic-review.mjs", "packages/ontology-lab/benchmark/heldout-cases.mjs"]) manifest.sourceHashes[path] = hash(await readFile(join(root, path)));
  await writeFile(join(output, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return manifest;
}

async function loadRatings(path, cases, runs) {
  if (!path) return [];
  const ratings = JSON.parse(await readFile(path, "utf8"));
  if (!Array.isArray(ratings)) throw new Error("ratings file must be a JSON array");
  const allowed = new Set(runs.filter(run => run.terminal === "run.completed").map(run => `${run.caseId}:${run.repeat}`));
  const seen = new Set();
  for (const rating of ratings) {
    const key = `${rating?.caseId}:${rating?.repeat}`;
    if (!cases.some(item => item.id === rating?.caseId) || !Number.isInteger(rating?.repeat) || !allowed.has(key) || seen.has(key)) throw new Error("ratings must refer once to a completed held-out case repetition");
    seen.add(key);
  }
  summarizeRatings(ratings, allowed.size);
  return ratings;
}

async function runLive(options) {
  validateHeldoutCases();
  const corpus = options.caseSet === "baseline" ? BENCHMARK_CASES : HELDOUT_CASES;
  const cases = options.selectedIds.length ? corpus.filter(item => options.selectedIds.includes(item.id)) : corpus;
  if (!cases.length || options.selectedIds.some(id => !cases.some(item => item.id === id))) throw new Error("unknown or empty --cases selection");
  const semanticProvider = await localSemanticProvider(options.envFile);
  if (!semanticProvider) throw new Error("authorized env file does not contain a usable TYPESAFE_API_KEY");
  await mkdir(options.output, { recursive: true });
  const manifest = await writeFrozenManifest({ output: options.output, cases, repeats: options.repeats, concurrency: options.concurrency });
  const directory = await mkdtemp(join(tmpdir(), "bropilot-heldout-"));
  const logs = createWriteStream(join(options.output, "worker.log"));
  await once(logs, "open");
  const jobs = cases.flatMap(item => Array.from({ length: options.repeats }, (_, index) => ({ benchmarkCase: item, repeat: index + 1 })));
  const results = [], labs = [];
  let session;
  try {
    session = await startLocalSession({ port: options.port, directory, output: logs, verifier: false, ontologyLab: false });
    await Promise.all(Array.from({ length: options.concurrency }, async () => {
      const token = randomBytes(32).toString("hex");
      let proposal = null;
      const lab = await startOntologyLab({ token, coreOrigin: session.origin, semanticProvider,
        provider: async input => { proposal = await runLocalCodexProvider(input); return proposal; },
        questionProvider: input => runLocalCodexProvider({ ...input, model: QUESTION_MODEL, schema: questionSchema, prompt: questionPrompt(input) }),
      });
      labs.push(lab);
      while (jobs.length) {
        const job = jobs.shift();
        proposal = null;
        const started = performance.now();
        let events = [], transportError = null;
        try {
          const response = await fetch(`${lab.origin}/run`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ mode: "live", messages: job.benchmarkCase.messages }), signal: AbortSignal.timeout(240_000) });
          if (!response.ok) throw new Error(`Lab HTTP ${response.status}`);
          const trace = await response.text();
          await writeFile(join(options.output, `${job.benchmarkCase.id}-${job.repeat}.ndjson`), trace, { flag: "wx" });
          events = trace.trim().split("\n").filter(Boolean).map(line => JSON.parse(line));
        } catch (error) { transportError = `${error.name}: ${error.message}`; }
        const final = events.at(-1);
        const result = { caseId: job.benchmarkCase.id, repeat: job.repeat, elapsedMs: Math.round(performance.now() - started), terminal: final?.kind ?? "transport.failed", error: transportError ?? (final?.kind === "run.failed" ? final.detail : null), proposal, snapshot: final?.snapshot ?? null, evaluation: final?.evaluation ?? null, semanticReview: final?.semanticReview ?? null, questionSelection: final?.questionSelection ?? null, questionCards: final?.questionCards ?? [], timings: final?.timings ?? {}, eventCount: events.length };
        await writeFile(join(options.output, `${job.benchmarkCase.id}-${job.repeat}.json`), `${JSON.stringify(result, null, 2)}\n`, { flag: "wx" });
        results.push(result);
        console.log(`END ${result.caseId} #${result.repeat} ${result.terminal} ${result.elapsedMs}ms`);
      }
    }));
    const ratings = await loadRatings(options.ratings, cases, results);
    const completed = results.filter(run => run.terminal === "run.completed").length;
    const summary = { benchmarkVersion: HELDOUT_BENCHMARK_VERSION, finishedAt: new Date().toISOString(), output: options.output, manifestHash: hash(JSON.stringify(manifest)), ...scoreHeldoutRuns(results, cases.length), ratings: summarizeRatings(ratings, completed), caveat: "Frozen synthetic held-out conversations assess this pipeline only. Completion, System One judgments, and model-assisted review are not human evaluation or evidence of production usefulness." };
    await writeFile(join(options.output, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, { flag: "wx" });
    const packet = results.map(({ snapshot, ...run }) => ({ ...run, input: cases.find(item => item.id === run.caseId) }));
    await writeFile(join(options.output, "review-packet.json"), `${JSON.stringify(packet, null, 2)}\n`, { flag: "wx" });
    return summary;
  } finally {
    await Promise.all(labs.map(lab => lab.stop()));
    await session?.stop();
    logs.end();
    await rm(directory, { recursive: true, force: true });
  }
}

export async function main(argv = process.argv.slice(2)) {
  const summary = await runLive(parseCli(argv));
  console.log(JSON.stringify(summary, null, 2));
  return summary.failures.count ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
