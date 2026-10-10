import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { buildQuestions, collectCandidates, compactState, interpretAnswers, loadRuns, runRanking, SCORE_RUBRIC } from "./question-ranking.mjs";

const hash = value => createHash("sha256").update(value).digest("hex");
const validAnswer = (score = 2.8, confidence = 0.8, answered = 0.1) => ({
  score: { type: "score", score, confidence, legend: Object.fromEntries(SCORE_RUBRIC.map((value, index) => [index, value])), probabilities: { 0: 0, 1: 0, 2: 0.2, 3: 0.8 } },
  answered: { type: "noul", noul: answered },
});

test("candidate pool deduplicates proposal and criteria questions", () => {
  const candidates = collectCandidates({ proposal: { questions: ["What matters?", "  What   matters? "] }, questionCards: [{ text: "What matters?" }, { text: "What is safe?" }] });
  assert.deepEqual(candidates, [
    { id: "candidate-1", text: "What matters?", sources: ["proposal", "criteria"] },
    { id: "candidate-2", text: "What is safe?", sources: ["criteria"] },
  ]);
});

test("state preserves roles while compacting graph details", () => {
  const state = compactState({ messages: [{ id: "u1", role: "user", text: "No email." }, { id: "a1", role: "assistant", text: "Use email?" }] }, { snapshot: { objects: [{ id: "x", kind: "thing", title: "App", properties: { excluded: "email" }, source: { secret: "omit" } }], relations: [{ id: "r", kind: "contains", fromId: "w", toId: "x", source: { secret: "omit" } }] } }, [{ id: "candidate-1", text: "Use email?" }]);
  assert.deepEqual(state.conversation.map(message => message.role), ["user", "assistant"]);
  assert.equal(state.draft.entities[0].properties.excluded, "email");
  assert.equal("source" in state.draft.entities[0], false);
  assert.equal("id" in state.draft.relationships[0], false);
});

test("each candidate receives one independent Score and one answered Noul", () => {
  const questions = buildQuestions([{ id: "candidate-1", text: "One?" }, { id: "candidate-2", text: "Two?" }]);
  assert.deepEqual(Object.values(questions).map(question => question.type), ["score", "noul", "score", "noul"]);
  assert.equal(questions.score_0.criteria.length, SCORE_RUBRIC.length);
  assert.match(questions.score_1.instructions.candidate, /candidateQuestions\[1\]/);
});

test("answered candidates are excluded before ranking", () => {
  const candidates = [{ id: "candidate-1", text: "Already?", sources: ["proposal"] }, { id: "candidate-2", text: "Next?", sources: ["criteria"] }];
  const first = validAnswer(2.8, 0.8, 0.95), second = validAnswer(2.2, 0.6, 0.1);
  const result = interpretAnswers(candidates, { score_0: first.score, answered_0: first.answered, score_1: second.score, answered_1: second.answered });
  assert.equal(result.selected.id, "candidate-2");
  assert.equal(result.candidates[0].excludedAsAnswered, true);
  assert.deepEqual(result.selected.probabilities, { 0: 0, 1: 0, 2: 0.2, 3: 0.8 });
});

test("answer validation rejects wrong types, score bounds, levels, legends, and probability sums", () => {
  const candidates = [{ id: "candidate-1", text: "Next?", sources: ["proposal"] }];
  const check = answer => interpretAnswers(candidates, { score_0: answer.score, answered_0: answer.answered });
  for (const mutate of [
    answer => { answer.score.type = "noul"; },
    answer => { answer.answered.type = "score"; },
    answer => { answer.score.score = 3.01; },
    answer => { delete answer.score.probabilities[3]; answer.score.probabilities[4] = 0.8; },
    answer => { answer.score.legend[3] = "different rubric"; },
    answer => { answer.score.probabilities = { 0: 0.1, 1: 0.1, 2: 0.1, 3: 0.1 }; },
  ]) {
    const answer = validAnswer();
    mutate(answer);
    assert.throws(() => check(answer), /invalid|mismatched/);
  }
});

async function makeInput(directory, { validHash = true } = {}) {
  const cases = [{ id: "demo", messages: [{ id: "u1", role: "user", text: "Build a list." }] }];
  const manifest = { cases, casesHash: validHash ? hash(JSON.stringify(cases)) : "wrong" };
  await writeFile(join(directory, "manifest.json"), JSON.stringify(manifest));
  await writeFile(join(directory, "demo-1.json"), JSON.stringify({ caseId: "demo", repeat: 1, proposal: { questions: ["What belongs on the list?"] }, questionCards: [], snapshot: { objects: [], relations: [] } }));
}

test("runs use the frozen input cases and verify their manifest hash", async () => {
  const directory = await mkdtemp(join(tmpdir(), "question-ranking-input-"));
  try {
    await makeInput(directory);
    const loaded = await loadRuns(directory);
    assert.equal(loaded.runs[0].benchmarkCase.messages[0].text, "Build a list.");
    await writeFile(join(directory, "manifest.json"), JSON.stringify({ cases: loaded.manifest.cases, casesHash: "edited" }));
    await assert.rejects(() => loadRuns(directory), /hash mismatch/);
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("existing output is refused before input loading or paid requests", async () => {
  const directory = await mkdtemp(join(tmpdir(), "question-ranking-existing-"));
  const output = join(directory, "result.json");
  let requests = 0;
  try {
    await writeFile(output, "past evidence");
    await assert.rejects(() => runRanking({ inputDir: join(directory, "missing"), output, apiKey: "test", fetchImpl: async () => { requests += 1; } }), error => error?.code === "EEXIST");
    assert.equal(requests, 0);
    assert.equal(await readFile(output, "utf8"), "past evidence");
  } finally {
    await rm(directory, { recursive: true });
  }
});

test("frozen ranking manifest exists before the first request", async () => {
  const directory = await mkdtemp(join(tmpdir(), "question-ranking-freeze-"));
  const output = join(directory, "result.json");
  try {
    await makeInput(directory);
    let manifestSeen = false;
    const fetchImpl = async (_url, options) => {
      const frozen = JSON.parse(await readFile(`${output}.manifest.json`, "utf8"));
      manifestSeen = frozen.version === "question-ranking-shadow-v1" && typeof frozen.inputCasesHash === "string";
      const request = JSON.parse(options.body);
      const answers = {};
      for (const id of Object.keys(request.questions)) answers[id] = id.startsWith("score_") ? validAnswer().score : validAnswer().answered;
      return { ok: true, json: async () => ({ model: "jev-1.13.0", answers, usage: { input_tokens: 10, output_tokens: 2 } }) };
    };
    const report = await runRanking({ inputDir: directory, output, apiKey: "test", fetchImpl });
    assert.equal(manifestSeen, true);
    assert.equal(report.summary.completed, 1);
    assert.equal(JSON.parse(await readFile(output, "utf8")).frozen.inputManifestHash, report.frozen.inputManifestHash);
  } finally {
    await rm(directory, { recursive: true });
  }
});
