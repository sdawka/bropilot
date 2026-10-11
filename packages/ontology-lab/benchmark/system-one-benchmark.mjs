#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { parseArgs, parseEnv } from "node:util";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SYSTEM_ONE_CASES, validateCases } from "./system-one-cases.mjs";

export const MODEL = "jev-1.13.0";
export const DEFAULT_REPEATS = 3;
export const FALSE_MAX = 0.1;
export const TRUE_MIN = 0.9;
export const INPUT_PRICE_PER_MILLION = 0.042;
export const BENCHMARK_VERSION = "system-one-semantic-v2";

const hash = value => createHash("sha256").update(value).digest("hex");

export function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      live: { type: "boolean", default: false },
      "env-file": { type: "string" },
      "output-dir": { type: "string", default: ".test-artifacts/system-one-benchmark" },
      repeats: { type: "string", default: String(DEFAULT_REPEATS) },
      concurrency: { type: "string", default: "6" },
      timeout: { type: "string", default: "20000" },
    },
    allowPositionals: false,
    strict: true,
  });
  const repeats = Number(values.repeats);
  const concurrency = Number(values.concurrency);
  const timeoutMs = Number(values.timeout);
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 10) throw new Error("--repeats must be an integer from 1 to 10");
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 12) throw new Error("--concurrency must be an integer from 1 to 12");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new Error("--timeout must be 1000..120000 milliseconds");
  return { live: values.live, envFile: values["env-file"], outputDir: resolve(values["output-dir"]), repeats, concurrency, timeoutMs };
}

export async function readApiKey(envFile, environment = process.env) {
  if (!envFile) return environment.TYPESAFE_API_KEY || "";
  const parsed = parseEnv(await readFile(resolve(envFile), "utf8"));
  return parsed.TYPESAFE_API_KEY || "";
}

export function classify(probability) {
  if (probability <= FALSE_MAX) return "false";
  if (probability >= TRUE_MIN) return "true";
  return "abstain";
}

const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

function scoreSlice(cases, rows, repeats) {
  const expected = cases.length * repeats;
  const caseIds = new Set(cases.map(item => item.id));
  const applicable = rows.filter(row => caseIds.has(row.caseId));
  const completed = applicable.length;
  let correct = 0;
  let accepted = 0;
  let acceptedErrors = 0;
  let brierTotal = 0;
  for (const row of applicable) {
    const item = cases.find(entry => entry.id === row.caseId);
    const prediction = row.probability >= 0.5;
    if (prediction === item.label) correct += 1;
    const band = classify(row.probability);
    if (band !== "abstain") {
      accepted += 1;
      if ((band === "true") !== item.label) acceptedErrors += 1;
    }
    brierTotal += (row.probability - Number(item.label)) ** 2;
  }
  return {
    expected,
    completed,
    missing: expected - completed,
    complete: completed === expected,
    rawThresholdAccuracy: expected ? correct / expected : null,
    rawThresholdAccuracyOnCompleted: completed ? correct / completed : null,
    coverage: expected ? accepted / expected : null,
    accepted,
    acceptedErrors,
    acceptedErrorRate: accepted ? acceptedErrors / accepted : null,
    brier: completed ? brierTotal / completed : null,
  };
}

export function scoreResults(cases, rows, repeats = DEFAULT_REPEATS) {
  validateCases(cases);
  const seen = new Set();
  const validRows = [];
  const invalidRows = [];
  for (const row of rows) {
    const key = `${row.caseId}:${row.repeat}`;
    if (seen.has(key) || !cases.some(item => item.id === row.caseId) || !Number.isInteger(row.repeat) || row.repeat < 1 || row.repeat > repeats || !Number.isFinite(row.probability) || row.probability < 0 || row.probability > 1) {
      invalidRows.push(row);
      continue;
    }
    seen.add(key);
    validRows.push(row);
  }
  const dimensions = Object.fromEntries([...new Set(cases.map(item => item.dimension))].map(dimension => [dimension, scoreSlice(cases.filter(item => item.dimension === dimension), validRows, repeats)]));
  const kinds = Object.fromEntries([...new Set(cases.map(item => item.kind))].map(kind => [kind, scoreSlice(cases.filter(item => item.kind === kind), validRows, repeats)]));
  const variability = cases.map(item => {
    const probabilities = validRows.filter(row => row.caseId === item.id).map(row => row.probability);
    return {
      caseId: item.id,
      count: probabilities.length,
      mean: mean(probabilities),
      min: probabilities.length ? Math.min(...probabilities) : null,
      max: probabilities.length ? Math.max(...probabilities) : null,
      spread: probabilities.length ? Math.max(...probabilities) - Math.min(...probabilities) : null,
      thresholdFlip: new Set(probabilities.map(value => value >= 0.5)).size > 1,
      decisionBandChanged: new Set(probabilities.map(classify)).size > 1,
    };
  });
  const usage = validRows.reduce((total, row) => ({
    inputTokens: total.inputTokens + (row.usage?.input_tokens || 0),
    outputTokens: total.outputTokens + (row.usage?.output_tokens || 0),
  }), { inputTokens: 0, outputTokens: 0 });
  const latencies = validRows.map(row => row.latencyMs).filter(Number.isFinite);
  return {
    thresholds: { falseMax: FALSE_MAX, trueMin: TRUE_MIN, rawThreshold: 0.5 },
    overall: scoreSlice(cases, validRows, repeats),
    dimensions,
    kinds,
    variability,
    invalidRowCount: invalidRows.length,
    usage: { ...usage, estimatedInputCostUsd: usage.inputTokens * INPUT_PRICE_PER_MILLION / 1_000_000 },
    latencyMs: { mean: mean(latencies), min: latencies.length ? Math.min(...latencies) : null, max: latencies.length ? Math.max(...latencies) : null },
  };
}

function safeError(error) {
  if (error?.name === "AbortError") return "request timed out";
  return "TypeSafe request failed";
}

export async function evaluateCase(item, repeat, { apiKey, timeoutMs, fetchImpl = fetch }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetchImpl("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, state: item.state, questions: { judgment: item.question } }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const result = await response.json();
    const probability = result?.answers?.judgment?.noul;
    if (typeof probability !== "number" || probability < 0 || probability > 1) throw new Error("invalid response");
    return { caseId: item.id, repeat, probability, band: classify(probability), latencyMs: Math.round(performance.now() - started), model: result.model, usage: result.usage };
  } catch (error) {
    return { caseId: item.id, repeat, error: safeError(error), latencyMs: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timeout);
  }
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      output[index] = await worker(items[index]);
    }
  }));
  return output;
}

export async function runBenchmark(options) {
  validateCases();
  await mkdir(options.outputDir, { recursive: true });
  const casesJson = JSON.stringify(SYSTEM_ONE_CASES);
  const frozen = { benchmarkVersion: BENCHMARK_VERSION, createdAt: new Date().toISOString(), model: MODEL, repeats: options.repeats, casesSha256: hash(casesJson), cases: SYSTEM_ONE_CASES };
  await writeFile(resolve(options.outputDir, "prelabelled-cases.json"), `${JSON.stringify(frozen, null, 2)}\n`, { flag: "wx" });
  if (!options.live) return { frozen, rows: [], summary: null };
  const apiKey = await readApiKey(options.envFile);
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is required via the environment or --env-file");
  const jobs = [];
  for (let repeat = 1; repeat <= options.repeats; repeat += 1) for (const item of SYSTEM_ONE_CASES) jobs.push({ item, repeat });
  const attempted = await mapLimit(jobs, options.concurrency, ({ item, repeat }) => evaluateCase(item, repeat, { apiKey, timeoutMs: options.timeoutMs }));
  const rows = attempted.filter(row => typeof row.probability === "number");
  const failures = attempted.filter(row => row.error);
  const summary = { generatedAt: new Date().toISOString(), modelRequested: MODEL, caseCount: SYSTEM_ONE_CASES.length, repeats: options.repeats, runCount: jobs.length, failureCount: failures.length, ...scoreResults(SYSTEM_ONE_CASES, rows, options.repeats), caveat: "Small synthetic benchmark; it does not establish calibration or general-population accuracy." };
  await writeFile(resolve(options.outputDir, "raw-results.json"), `${JSON.stringify({ frozen, attempted }, null, 2)}\n`, { flag: "wx" });
  await writeFile(resolve(options.outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, { flag: "wx" });
  return { frozen, rows, failures, summary };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  const result = await runBenchmark(options);
  if (!options.live) {
    console.log(`Saved ${SYSTEM_ONE_CASES.length} prelabelled cases. Add --live to call ${MODEL}.`);
    return 0;
  }
  console.log(JSON.stringify(result.summary, null, 2));
  return result.failures.length || !result.summary.overall.complete ? 1 : 0;
}

export function isEntrypoint(moduleUrl, argv1) {
  return Boolean(argv1) && moduleUrl === pathToFileURL(argv1).href;
}

if (isEntrypoint(import.meta.url, process.argv[1])) {
  main().then(code => { process.exitCode = code; }).catch(error => {
    console.error(safeError(error));
    process.exitCode = 1;
  });
}
