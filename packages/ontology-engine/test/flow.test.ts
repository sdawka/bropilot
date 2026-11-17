import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { ARTYFACT_LINT, artyfactLint, artyfactMetaStore, evaluate, loadTemplate, type Graph, type GraphLink, type GraphNode, type Readiness } from "../src";
import { formatLint, lintSystem, main } from "../src/adapters/artyfact/lint";
import { edit, systemFiles } from "./artyfact-reference";

const lint = loadTemplate(artyfactLint, artyfactMetaStore());
const FLOW = "artyfact.flow@1";
const flowPairs = (r: Readiness) => r.findings.filter((f) => f.pack === FLOW).map((f) => `${f.rule} ${f.subject}`).sort();

const n = (id: string, kind: string, parent?: string, fields: Record<string, unknown> = {}, provisional?: boolean): GraphNode =>
  ({ id, kind, ...(parent && { parent }), fields, ...(provisional && { provisional }) });
const l = (from: string, rel: string, to: string): GraphLink => ({ from, rel, to });
const step = (journey: string, key: string, actor: string, kind = "action") => n(`${journey}/${key}`, "step", journey, { step: key, actor, kind });

/**
 * A screen whose affordance invokes an operation that writes a stored entity the screen shows, all under an owner-only
 * policy, and a journey s1 -> s2 -> s1 (a cycle) that runs the operation from that screen. No flow rule fires.
 */
const base = (): Graph => ({
  template: ARTYFACT_LINT,
  nodes: [
    n("system.x", "system"),
    n("section.ui", "section", "system.x"), n("section.domain", "section", "system.x"),
    n("screen.home", "screen", "section.ui"), n("screen.other", "screen", "section.ui"),
    n("component.list", "component", "screen.home"), n("component.form", "component", "component.list"),
    n("affordance.save", "affordance", "component.form", { actor: "user", effects: ["saves"] }),
    n("operation.save", "operation", "section.domain"), n("operation.audit", "operation", "section.domain"),
    n("entity.Item", "entity", "section.domain"), n("binding.db", "binding", "section.domain"),
    n("binding.old", "binding", "section.domain", {}, true),
    n("policy.owner", "policy", "section.domain", { mode: "owner-only" }),
    n("ext.mail", "external", undefined, { kind: "service" }),
    n("J", "journey", undefined, { start: "s1" }), step("J", "s1", "user"), step("J", "s2", "system", "end"),
  ],
  links: [
    l("affordance.save", "invokes", "operation.save"), l("operation.save", "writes", "entity.Item"),
    l("component.list", "reads", "entity.Item"), l("entity.Item", "storedIn", "binding.db"),
    l("policy.owner", "governs", "screen.home"), l("policy.owner", "governs", "entity.Item"), l("policy.owner", "governs", "operation.save"),
    l("J/s1", "stepScreen", "screen.home"), l("J/s1", "stepOperation", "operation.save"), l("J/s1", "stepNext", "J/s2"), l("J/s2", "stepNext", "J/s1"),
  ],
  declarations: [],
  evidence: [],
});

type Edit = { drop?: GraphLink[]; add?: GraphLink[]; nodes?: GraphNode[]; set?: (g: Graph) => void };
const same = (a: GraphLink, b: GraphLink) => a.from === b.from && a.rel === b.rel && a.to === b.to;
const variant = ({ drop = [], add = [], nodes = [], set }: Edit): Graph => {
  const g = base();
  g.links = [...g.links.filter((x) => !drop.some((d) => same(d, x))), ...add];
  g.nodes = [...g.nodes, ...nodes];
  set?.(g);
  return g;
};
const flowOf = (e: Edit) => flowPairs(evaluate(lint, variant(e)));

const READS = l("component.list", "reads", "entity.Item");
const WRITES = l("operation.save", "writes", "entity.Item");
const STORED = l("entity.Item", "storedIn", "binding.db");
const INVOKES = l("affordance.save", "invokes", "operation.save");
const OP_GOVERNED = l("policy.owner", "governs", "operation.save");
const SCREEN_GOVERNED = l("policy.owner", "governs", "screen.home");

describe("artyfact.flow@1 on hand-built graphs", () => {
  it("the well-formed base, with a cyclic journey, has no flow findings", () => {
    const r = evaluate(lint, base());
    expect(r.incomplete).toBe(false);
    expect(r.packs.map((p) => p.id)).toContain("artyfact.flow");
    expect(flowPairs(r)).toEqual([]);
  });

  it("flow.orphanWrite: written, never read, unless an external receives it", () => {
    expect(flowOf({ drop: [READS] })).toContain("flow.orphanWrite entity.Item");
    expect(flowOf({ drop: [READS], add: [l("entity.Item", "triggers", "ext.mail")] })).toEqual([]);
  });

  it("flow.readNoWriter: read, never written, unless an external supplies it", () => {
    expect(flowOf({ drop: [WRITES] })).toEqual(["flow.readNoWriter entity.Item"]);
    expect(flowOf({ drop: [WRITES], add: [l("ext.mail", "references", "entity.Item")] })).toEqual([]);
  });

  it("flow.unstored: read or written but stored nowhere, or only in a provisional binding", () => {
    expect(flowOf({ drop: [STORED] })).toEqual(["flow.unstored entity.Item"]);
    expect(flowOf({ drop: [STORED], add: [l("entity.Item", "storedIn", "binding.old")] })).toEqual(["flow.unstored entity.Item"]);
    expect(flowOf({ drop: [STORED, READS, WRITES] })).toEqual([]);
  });

  it("flow.effectUnsurfaced: an affordance's operation writes data no screen or component shows", () => {
    const hidden = { drop: [READS], add: [l("operation.audit", "reads", "entity.Item")] };
    expect(flowOf(hidden)).toEqual(["flow.effectUnsurfaced affordance.save"]);
    expect(flowOf({ ...hidden, add: [...hidden.add, l("screen.other", "reads", "entity.Item")] })).toEqual([]);
    expect(flowOf({ ...hidden, add: [...hidden.add, l("entity.Item", "triggers", "ext.mail")] })).toEqual([]);
  });

  it("flow.stepWithoutControl: a person triggers an operation on a screen with no control for it", () => {
    expect(flowOf({ drop: [INVOKES] })).toEqual(["flow.stepWithoutControl J/s1"]);
    expect(flowOf({ drop: [INVOKES], set: (g) => { g.nodes.find((x) => x.id === "J/s1")!.fields.actor = "system"; } })).toEqual([]);
  });

  it("flow.guardBypass: a cyclic journey reaches a UI-governed operation without its screen", () => {
    const k = (key: string) => `K/${key}`;
    const journey = (first: string, firstScreen: string) => ({
      drop: [OP_GOVERNED],
      nodes: [n("K", "journey", undefined, { start: first }), step("K", "t1", "user"), step("K", "t2", "system")],
      add: [l(k("t1"), "stepScreen", firstScreen), l(k("t1"), "stepNext", k("t2")), l(k("t2"), "stepOperation", "operation.save"), l(k("t2"), "stepNext", k("t1"))],
    });
    expect(flowOf(journey("t1", "screen.other"))).toEqual(["flow.guardBypass K/t2"]);
    expect(flowOf(journey("t1", "screen.home"))).toEqual([]);
    expect(flowOf(journey("t2", "screen.home"))).toEqual(["flow.guardBypass K/t2"]);
    expect(flowOf({ ...journey("t1", "screen.other"), drop: [] })).toEqual([]);
  });

  it("flow.guardBypass derivations show the journey path", () => {
    const g = variant({
      drop: [OP_GOVERNED],
      nodes: [n("K", "journey", undefined, { start: "t1" }), step("K", "t1", "user"), step("K", "t2", "system")],
      add: [l("K/t1", "stepScreen", "screen.other"), l("K/t1", "stepNext", "K/t2"), l("K/t2", "stepOperation", "operation.save"), l("K/t2", "stepNext", "K/t1")],
    });
    const f = evaluate(lint, g).findings.find((x) => x.rule === "flow.guardBypass")!;
    expect(f.level).toBe("warning");
    expect(f.facts).toContainEqual(["link", "K/t1", "stepNext", "K/t2", "declared"]);
    expect(f.facts).toContainEqual(["link", "affordance.save", "invokes", "operation.save", "declared"]);
  });

  it("flow.privateShownUnguarded: owner-only data shown on a screen outside that policy", () => {
    expect(flowOf({ drop: [SCREEN_GOVERNED] })).toEqual(["flow.privateShownUnguarded component.list"]);
    expect(flowOf({ drop: [SCREEN_GOVERNED], set: (g) => { g.nodes.find((x) => x.id === "policy.owner")!.fields.mode = "shared"; } })).toEqual([]);
  });
});

const FIXTURE = `${__dirname}/fixtures/artyfact`;
const EXAMPLE = "/Users/sdawka/Code/artyfact-cf/examples/keep-in-touch-system";
const EXAMPLE_TEMPLATES = "/Users/sdawka/Code/artyfact-cf/packages/templates";
const byRule = (r: Readiness) => {
  const out: Record<string, number> = {};
  for (const f of r.findings.filter((x) => x.pack === FLOW)) out[f.rule] = (out[f.rule] ?? 0) + 1;
  return out;
};

describe("spec linter on Keep in Touch", () => {
  it("the in-repo fixture: two affordances write entity.Block, which nothing shows", () => {
    const res = lintSystem(`${FIXTURE}/keep-in-touch-system`, `${FIXTURE}/templates`);
    expect([res.nodes, res.links]).toEqual([302, 467]);
    expect(res.readiness.findings.some((f) => f.rule === "graph.templateMismatch")).toBe(false);
    expect(byRule(res.readiness)).toEqual({ "flow.effectUnsurfaced": 2 });
    expect(flowPairs(res.readiness)).toEqual(["flow.effectUnsurfaced affordance.ConnectionPanel.block", "flow.effectUnsurfaced affordance.ConnectionPanel.disconnect"]);
    const text = formatLint(res);
    expect(text.split("\n")[0]).toBe("nodes 302, links 467, buildable false, actionable false, completeness 226/232");
    expect(text).toContain(`link("operation.connection.revoke", "writes", "entity.Block", "declared")`);
  });

  it.skipIf(!existsSync(EXAMPLE) || !existsSync(EXAMPLE_TEMPLATES))("the artyfact-cf example (outside this repo)", () => {
    const res = lintSystem(EXAMPLE, EXAMPLE_TEMPLATES);
    expect(res.readiness.packs.map((p) => p.id)).toContain("artyfact.flow");
    expect(res.readiness.incomplete).toBe(false);
    expect(byRule(res.readiness)).toEqual({ "flow.effectUnsurfaced": 2 });
  });
});

describe("lint CLI exit codes", () => {
  const run = (args: string[]) => {
    const out = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    const err = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try { return main(args); } finally { out.mockRestore(); err.mockRestore(); }
  };

  it("0 without errors, 1 with an error finding, 2 on bad usage or an unloadable system", () => {
    const templates = `${FIXTURE}/templates`;
    expect(run([`${FIXTURE}/keep-in-touch-system`, "--templates", templates])).toBe(0);
    const dir = mkdtempSync(join(tmpdir(), "lint-"));
    try {
      const files = edit(systemFiles(), "things/webapp/spec.yaml", (d) => { d.requirements[0].subjects.push("screen.ghost"); });
      for (const [p, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), text); }
      expect(run([dir, "--templates", templates, "--json"])).toBe(1);
    } finally { rmSync(dir, { recursive: true, force: true }); }
    expect(run([])).toBe(2);
    expect(run([`${FIXTURE}/keep-in-touch-system`, "--templates", `${FIXTURE}/missing`])).toBe(2);
  });
});
