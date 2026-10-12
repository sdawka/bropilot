import { describe, expect, it } from "vitest";
import {
  buildSlice, canon, checkTemplateForm, evaluate, evaluateAndJudge, fakeSystemOne, loadTemplate, pairOf, PROBE_SOURCE, productSpec,
  SEMANTIC_RULES, semanticCatalogue, semanticProbe, SliceSchema, toWire, withSemanticProbes, type Graph, type ProbeOptions,
} from "../../src";
import { probeFindings, PROBE_RULES, SETTINGS, subjectOf, subjectsOf, VOCABULARIES, type Vocabulary } from "./vocabularies";

/** Provider calls one live run makes per fixture (before retries); the README quotes the total. */
const LIVE_CALLS: Record<string, number> = { artyfact: 233, product: 18, world: 10 };
const SETTING_OF: Record<string, ProbeOptions> = { artyfact: SETTINGS.artyfact, product: SETTINGS.product, world: SETTINGS.world };

/** An independent reading of `semantic.probe@1` over the graph: `rule subject text` for every candidate it should emit. */
function oracle(g: Graph, o: ProbeOptions, asked: Set<string>): string[] {
  const statements = new Map<string, string[]>();
  for (const n of g.nodes) for (const f of o.texts ?? ["description"]) {
    const v = n.fields[f];
    for (const x of Array.isArray(v) ? v : [v]) if (typeof x === "string" && x !== "") statements.set(n.id, [...(statements.get(n.id) ?? []), x]);
  }
  const kind = new Map(g.nodes.map((n) => [n.id, n.kind]));
  const out = new Set<string>();
  for (const [id, texts] of statements) for (const t of texts) {
    if (asked.has("text.vague")) out.add(`text.vague ${id} ${t}`);
    if (asked.has("text.unmeasurable") && (o.measurable ?? []).includes(kind.get(id)!)) out.add(`text.unmeasurable ${id} ${t}`);
    if (asked.has("criterion.unfalsifiable") && (o.criteria ?? []).includes(kind.get(id)!)) out.add(`criterion.unfalsifiable ${id} ${t}`);
  }
  if (asked.has("pair.contradiction")) {
    const pair = (a: string, b: string) => { if (a !== b && statements.has(a) && statements.has(b)) out.add(`pair.contradiction ${[a, b].sort().join(" ")}`); };
    for (const l of g.links) if ((o.probePairs ?? []).includes(l.rel)) pair(l.from, l.to);
    const sib = (k: string) => (o.siblings ?? ["*"]).includes("*") || (o.siblings ?? []).includes(k);
    for (const a of g.nodes) for (const b of g.nodes) {
      if (a.parent && a.parent === b.parent && sib(a.kind) && sib(b.kind)) pair(a.id, b.id);
    }
  }
  return [...out].sort();
}

const emitted = (v: Vocabulary) =>
  probeFindings(evaluate(v.template, v.graph)).map((f) => `${f.rule.slice("semantic:".length)} ${f.subject} ${f.derivation.tuple[2]}`).sort();

describe.each(VOCABULARIES.map((make) => [make().name, make] as const))("semantic.probe@1 on %s", (_name, make) => {
  const v = make();
  const asked = new Set(v.template.questions.map((q) => q.id));

  it("is a valid template with the catalogue and the pack", () => {
    expect(checkTemplateForm(v.template).valid).toBe(true);
    expect(SEMANTIC_RULES.every((r) => asked.has(r))).toBe(true);
    expect(v.template.rules.map((r) => r.id)).toContain("semantic.probe");
  });

  it("emits candidates for exactly the subjects the probe settings select", () => {
    const got = emitted(v);
    expect(got).toEqual(oracle(v.graph, SETTING_OF[v.name], asked));
    expect(got.length).toBeGreaterThan(0);
  });

  it("emits a candidate for every planted problem and every control", () => {
    const r = evaluate(v.template, v.graph);
    const keys = new Set(probeFindings(r).map((f) => `${f.rule} ${f.subject}|${f.derivation.tuple[2]}`));
    const singles = new Set(probeFindings(r).map((f) => `${f.rule} ${f.subject}`));
    for (const p of v.expectations.planted) {
      const key = p.subjects.length === 2 ? `semantic:${p.rule} ${subjectOf(p)}` : `semantic:${p.rule} ${p.subjects[0]}`;
      expect(p.subjects.length === 2 ? keys.has(key) : singles.has(key), `${p.id} ${key}`).toBe(true);
    }
    for (const c of v.expectations.controls) expect(singles.has(`semantic:text.vague ${c.subject}`), c.id).toBe(true);
  });

  it("judges every probe candidate with the fake provider: benign answers pass, pairs carry both subjects", async () => {
    const r = await evaluateAndJudge(v.template, v.graph, fakeSystemOne());
    const probes = probeFindings(r);
    expect(probes.every((f) => f.level === "pass" && f.judgment?.status === "confident")).toBe(true);
    const pairs = probes.filter((f) => f.rule === "semantic:pair.contradiction");
    expect(pairs.length).toBeGreaterThan(0);
    for (const f of pairs) {
      const [a, b] = subjectsOf(f.subject);
      expect(a < b).toBe(true);
      const q = v.template.questions.find((x) => x.id === "pair.contradiction")!;
      const s = buildSlice(v.graph, f.subject!, q.slice, { rule: "pair.contradiction", text: b });
      expect(s.subject).toMatchObject({ id: a, kind: expect.any(String) });
      expect(s.counterpart).toMatchObject({ id: b, kind: expect.any(String) });
    }
    for (const p of v.expectations.planted.filter((x) => x.subjects.length === 2)) {
      expect(pairs.map((f) => f.subject), p.id).toContain(subjectOf(p));
    }
  });

  it("asks one provider call per semantic candidate; the live suite makes this many calls", () => {
    const calls = evaluate(v.template, v.graph).findings.filter((f) => f.rule.startsWith("semantic:") && asked.has(f.rule.slice("semantic:".length))).length;
    expect(calls).toBe(LIVE_CALLS[v.name]);
  });

  it("is deterministic", async () => {
    const run = async () => canon(await evaluateAndJudge(make().template, make().graph, fakeSystemOne()));
    expect(await run()).toBe(await run());
  });
});

describe("probe plumbing", () => {
  const graph = (): Graph => ({
    template: "template.meta.product-spec@1",
    nodes: [
      { id: "$spec", kind: "spec", fields: {} },
      { id: "name", kind: "name", parent: "$spec", fields: { title: "N" } },
      { id: "p", kind: "purpose", parent: "$spec", fields: { title: "P", description: "Works with no signal. #s1harm" } },
      { id: "r", kind: "rule", parent: "$spec", fields: { title: "R", description: "Needs a live connection." } },
      { id: "o", kind: "outcome", parent: "$spec", fields: { title: "O", description: "People are happier." } },
    ],
    links: [{ from: "p", rel: "motivates", to: "o" }], declarations: [], evidence: [],
  });

  it("a template enables rules through its questions", () => {
    const only = loadTemplate(withSemanticProbes(productSpec, { ...SETTINGS.product, rules: ["text.vague"] }));
    const rules = new Set(probeFindings(evaluate(only, graph())).map((f) => f.rule));
    expect([...rules]).toEqual(["semantic:text.vague"]);
    const none = loadTemplate({ ...productSpec, rules: [...productSpec.rules!, semanticProbe(SETTINGS.product)] });
    expect(probeFindings(evaluate(none, graph()))).toEqual([]);
  });

  it("policy maps a confident yes per rule: vague warning, contradiction error, unmeasurable pass", async () => {
    const t = loadTemplate(withSemanticProbes(productSpec, SETTINGS.product));
    const r = await evaluateAndJudge(t, graph(), fakeSystemOne());
    const level = (rule: string, subject: string) => r.findings.find((f) => f.rule === `semantic:${rule}` && f.subject === subject)?.level;
    expect(level("text.vague", "p")).toBe("warning");
    expect(level("pair.contradiction", "p|r")).toBe("error");
    expect(level("text.unmeasurable", "o")).toBe("pass");
    expect(level("text.vague", "r")).toBe("pass");
  });

  it("evaluate leaves a pair candidate on its first subject with the second in the text; judge joins them", async () => {
    const t = loadTemplate(withSemanticProbes(productSpec, SETTINGS.product));
    const before = evaluate(t, graph()).findings.find((f) => f.rule === "semantic:pair.contradiction")!;
    expect(before).toMatchObject({ subject: "p", message: "p and r may contradict each other." });
    expect(before.derivation.tuple).toEqual(["pair.contradiction", "p", "r"]);
    const after = (await evaluateAndJudge(t, graph(), fakeSystemOne())).findings.find((f) => f.rule === "semantic:pair.contradiction")!;
    expect(after.subject).toBe("p|r");
  });

  it("buildSlice resolves a pair subject, and a node id containing the separator stays one subject", () => {
    const g = graph();
    const spec = SliceSchema.parse({ fields: ["title"] });
    const s = buildSlice(g, "p|r", spec, { rule: "pair.contradiction", text: "r" });
    expect(s.subject).toEqual({ id: "p", kind: "purpose", parent: "$spec", fields: { title: "P" } });
    expect(s.counterpart).toEqual({ id: "r", kind: "rule", parent: "$spec", fields: { title: "R" } });
    expect(s.parents.map((n) => n.id)).toEqual(["$spec"]);
    expect(buildSlice(g, "p", spec, { rule: "x", text: "" })).not.toHaveProperty("counterpart");
    const odd: Graph = { ...g, nodes: [...g.nodes, { id: "a|b", kind: "rule", fields: {} }] };
    expect(pairOf("a|b", (id) => odd.nodes.some((n) => n.id === id))).toBeUndefined();
    expect(pairOf("x|y|z", (id) => ["x|y", "z"].includes(id))).toEqual(["x|y", "z"]);
    expect(buildSlice(g, "p|nope", spec, { rule: "pair.contradiction", text: "nope" }).counterpart).toEqual({ id: "nope", missing: true });
  });

  it("yes-no catalogue questions send their two choices as the wire criteria", () => {
    for (const q of loadTemplate({ id: "t", version: 1, meta: 1, questions: semanticCatalogue() }).questions) {
      const w = toWire(q);
      expect(w).toMatchObject({ type: "noul", criteria: { true: q.choices![0], false: q.choices![1] } });
    }
  });

  it("an empty option still parses and emits nothing for that rule", () => {
    expect(semanticProbe({ probePairs: [], siblings: [] }).source).toContain('probePair("").');
    expect(PROBE_SOURCE).toContain("semanticCandidate");
    const t = loadTemplate(withSemanticProbes(productSpec, { ...SETTINGS.product, siblings: [] }));
    expect(checkTemplateForm(t).valid).toBe(true);
    expect(probeFindings(evaluate(t, graph())).filter((f) => f.rule === "semantic:pair.contradiction")).toEqual([]);
  });

  it("covers every probe rule", () => expect([...SEMANTIC_RULES].sort()).toEqual([...PROBE_RULES].sort()));
});
