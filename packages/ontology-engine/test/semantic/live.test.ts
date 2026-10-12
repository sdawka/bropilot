import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  DEFAULT_OPENROUTER_MODEL, DEFAULT_THRESHOLDS, evaluateAndJudge, openRouterProvider, type Answer, type Finding, type SystemOne,
} from "../../src";
import { FIXTURES, probeFindings, subjectOf, subjectsOf, VOCABULARIES } from "./vocabularies";

/**
 * Real-provider semantic suite. Skipped unless OPENROUTER_API_KEY is set; the key is read here and handed to the
 * provider only. Run: OPENROUTER_API_KEY=… npm run test:live -w @bropilot/ontology-engine
 */
const KEY = process.env.OPENROUTER_API_KEY?.trim();
const MODEL = process.env.OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_MODEL;
const ASK = { timeoutMs: 60_000, retries: 2, backoffMs: 2_000 };
const slug = (s: string) => s.replace(/[^A-Za-z0-9.-]+/g, "-");

interface LiveAnswer {
  fixture: string;
  question: string;
  subject: string;
  text: string;
  answer?: Answer;
  probabilities?: Record<string, number>;
  confidence?: number;
  latencyMs?: number;
  model?: string;
  inputTokens?: number;
  error?: string;
}

const answers: LiveAnswer[] = [];
const verdicts: Record<string, unknown> = {};
const startedAt = new Date().toISOString();

const probabilitiesOf = (a: Answer | undefined) =>
  a?.type === "noul" ? { yes: a.noul, no: 1 - a.noul } : a?.probabilities;
const confidenceOf = (a: Answer | undefined) =>
  a?.type === "noul" ? Math.max(a.noul, 1 - a.noul) : a?.confidence;

/** Delegates to `inner` and records every answer, so a run can be audited without re-asking. */
function recording(inner: SystemOne, fixture: string): SystemOne {
  return {
    ...inner,
    async ask(state, questions, opts) {
      const s = state as { subject?: { id: string }; counterpart?: { id: string }; candidate?: { text: string } };
      const subject = [s.subject?.id, s.counterpart?.id].filter(Boolean).join("|");
      const text = s.candidate?.text ?? "";
      try {
        const reply = await inner.ask(state, questions, opts);
        for (const id of Object.keys(questions)) {
          const a = reply.answers[id];
          answers.push({
            fixture, question: id, subject, text, answer: a, probabilities: probabilitiesOf(a), confidence: confidenceOf(a),
            latencyMs: reply.ms, model: reply.model, inputTokens: reply.usage.input_tokens,
          });
        }
        return reply;
      } catch (e) {
        for (const id of Object.keys(questions)) answers.push({ fixture, question: id, subject, text, error: (e as Error).message });
        throw e;
      }
    },
  };
}

const brief = (f: Finding) => ({ rule: f.rule, subject: f.subject, level: f.level, status: f.judgment?.status, answer: f.judgment?.answer, confidence: f.judgment?.confidence, error: f.provenance?.error?.message });

if (!KEY) console.info(`live semantic suite skipped: set OPENROUTER_API_KEY to run it against ${MODEL}`);

describe.skipIf(!KEY)(`live semantic suite (${MODEL})`, () => {
  afterAll(() => {
    const file = join(FIXTURES, `live-results.${slug(MODEL)}.json`);
    writeFileSync(file, `${JSON.stringify({ model: MODEL, startedAt, finishedAt: new Date().toISOString(), thresholds: DEFAULT_THRESHOLDS, ask: ASK, calls: answers.length, verdicts, answers }, null, 2)}\n`);
  });

  for (const make of VOCABULARIES) {
    const v = make();
    it(`${v.name}: finds every planted problem and leaves the controls alone`, async () => {
      const s1 = recording(openRouterProvider({ apiKey: KEY!, model: MODEL }), v.name);
      const r = await evaluateAndJudge(v.template, v.graph, s1, { ask: ASK });
      const probes = probeFindings(r);

      const planted = v.expectations.planted.map((p) => {
        const f = probes.find((x) => x.rule === `semantic:${p.rule}` && x.subject === subjectOf(p));
        const ok = !!f && f.level === p.level && (f.judgment?.confidence ?? 0) >= DEFAULT_THRESHOLDS.confident;
        return { id: p.id, rule: p.rule, subject: subjectOf(p), expected: p.level, ok, found: f ? brief(f) : null };
      });
      const controls = v.expectations.controls.map((c) => {
        const flagged = probes.filter((f) => subjectsOf(f.subject).includes(c.subject) && (f.level === "error" || f.level === "warning")).map(brief);
        return { id: c.id, subject: c.subject, ok: flagged.length === 0, flagged };
      });
      verdicts[v.name] = { calls: answers.filter((a) => a.fixture === v.name).length, judgments: r.judgments, planted, controls };

      for (const p of planted) {
        expect.soft(p.found, `${p.id}: no ${p.rule} finding on ${p.subject}`).not.toBeNull();
        expect.soft(p.found?.level, `${p.id}: level`).toBe(p.expected);
        expect.soft(p.found?.confidence ?? 0, `${p.id}: confidence`).toBeGreaterThanOrEqual(DEFAULT_THRESHOLDS.confident);
      }
      for (const c of controls) expect.soft(c.flagged, `${c.id}: control flagged`).toEqual([]);
    }, 20 * 60_000);
  }
});
