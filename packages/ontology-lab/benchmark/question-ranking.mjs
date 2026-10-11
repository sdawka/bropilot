#!/usr/bin/env node
import { createHash } from "node:crypto";
import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { INPUT_PRICE_PER_MILLION, MODEL, readApiKey } from "./system-one-benchmark.mjs";

export const RANKING_VERSION = "question-ranking-shadow-v1";
export const ALREADY_ANSWERED_EXCLUSION = 0.9;
export const SCORE_RUBRIC = Object.freeze([
  "Redundant because the user already answered it, contradicts explicit information, reopens excluded scope, assumes a false premise, or is off-topic.",
  "Broad, generic, or low priority now. It may be relevant eventually but does not resolve a consequential uncertainty at the current authoring stage.",
  "A useful unresolved question for the current authoring stage that would materially improve the draft.",
  "A specific, concrete question that resolves a consequential priority, permission, safety, failure-path, or outcome gap now.",
]);
export const SCORE_INSTRUCTIONS = "How useful is this candidate as the single NEXT question to ask the user creating this Thing? Preserve explicit exclusions and answered information. Prefer a specific concrete question over generic boilerplate. A graph obligation is useful only when it is appropriate for the current authoring stage. Evaluate only the named candidate against the role-aware conversation and compact draft.";
export const ANSWERED_INSTRUCTIONS = "Has the user already answered this candidate question in the role-aware conversation, including by explicitly rejecting or excluding the subject? Assistant messages provide context but are not user answers.";

const hash = value => createHash("sha256").update(value).digest("hex");
const normalize = value => value.trim().replace(/\s+/g, " ");

export function collectCandidates(run) {
  const byText = new Map();
  const add = (text, source) => {
    if (typeof text !== "string" || !text.trim()) return;
    const normalized = normalize(text);
    const key = normalized.toLocaleLowerCase("en");
    if (!byText.has(key)) byText.set(key, { id: `candidate-${byText.size + 1}`, text: normalized, sources: [] });
    const item = byText.get(key);
    if (!item.sources.includes(source)) item.sources.push(source);
  };
  for (const text of run.proposal?.questions ?? []) add(text, "proposal");
  for (const card of run.questionCards ?? []) add(card?.text, "criteria");
  return [...byText.values()];
}

export function compactState(benchmarkCase, run, candidates) {
  return {
    conversation: benchmarkCase.messages.map(({ id, role, text }) => ({ id, role, text })),
    draft: {
      entities: (run.snapshot?.objects ?? []).map(({ id, kind, title, properties }) => ({ id, kind, title, properties: properties ?? {} })),
      relationships: (run.snapshot?.relations ?? []).map(({ kind, fromId, toId }) => ({ kind, fromId, toId })),
    },
    candidateQuestions: candidates.map(({ id, text }) => ({ id, text })),
  };
}

export function buildQuestions(candidates) {
  return Object.fromEntries(candidates.flatMap((candidate, index) => {
    const ref = `candidateQuestions[${index}]`;
    return [
      [`score_${index}`, { type: "score", instructions: { task: SCORE_INSTRUCTIONS, candidate: `Evaluate \`${ref}\`.` }, criteria: SCORE_RUBRIC }],
      [`answered_${index}`, { type: "noul", instructions: { task: ANSWERED_INSTRUCTIONS, candidate: `Evaluate \`${ref}\`.` }, criteria: { true: "A user message already supplies the requested information or explicitly excludes it.", false: "The user has not answered this question." } }],
    ];
  }));
}

function validProbability(value) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

const exactLevelKeys = value => value && typeof value === "object" && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(["0", "1", "2", "3"]);

export function interpretAnswers(candidates, answers) {
  const evaluated = candidates.map((candidate, index) => {
    const score = answers?.[`score_${index}`];
    const answered = answers?.[`answered_${index}`];
    if (score?.type !== "score" || answered?.type !== "noul" || !Number.isFinite(score?.score) || score.score < 0 || score.score > 3 || !validProbability(score?.confidence) || !validProbability(answered?.noul)) throw new Error("invalid TypeSafe answer");
    if (!exactLevelKeys(score.probabilities) || !exactLevelKeys(score.legend)) throw new Error("invalid TypeSafe score levels");
    if (!["0", "1", "2", "3"].every(level => score.legend[level] === SCORE_RUBRIC[Number(level)])) throw new Error("mismatched TypeSafe score legend");
    const probabilities = Object.fromEntries(Object.entries(score.probabilities ?? {}).map(([level, value]) => {
      if (!validProbability(value)) throw new Error("invalid TypeSafe probability");
      return [level, value];
    }));
    const probabilitySum = Object.values(probabilities).reduce((sum, value) => sum + value, 0);
    if (Math.abs(probabilitySum - 1) > 0.01 + Number.EPSILON) throw new Error("invalid TypeSafe probability sum");
    return { ...candidate, score: score.score, confidence: score.confidence, probabilities, alreadyAnsweredProbability: answered.noul, excludedAsAnswered: answered.noul >= ALREADY_ANSWERED_EXCLUSION };
  });
  const eligible = evaluated.filter(item => !item.excludedAsAnswered).sort((left, right) => right.score - left.score || right.confidence - left.confidence || left.id.localeCompare(right.id));
  return { selected: eligible[0] ?? null, candidates: evaluated };
}

export async function evaluateRun({ benchmarkCase, run, apiKey, timeoutMs, fetchImpl = fetch }) {
  const candidates = collectCandidates(run);
  if (!candidates.length) return { caseId: run.caseId, repeat: run.repeat, error: "no candidate questions", candidates: [] };
  const state = compactState(benchmarkCase, run, candidates);
  const questions = buildQuestions(candidates);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const response = await fetchImpl("https://api.typesafe.ai/v1/systemone", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, state, questions }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    const interpreted = interpretAnswers(candidates, body.answers);
    return { caseId: run.caseId, repeat: run.repeat, elapsedMs: Math.round(performance.now() - started), model: body.model, usage: body.usage, selected: interpreted.selected, candidates: interpreted.candidates };
  } catch (error) {
    const detail = error?.name === "AbortError" ? "request timed out" : /^HTTP \d+$/.test(error?.message ?? "") ? `TypeSafe ${error.message}` : "TypeSafe response failed validation";
    return { caseId: run.caseId, repeat: run.repeat, elapsedMs: Math.round(performance.now() - started), error: detail, candidates };
  } finally {
    clearTimeout(timer);
  }
}

export async function loadRuns(inputDir) {
  const manifestSource = await readFile(resolve(inputDir, "manifest.json"));
  const manifest = JSON.parse(manifestSource);
  if (!Array.isArray(manifest.cases) || typeof manifest.casesHash !== "string" || hash(JSON.stringify(manifest.cases)) !== manifest.casesHash) throw new Error("input manifest cases hash mismatch");
  const caseById = new Map(manifest.cases.map(item => [item.id, item]));
  if (caseById.size !== manifest.cases.length || [...caseById.values()].some(item => !Array.isArray(item.messages))) throw new Error("invalid input manifest cases");
  const files = (await readdir(inputDir)).filter(name => /-[1-9]\d*\.json$/.test(name)).sort();
  const runs = await Promise.all(files.map(async name => {
    const source = await readFile(resolve(inputDir, name));
    const run = JSON.parse(source);
    const benchmarkCase = caseById.get(run.caseId);
    if (!benchmarkCase) throw new Error(`unknown benchmark case in ${name}`);
    return { name, sourceHash: hash(source), run, benchmarkCase };
  }));
  return { manifest, manifestHash: hash(manifestSource), runs };
}

async function assertOutputAvailable(output) {
  try {
    await access(output);
    const error = new Error("question ranking output already exists");
    error.code = "EEXIST";
    throw error;
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export async function runRanking({ inputDir, output, apiKey, timeoutMs = 30000, fetchImpl = fetch }) {
  await mkdir(dirname(output), { recursive: true });
  await assertOutputAvailable(output);
  const loaded = await loadRuns(inputDir);
  const frozen = {
    version: RANKING_VERSION,
    createdAt: new Date().toISOString(),
    modelRequested: MODEL,
    inputDirectory: basename(inputDir),
    inputManifestHash: loaded.manifestHash,
    inputCasesHash: loaded.manifest.casesHash,
    inputHashes: Object.fromEntries(loaded.runs.map(item => [item.name, item.sourceHash])),
    promptHash: hash(JSON.stringify({ scoreInstructions: SCORE_INSTRUCTIONS, scoreRubric: SCORE_RUBRIC, answeredInstructions: ANSWERED_INSTRUCTIONS, answeredExclusion: ALREADY_ANSWERED_EXCLUSION })),
    scoreInstructions: SCORE_INSTRUCTIONS,
    scoreRubric: SCORE_RUBRIC,
    answeredInstructions: ANSWERED_INSTRUCTIONS,
    answeredExclusion: ALREADY_ANSWERED_EXCLUSION,
    policy: "Shadow ranking only. Confidence is descriptive model output, not a guarantee or production action threshold. Independent review compares selections later.",
  };
  await writeFile(`${output}.manifest.json`, `${JSON.stringify(frozen, null, 2)}\n`, { flag: "wx" });
  const results = [];
  for (const item of loaded.runs) results.push(await evaluateRun({ ...item, apiKey, timeoutMs, fetchImpl }));
  const completed = results.filter(result => !result.error);
  const usage = completed.reduce((total, result) => ({ inputTokens: total.inputTokens + (result.usage?.input_tokens ?? 0), outputTokens: total.outputTokens + (result.usage?.output_tokens ?? 0) }), { inputTokens: 0, outputTokens: 0 });
  const report = {
    frozen,
    summary: {
      runCount: results.length,
      completed: completed.length,
      failed: results.length - completed.length,
      selectedCount: completed.filter(result => result.selected).length,
      modelVersions: [...new Set(completed.map(result => result.model))],
      elapsedMs: completed.reduce((sum, result) => sum + result.elapsedMs, 0),
      usage: { ...usage, estimatedInputCostUsd: usage.inputTokens * INPUT_PRICE_PER_MILLION / 1_000_000 },
    },
    results,
  };
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  return report;
}

export function parseCli(argv) {
  const { values } = parseArgs({ args: argv, options: { live: { type: "boolean", default: false }, "env-file": { type: "string" }, input: { type: "string", default: ".test-artifacts/ontology-benchmark-baseline" }, output: { type: "string", default: ".test-artifacts/ontology-benchmark-baseline/question-ranking.json" }, timeout: { type: "string", default: "30000" } }, strict: true });
  const timeoutMs = Number(values.timeout);
  if (!values.live) throw new Error("live model calls require --live");
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120000) throw new Error("--timeout must be 1000..120000 milliseconds");
  return { envFile: values["env-file"], inputDir: resolve(values.input), output: resolve(values.output), timeoutMs };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCli(argv);
  const apiKey = await readApiKey(options.envFile);
  if (!apiKey) throw new Error("TYPESAFE_API_KEY is required via the environment or --env-file");
  const report = await runRanking({ ...options, apiKey });
  console.log(JSON.stringify(report.summary, null, 2));
  return report.summary.failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; }).catch(error => { console.error(error?.code === "EEXIST" ? "question ranking output already exists" : error.message); process.exitCode = 1; });
}
