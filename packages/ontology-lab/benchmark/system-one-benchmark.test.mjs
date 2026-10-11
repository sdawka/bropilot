import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { SYSTEM_ONE_CASES, validateCases } from "./system-one-cases.mjs";
import { classify, isEntrypoint, parseCli, readApiKey, runBenchmark, scoreResults } from "./system-one-benchmark.mjs";

test("case set is balanced by dimension and separates subjective judgments", () => {
  assert.equal(validateCases().length, 36);
  const dimensions = [...new Set(SYSTEM_ONE_CASES.map(item => item.dimension))];
  assert.equal(dimensions.length, 6);
  for (const dimension of dimensions) {
    const cases = SYSTEM_ONE_CASES.filter(item => item.dimension === dimension);
    assert.equal(cases.length, 6);
    assert.equal(cases.filter(item => item.label).length, 3);
    assert.equal(cases.filter(item => !item.label).length, 3);
  }
  assert.deepEqual([...new Set(SYSTEM_ONE_CASES.filter(item => item.dimension === "question_usefulness").map(item => item.kind))], ["subjective"]);
  assert.ok(SYSTEM_ONE_CASES.filter(item => item.dimension !== "question_usefulness").every(item => item.kind === "crisp"));
});

test("decision bands include their declared boundaries", () => {
  assert.equal(classify(0), "false");
  assert.equal(classify(0.1), "false");
  assert.equal(classify(0.100001), "abstain");
  assert.equal(classify(0.899999), "abstain");
  assert.equal(classify(0.9), "true");
  assert.equal(classify(1), "true");
});

test("missing rows cannot produce a perfect or complete score", () => {
  const cases = SYSTEM_ONE_CASES.slice(0, 2);
  const rows = [{ caseId: cases[0].id, repeat: 1, probability: cases[0].label ? 0.99 : 0.01, latencyMs: 10, usage: { input_tokens: 1, output_tokens: 1 } }];
  const summary = scoreResults(cases, rows, 1);
  assert.equal(summary.overall.complete, false);
  assert.equal(summary.overall.missing, 1);
  assert.equal(summary.overall.rawThresholdAccuracy, 0.5);
  assert.equal(summary.overall.rawThresholdAccuracyOnCompleted, 1);
  assert.equal(summary.overall.coverage, 0.5);
});

test("scoring reports high-confidence mistakes and repeat variability", () => {
  const [positive] = SYSTEM_ONE_CASES.filter(item => item.label);
  const rows = [
    { caseId: positive.id, repeat: 1, probability: 0.95, latencyMs: 20, usage: { input_tokens: 10, output_tokens: 2 } },
    { caseId: positive.id, repeat: 2, probability: 0.05, latencyMs: 40, usage: { input_tokens: 10, output_tokens: 2 } },
  ];
  const summary = scoreResults([positive], rows, 2);
  assert.equal(summary.overall.rawThresholdAccuracy, 0.5);
  assert.equal(summary.overall.acceptedErrors, 1);
  assert.equal(summary.variability[0].thresholdFlip, true);
  assert.equal(summary.variability[0].decisionBandChanged, true);
  assert.equal(summary.latencyMs.mean, 30);
});

test("non-finite probabilities are rejected and cannot improve scores", () => {
  const [item] = SYSTEM_ONE_CASES;
  const summary = scoreResults([item], [
    { caseId: item.id, repeat: 1, probability: Number.NaN },
    { caseId: item.id, repeat: 1, probability: Number.POSITIVE_INFINITY },
  ], 1);
  assert.equal(summary.invalidRowCount, 2);
  assert.equal(summary.overall.completed, 0);
  assert.equal(summary.overall.rawThresholdAccuracy, 0);
});

test("entrypoint detection tolerates an undefined argv path", () => {
  assert.equal(isEntrypoint(import.meta.url, undefined), false);
});

test("CLI parser is offline and validates bounded controls", () => {
  const parsed = parseCli(["--live", "--env-file", "/tmp/example.env", "--output-dir", "/tmp/results", "--repeats", "3"]);
  assert.equal(parsed.live, true);
  assert.equal(parsed.envFile, "/tmp/example.env");
  assert.equal(parsed.repeats, 3);
  assert.throws(() => parseCli(["--repeats", "0"]), /repeats/);
  assert.throws(() => parseCli(["--timeout", "999"]), /timeout/);
});

test("env-file parsing selects only the TypeSafe credential without a network call", async () => {
  const directory = await mkdtemp(join(tmpdir(), "system-one-env-"));
  const path = join(directory, ".env");
  try {
    await writeFile(path, "UNRELATED=leave-me-alone\nTYPESAFE_API_KEY=test-only-key\n");
    assert.equal(await readApiKey(path, {}), "test-only-key");
    assert.equal(await readApiKey(undefined, { TYPESAFE_API_KEY: "from-process" }), "from-process");
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("a frozen case manifest cannot be overwritten by a rerun", async () => {
  const directory = await mkdtemp(join(tmpdir(), "system-one-output-"));
  try {
    const options = { live: false, outputDir: directory, repeats: 1 };
    await runBenchmark(options);
    await assert.rejects(() => runBenchmark(options), error => error?.code === "EEXIST");
  } finally {
    await rm(directory, { recursive: true });
  }
});
