import { describe, expect, it } from "vitest";
import { checkTemplateForm, evaluate, loadTemplate, memoryStore, TemplateFormError } from "../src";
import { base, board, clean, edbLeaves } from "./fixture";

type Raw = ReturnType<typeof board> & Record<string, unknown>;
const store = memoryStore([base()]);
const form = (raw: unknown, s = store) => checkTemplateForm(loadTemplate(raw, s), s);
const edit = (f: (t: Raw) => void) => { const t = board() as Raw; f(t); return t; };

describe("template form", () => {
  it("accepts the fixture", () => {
    const r = form(board());
    expect(r.findings).toEqual([]);
    expect(r.valid).toBe(true);
    expect(r.hash).toBe(loadTemplate(board(), store).hash);
  });

  const cases: [rule: string, subject: string, raw: () => unknown, s?: ReturnType<typeof memoryStore>][] = [
    ["relation.endpointUnknown", "blocks", () => edit((t) => { t.relations.blocks.to = ["ticket"]; })],
    ["relation.inverseUnknown", "blocks", () => edit((t) => { Object.assign(t.relations.blocks, { inverse: "blockedBy" }); })],
    ["kind.parentUnknown", "card", () => edit((t) => { t.kinds.card.parents = ["lane"]; })],
    ["kind.fieldUnknown", "board", () => edit((t) => { Object.assign(t.kinds.board.completeness, { fields: ["deadline"] }); })],
    ["kind.childUnknown", "board", () => edit((t) => { t.kinds.board.completeness.children.push({ kind: "lane", cardinality: "0..*" }); })],
    ["kind.childUnsatisfiable", "card", () => edit((t) => { Object.assign(t.kinds.card.completeness, { children: [{ kind: "card", cardinality: "1" }] }); })],
    ["kind.relationUnknown", "card", () => edit((t) => { t.kinds.card.completeness.relations.push({ rel: "owns", cardinality: "0..1" }); })],
    ["kind.relationUnsatisfiable", "board", () => edit((t) => { Object.assign(t.kinds.board.completeness, { relations: [{ rel: "blocks", cardinality: "1" }] }); })],
    ["constraint.relationUnknown", "no-blocking-loop", () => edit((t) => { t.constraints.forbiddenCycles[0].relations = ["follows"]; })],
    ["constraint.kindUnknown", "boards-complete", () => edit((t) => { t.constraints.complete[0].kind = "lane"; })],
    ["constraint.fieldUnknown", "archived-open", () => edit((t) => { t.constraints.incompatible[0].when[0].field = "deleted"; })],
    ["template.extendsUnknown", "template.test.board@1", () => edit((t) => { t.extends = "template.test.missing@1"; })],
    ["template.extendsCycle", "template.test.base@1", () => board(),
      memoryStore([{ ...base(), extends: "template.test.board@1" }, board()])],
    ["rules.parse", "board@1", () => edit((t) => { t.rules[0].source += "\nwarning(\"x\",C) :- nowhere(C)."; })],
    ["rules.stratify", "board@1", () => edit((t) => { t.rules[0].source += "\n.decl p(X: sym)\np(X) :- node(X,_,_), not p(X)."; })],
    ["rules.unknownRelation", "board@1:violation", () => edit((t) => {
      t.rules[0].source += "\n.decl violation(Rule: sym, Subject: sym, Severity: sym)\nwarning(\"x\",S) :- violation(_,S,_).";
    })],
    ["criterion.subjectKindUnknown", "crit.card-titled", () => edit((t) => { t.criteria[0].subject = "ticket"; })],
    ["question.levelUnknown", "card.vague", () => edit((t) => { t.questions[0].policy[0].level = "fatal"; })],
    ["question.sliceKindUnknown", "card.vague", () => edit((t) => { Object.assign(t.questions[0].slice, { kinds: ["lane"] }); })],
    ["question.sliceRelationUnknown", "card.vague", () => edit((t) => { Object.assign(t.questions[0].slice, { rels: ["follows"] }); })],
    ["node.kindUnknown", "$self.inbox", () => edit((t) => { t.nodes[0].kind = "ticket"; })],
    ["node.relationUnknown", "$self.inbox", () => edit((t) => { Object.assign(t.nodes[0], { links: [{ rel: "mentions", to: "$self" }] }); })],
  ];

  for (const [rule, subject, raw, s] of cases) {
    it(`flags ${rule}`, () => {
      const r = form(raw(), s);
      expect(r.valid).toBe(false);
      const hits = r.findings.filter((f) => f.rule === rule);
      expect(hits.map((f) => f.subject)).toContain(subject);
      for (const f of r.findings) {
        expect(f.pack).toBe("meta@1");
        expect(edbLeaves(f.derivation)).toBe(true);
      }
    });
  }
});

describe("evaluate refuses an invalid template", () => {
  it("throws TemplateFormError naming the rule and template hash", () => {
    const t = loadTemplate(edit((x) => { x.criteria[0].subject = "ticket"; }), store);
    let err: unknown;
    try { evaluate(t, clean()); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(TemplateFormError);
    const e = err as TemplateFormError;
    expect(e.rule).toBe("criterion.subjectKindUnknown");
    expect(e.templateHash).toBe(t.hash);
    expect(e.message).toContain("criterion.subjectKindUnknown");
    expect(e.message).toContain(t.hash);
  });
});
