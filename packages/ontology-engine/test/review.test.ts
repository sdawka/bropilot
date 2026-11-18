import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  buildReviewPrompt, changedNodes, changeSlice, parseReview, renderSlice, reviewChange, ReviewParseError, type Graph, type GraphLink, type GraphNode,
} from "../src";
import { main, unifiedDiff } from "../src/adapters/artyfact/review-cli";
import { edit, systemFiles, templateFiles } from "./artyfact-reference";

const n = (id: string, kind: string, parent?: string, fields: Record<string, unknown> = {}): GraphNode => ({ id, kind, ...(parent && { parent }), fields });
const l = (from: string, rel: string, to: string): GraphLink => ({ from, rel, to });
const g = (nodes: GraphNode[], links: GraphLink[] = []): Graph => ({ template: "t", nodes, links, declarations: [], evidence: [] });

/**
 * system > section > screen > component > affordance; affordance -> op -> entity -> binding (a chain of links), and a
 * kit linked to the op and to another entity. Plus an unrelated op.
 */
const base = (): Graph => g([
  n("sys", "system"), n("sec", "section", "sys"), n("screen", "screen", "sec"), n("comp", "component", "screen"),
  n("aff", "affordance", "comp", { effects: ["saves"] }), n("comp.child", "component", "comp"),
  n("op", "operation", "sec"), n("ent", "entity", "sec"), n("bind", "binding", "sec"), n("far", "entity", "sec"),
  n("kit.k", "kit"), n("ent2", "entity", "sec"), n("other", "operation", "sec"),
], [l("aff", "invokes", "op"), l("op", "writes", "ent"), l("ent", "storedIn", "bind"), l("bind", "next", "far"), l("kit.k", "governs", "op"), l("kit.k", "governs", "ent2")]);

const reasons = (s: ReturnType<typeof changeSlice>) => Object.fromEntries([...s.nodes].sort());

describe("changedNodes", () => {
  it("field changes, additions and removals", () => {
    const b = base();
    const h = g([...b.nodes.filter((x) => x.id !== "other").map((x) => (x.id === "aff" ? { ...x, fields: { effects: [] } } : x)), n("new", "entity", "sec")], b.links);
    const c = changedNodes(b, h);
    expect(c.ids).toEqual(["aff", "new", "other"]);
    expect(c.reasons).toEqual({ aff: ["changed: fields.effects"], new: ["added"], other: ["removed"] });
    expect(c.fallback).toBe(false);
  });

  it("a link-only change counts both endpoints", () => {
    const b = base();
    const h = g(b.nodes, [...b.links.filter((x) => x.rel !== "storedIn"), l("aff", "invokes", "other")]);
    const c = changedNodes(b, h);
    expect(c.ids).toEqual(["aff", "bind", "ent", "other"]);
    expect(c.reasons.ent).toEqual(["link removed: ent storedIn bind"]);
    expect(c.reasons.aff).toEqual(["link added: aff invokes other"]);
  });

  it("falls back to ids mentioned in the diff text when the graph delta is empty", () => {
    const b = base();
    const c = changedNodes(b, b, " - { id: op }\n+  comment about ent2 and kit.kx and xop\n");
    expect(c).toEqual({ ids: ["ent2", "op"], reasons: { ent2: ["mentioned in diff"], op: ["mentioned in diff"] }, fallback: true });
    expect(changedNodes(b, b, "").ids).toEqual([]);
  });
});

describe("changeSlice", () => {
  it("ancestors, children and two hops in either direction", () => {
    const b = base();
    const s = changeSlice(b, b, ["aff"]);
    expect(reasons(s)).toEqual({
      aff: "changed", comp: "ancestor", screen: "ancestor", sec: "ancestor", sys: "ancestor",
      op: "hop-1", ent: "hop-2", "kit.k": "hop-2",
    });
    // bind is 3 hops away; comp.child is a sibling, not a child; ent2 would need expansion through kit.k.
  });

  it("direct children of a changed node", () => {
    const b = base();
    expect(reasons(changeSlice(b, b, ["comp"]))).toEqual({ comp: "changed", "comp.child": "child", aff: "child", screen: "ancestor", sec: "ancestor", sys: "ancestor" });
  });

  it("reaches but does not expand nodes of the no-expand kinds, including changed ones", () => {
    const b = base();
    expect(reasons(changeSlice(b, b, ["kit.k"]))).toEqual({ "kit.k": "changed" });
    expect(Object.keys(reasons(changeSlice(b, b, ["kit.k"], { noExpand: [] }))).sort()).toEqual(["aff", "ent", "ent2", "kit.k", "op"]);
    expect(reasons(changeSlice(b, b, ["ent"], { hops: 1 }))).toMatchObject({ op: "hop-1", bind: "hop-1" });
    expect(reasons(changeSlice(b, b, ["ent"], { hops: 1 })).far).toBeUndefined();
  });

  it("a removed node is found in base and expands over its removed links", () => {
    const b = base();
    const h = g(b.nodes.filter((x) => x.id !== "op"), b.links.filter((x) => x.from !== "op" && x.to !== "op"));
    const c = changedNodes(b, h);
    expect(c.ids).toEqual(["aff", "ent", "kit.k", "op"]);
    const s = changeSlice(h, b, c.ids);
    expect(s.nodes.get("sec")).toBe("ancestor");
    expect(s.nodes.get("bind")).toBe("hop-1");
    expect(s.removedNodes.map((x) => x.id)).toEqual(["op"]);
    const y = renderSlice(h, s);
    expect(y).toContain("- id: op\n    kind: operation\n    parent: sec\n    removed: true");
    expect(y).toContain("- from: aff\n    rel: invokes\n    to: op\n    removed: true");
  });

  it("renders deterministically in the experiment format", () => {
    const b = base();
    const y = renderSlice(b, changeSlice(b, b, ["ent"], { hops: 1 }));
    expect(y.startsWith("changed:\n  - ent\nnodes:\n  - id: bind\n    kind: binding\n    parent: sec\n    fields: {}\n")).toBe(true);
    expect(y).toMatch(/links:\n  - from: op\n    rel: writes\n    to: ent\n  - from: ent\n    rel: storedIn\n    to: bind\n$/);
    expect(renderSlice(b, changeSlice(b, b, ["ent"], { hops: 1 }))).toBe(y);
  });
});

describe("buildReviewPrompt", () => {
  it("diff, slice and whole arms", () => {
    const s = buildReviewPrompt({ diffText: "DIFF\n", sliceText: "SLICE\n" });
    expect(s).toContain("given as a graph slice");
    expect(s).toMatch(/=== DIFF ===\nDIFF\n\n=== GRAPH SLICE \(YAML\) ===\nSLICE\n$/);
    expect(s).toContain(`"verdict": "defect" | "clean"`);
    const d = buildReviewPrompt({ diffText: "DIFF", mode: "diff", reply: "experiment" });
    expect(d).toMatch(/shown as a diff\. Decide/);
    expect(d).toContain(`"verdict": "problem" | "ok"`);
    expect(d).not.toContain("GRAPH SLICE");
    expect(buildReviewPrompt({ diffText: "DIFF", mode: "whole", specText: "SPEC" })).toMatch(/=== SPECIFICATION AFTER THE CHANGE ===\nSPEC$/);
  });
});

describe("parseReview", () => {
  it("fenced JSON with prose, severity defaults and unknown ids", () => {
    const text = "Here you go:\n```json\n" + JSON.stringify({
      verdict: "defect",
      findings: [{ nodeIds: ["op", "ghost"], severity: "HIGH", summary: "broken", evidence: "- x" }, { nodeIds: ["ent"], severity: "urgent", summary: "odd" }],
    }) + "\n```\n";
    const r = parseReview(text, ["op", "ent"]);
    expect(r.verdict).toBe("defect");
    expect(r.findings).toEqual([
      { nodeIds: ["op", "ghost"], severity: "high", summary: "broken", evidence: "- x" },
      { nodeIds: ["ent"], severity: "medium", summary: "odd", evidence: "" },
    ]);
    expect(r.unknownIds).toEqual(["ghost"]);
  });

  it("the experiment's reply shape", () => {
    expect(parseReview(`{"verdict": "ok", "problems": []}`)).toEqual({ verdict: "clean", findings: [], unknownIds: [] });
    expect(parseReview(`{"verdict": "problem", "problems": [{"node": "op", "problem": "p"}]}`).findings).toEqual([{ nodeIds: ["op"], severity: "medium", summary: "p", evidence: "" }]);
  });

  it("rejects replies without a valid verdict", () => {
    expect(() => parseReview("no json here")).toThrow(ReviewParseError);
    expect(() => parseReview(`{"verdict": "maybe"}`)).toThrow(/verdict/);
    expect(() => parseReview(`{"verdict": "clean",}`)).toThrow(/invalid JSON/);
  });
});

describe("reviewChange", () => {
  const tpls = templateFiles();
  const clean = systemFiles();

  it("one model call over diff + slice, findings ordered by severity, new deterministic findings only", async () => {
    const head = edit(clean, "system.yaml", (d) => ({ ...d, name: "" }));
    const prompts: string[] = [];
    const model = vi.fn(async (p: string) => {
      prompts.push(p);
      return { text: JSON.stringify({ verdict: "defect", findings: [{ nodeIds: ["x.y"], severity: "low", summary: "l" }, { nodeIds: [], severity: "high", summary: "h" }] }), costUsd: 0.5 };
    });
    const r = await reviewChange({ baseFiles: clean, headFiles: head, templates: tpls, diffText: "--- a/system.yaml\n+++ b/system.yaml\n", model });
    expect(model).toHaveBeenCalledTimes(1);
    expect(prompts[0]).toContain("=== GRAPH SLICE (YAML) ===");
    expect(r.stats.changed).toBeGreaterThan(0);
    expect(r.stats.slice).toBeLessThan(r.stats.total);
    expect(r.verdict).toBe("defect");
    expect(r.findings.map((f) => f.severity)).toEqual(["high", "low"]);
    expect(r.unknownIds).toEqual(["x.y"]);
    expect(r.costUsd).toBe(0.5);
    // Same system on both sides: no new deterministic findings even if the system has some.
    const same = await reviewChange({ baseFiles: clean, headFiles: clean, templates: tpls, diffText: "", model: async () => ({ text: `{"verdict":"clean"}` }) });
    expect(same.deterministic).toEqual([]);
    expect(same.stats.changed).toBe(0);
  });

  it("includes deterministic lint findings that are new in head", async () => {
    const path = "things/webapp/ontology.yaml";
    const text = clean[path].replace("            actor: ext.owner\n            trigger: Signed-in invitee activates Decline\n", "");
    expect(text).not.toBe(clean[path]);
    const r = await reviewChange({ baseFiles: clean, headFiles: { ...clean, [path]: text }, templates: tpls, diffText: "x", model: async () => ({ text: `{"verdict":"clean"}` }) });
    expect(r.deterministic.map((f) => `${f.level} ${f.rule} ${f.subject}`)).toEqual(["missing affordance.incomplete affordance.ConsentPanel.decline"]);
    expect(r.changed.ids).toEqual(["affordance.ConsentPanel.decline"]);
  });
});

describe("CLI", () => {
  const dir = mkdtempSync(join(tmpdir(), "review-test-"));
  const write = (root: string, files: Record<string, string>) => {
    for (const [p, t] of Object.entries(files)) { mkdirSync(join(root, p, ".."), { recursive: true }); writeFileSync(join(root, p), t); }
  };
  const tdir = join(dir, "templates"), a = join(dir, "base-name"), b = join(dir, "head-name");
  write(tdir, templateFiles());
  write(a, systemFiles());
  write(b, edit(systemFiles(), "system.yaml", (d) => ({ ...d, name: `${d.name} renamed` })));

  const run = async (args: string[], reply = `{"verdict":"clean","findings":[]}`) => {
    let out = "";
    const o = vi.spyOn(process.stdout, "write").mockImplementation((s) => { out += String(s); return true; });
    const e = vi.spyOn(process.stderr, "write").mockImplementation((s) => { out += String(s); return true; });
    try { return { code: await main(args, async () => ({ text: reply })), out }; } finally { o.mockRestore(); e.mockRestore(); }
  };

  it("diff headers carry a/ and b/ only", () => {
    const d = unifiedDiff(a, b);
    expect(d).toContain("--- a/system.yaml\n+++ b/system.yaml\n");
    expect(d).not.toMatch(/base-name|head-name/);
  });

  it("print-prompt, verdict exit codes, usage errors", async () => {
    const p = await run(["--base", a, "--head", b, "--templates", tdir, "--print-prompt"]);
    expect(p.code).toBe(0);
    expect(p.out).toContain("=== GRAPH SLICE (YAML) ===");
    expect(p.out).toMatch(/changed \d+, slice \d+ of \d+ nodes/);
    expect(p.out).not.toMatch(/base-name|head-name/);
    expect((await run(["--base", a, "--head", b, "--templates", tdir])).code).toBe(0);
    const bad = await run(["--base", a, "--head", b, "--templates", tdir, "--json"], `{"verdict":"defect","findings":[{"nodeIds":["system"],"severity":"high","summary":"s"}]}`);
    expect(bad.code).toBe(1);
    expect(JSON.parse(bad.out).verdict).toBe("defect");
    expect((await run(["--head", b])).code).toBe(2);
    expect((await run(["--base", a, "--base-ref", "HEAD", "--head", b])).code).toBe(2);
    expect((await run(["--base", join(dir, "missing"), "--head", b, "--templates", tdir])).code).toBe(2);
    expect((await run(["--base", a, "--head", b, "--mode", "nope"])).code).toBe(2);
  });

  it("cleans up", () => { rmSync(dir, { recursive: true, force: true }); });
});
