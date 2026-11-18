/**
 * Change-scoped review of an artyfact system: one model call over the text diff plus a graph slice around the changed
 * nodes, together with the deterministic lint findings that are new in head. The slice rule is the pre-registered rule
 * S of the 2026-11-17 experiment (docs/experiments/2026-11-17-test-set/slice_preregistration.txt); keep it as is.
 */
import { stringify } from "yaml";
import { z } from "zod";
import { diff, diffFindings } from "../../evaluate/diff";
import { evaluate, type Readiness } from "../../evaluate/evaluate";
import type { Finding } from "../../evaluate/findings";
import { linkKey, type Graph, type GraphLink, type GraphNode } from "../../graph/graph";
import { loadTemplate } from "../../meta/template";
import { artyfactMetaStore } from "./convert";
import { loadArtyfactSystem } from "./graph";
import { ARTYFACT_LINT, artyfactLint } from "./template";
import type { Files } from "./templates";

// ---------------------------------------------------------------------------------------------------------------------
// Changed nodes and slice

export interface ChangedNodes {
  ids: string[];
  /** Per changed id, why: `added`, `removed`, `changed: <facets>`, `link added|removed|changed: <from> <rel> <to>`, `mentioned in diff`. */
  reasons: Record<string, string[]>;
  /** True when the graph delta was empty and the ids come from the diff text. */
  fallback: boolean;
}

/** Ids that occur verbatim in `text`, bounded so `a.b` does not match inside `a.b.c` or `xa.b`. */
export function idsInText(text: string, ids: Iterable<string>): string[] {
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  return [...new Set(ids)].filter((id) => new RegExp(`(^|[^A-Za-z0-9_.\\-])${esc(id)}(?![A-Za-z0-9_\\-]|\\.[A-Za-z0-9_])`).test(text)).sort();
}

/**
 * Changed nodes between `base` and `head`: added, removed and changed nodes, plus both endpoints of every added,
 * removed or changed link. When that is empty and `diffText` is given, node ids of either graph that appear in the
 * diff text (hunks and context lines).
 */
export function changedNodes(base: Graph, head: Graph, diffText?: string): ChangedNodes {
  const d = diff(base, head);
  const reasons: Record<string, string[]> = {};
  const add = (id: string, why: string) => { (reasons[id] ??= []).includes(why) || reasons[id].push(why); };
  for (const id of d.nodes.added) add(id, "added");
  for (const id of d.nodes.removed) add(id, "removed");
  for (const c of d.nodes.changed) add(c.id, `changed: ${c.fields.join(", ")}`);
  const links: [string, { from: string; rel: string; to: string }[]][] = [["added", d.links.added], ["removed", d.links.removed], ["changed", d.links.changed]];
  for (const [what, ls] of links) for (const l of ls) for (const id of [l.from, l.to]) add(id, `link ${what}: ${l.from} ${l.rel} ${l.to}`);
  let fallback = false;
  if (!Object.keys(reasons).length && diffText) {
    fallback = true;
    for (const id of idsInText(diffText, [...head.nodes, ...base.nodes].map((n) => n.id))) add(id, "mentioned in diff");
  }
  return { ids: Object.keys(reasons).sort(), reasons, fallback };
}

export type SliceReason = "changed" | "ancestor" | "child" | `hop-${number}`;

export interface ChangeSlice {
  changed: string[];
  /** Slice node id -> the first reason it was included, in the order changed, ancestor, child, hop-1, hop-2, ... */
  nodes: Map<string, SliceReason>;
  /** Base-graph nodes absent from head that the slice renders (marked `removed`). */
  removedNodes: GraphNode[];
  /** Base-graph links absent from head; they are traversed and rendered (marked `removed`). */
  removedLinks: GraphLink[];
}

export interface SliceOptions { hops?: number; noExpand?: readonly string[] }

export const SLICE_HOPS = 2;
export const SLICE_NO_EXPAND = ["system", "thing", "section", "template", "kit"] as const;

/**
 * Rule S: the changed nodes, each one's full ancestor chain, its direct children, and every node within `hops` link
 * hops in either direction over head's links plus the links removed from base. Nodes of a `noExpand` kind (changed
 * ones included) can be reached but are not expanded. Removed nodes are looked up in base.
 */
export function changeSlice(head: Graph, base: Graph, changedIds: Iterable<string>, opts: SliceOptions = {}): ChangeSlice {
  const hops = opts.hops ?? SLICE_HOPS;
  const block = new Set(opts.noExpand ?? SLICE_NO_EXPAND);
  const C = [...new Set(changedIds)].sort();
  const byId = new Map<string, GraphNode>();
  for (const n of head.nodes) if (!byId.has(n.id)) byId.set(n.id, n);
  const headLinks = new Set(head.links.map(linkKey));
  const removedNodes: GraphNode[] = [];
  for (const n of base.nodes) if (!byId.has(n.id)) { byId.set(n.id, n); removedNodes.push(n); }
  const removedLinks = base.links.filter((l) => !headLinks.has(linkKey(l)));
  const links = [...head.links, ...removedLinks];

  const nodes = new Map<string, SliceReason>();
  const put = (id: string, why: SliceReason) => { if (!nodes.has(id)) nodes.set(id, why); };
  for (const c of C) put(c, "changed");
  for (const c of C) {
    const seen = new Set<string>();
    for (let p = byId.get(c)?.parent; p !== undefined && !seen.has(p); p = byId.get(p)?.parent) { seen.add(p); put(p, "ancestor"); }
  }
  const changedSet = new Set(C);
  for (const n of byId.values()) if (n.parent !== undefined && changedSet.has(n.parent)) put(n.id, "child");

  const expandable = (id: string) => { const n = byId.get(id); return !!n && !block.has(n.kind); };
  const reached = new Set(C);
  let frontier = new Set(C.filter(expandable));
  for (let h = 1; h <= hops && frontier.size; h++) {
    const next = new Set<string>();
    for (const l of links) {
      for (const [a, b] of [[l.from, l.to], [l.to, l.from]]) {
        if (frontier.has(a) && !reached.has(b)) { reached.add(b); next.add(b); put(b, `hop-${h}`); }
      }
    }
    frontier = new Set([...next].filter(expandable));
  }
  return { changed: C, nodes, removedNodes, removedLinks };
}

/**
 * The slice as YAML, in the experiment's format: `changed`, then `nodes` sorted by id ({id, kind, parent?, removed?,
 * fields}, full fields; an id with no node is `{id, missing: true}`), then the links among slice nodes (head's in graph
 * order, then removed ones marked `removed`).
 */
export function renderSlice(head: Graph, slice: ChangeSlice): string {
  const byId = new Map<string, GraphNode & { removed?: boolean }>();
  for (const n of head.nodes) if (!byId.has(n.id)) byId.set(n.id, n);
  for (const n of slice.removedNodes) if (!byId.has(n.id)) byId.set(n.id, { ...n, removed: true });
  const S = slice.nodes;
  const nodes = [...S.keys()].sort().map((id) => {
    const n = byId.get(id);
    return n ? { id, kind: n.kind, ...(n.parent !== undefined && { parent: n.parent }), ...(n.removed && { removed: true }), fields: n.fields } : { id, missing: true };
  });
  const links = [...head.links.map((l) => ({ l, removed: false })), ...slice.removedLinks.map((l) => ({ l, removed: true }))]
    .filter(({ l }) => S.has(l.from) && S.has(l.to))
    .map(({ l, removed }) => ({ from: l.from, rel: l.rel, to: l.to, ...(removed && { removed: true }) }));
  return stringify({ changed: slice.changed, nodes, links }, { lineWidth: 0 });
}

// ---------------------------------------------------------------------------------------------------------------------
// Prompt

export type ReviewMode = "slice" | "diff" | "whole";
/** `findings` asks for the structured findings below; `experiment` is the 2026-11-17 reply format verbatim. */
export type ReplyFormat = "findings" | "experiment";

const CONTEXT: Record<ReviewMode, string> = {
  diff: "",
  slice: " After the diff, the part of the specification around the changed elements is given as a graph slice (the changed nodes, their ancestors and children, and nodes within two links, with the links among them), rendered after the change.",
  whole: " After the diff, the entire specification after the change is given.",
};

const REPLY: Record<ReplyFormat, string> = {
  experiment: ` Reply with only JSON: {"verdict": "problem" | "ok", "problems": [{"node": id, "problem": one sentence}]} with at most 3 problems.`,
  findings: ` Reply with only JSON: {"verdict": "defect" | "clean", "findings": [{"nodeIds": [ids], "severity": "high" | "medium" | "low", "summary": one sentence, "evidence": the spec or diff text that shows it}]} with at most 3 findings.`,
};

/** Every file as `=== path ===` + text, paths sorted, as the experiment's whole-spec arm. */
export function renderSpec(files: Files): string {
  return Object.keys(files).sort().flatMap((p) => [`=== ${p} ===`, files[p].replace(/\n+$/, ""), ""]).join("\n");
}

export interface PromptInput { diffText: string; mode?: ReviewMode; sliceText?: string; specText?: string; reply?: ReplyFormat }

/** The review prompt; the instruction wording is the experiment's, only the reply format is selectable. */
export function buildReviewPrompt({ diffText, mode = "slice", sliceText, specText, reply = "findings" }: PromptInput): string {
  const instr = "A change was made to the specification of a software product. The change is shown as a diff." + CONTEXT[mode]
    + " Decide whether this change introduces a problem: an inconsistency with another part of the spec, a contradiction, a broken or missing reference, a missing piece, or something individually wrong. Only report problems caused by this change, not pre-existing ones."
    + REPLY[reply];
  const p = [instr, "", "=== DIFF ===", diffText.replace(/\n+$/, ""), ""];
  if (mode === "slice") p.push("=== GRAPH SLICE (YAML) ===", (sliceText ?? "").replace(/\n+$/, ""), "");
  if (mode === "whole") p.push("=== SPECIFICATION AFTER THE CHANGE ===", specText ?? "");
  return p.join("\n");
}

// ---------------------------------------------------------------------------------------------------------------------
// Parsing

export const REVIEW_SEVERITIES = ["high", "medium", "low"] as const;
export type Severity = (typeof REVIEW_SEVERITIES)[number];

const ReviewFindingSchema = z.object({
  nodeIds: z.array(z.string()).default([]),
  severity: z.enum(REVIEW_SEVERITIES).catch("medium"),
  summary: z.string(),
  evidence: z.string().default(""),
});
const ReviewSchema = z.object({ verdict: z.enum(["defect", "clean"]), findings: z.array(ReviewFindingSchema).default([]) });

export type ReviewFinding = z.infer<typeof ReviewFindingSchema>;
export interface ParsedReview {
  verdict: "defect" | "clean";
  findings: ReviewFinding[];
  /** Cited node ids that are in neither graph. */
  unknownIds: string[];
}

export class ReviewParseError extends Error {
  constructor(message: string, readonly text: string) { super(message); }
}

/** Accepts the experiment's reply shape too: verdict problem/ok, problems [{node, problem}]. */
function normalise(raw: any): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const verdict = raw.verdict === "problem" ? "defect" : raw.verdict === "ok" ? "clean" : raw.verdict;
  const items = raw.findings ?? raw.problems ?? [];
  const findings = Array.isArray(items) ? items.map((f: any) => (f && typeof f === "object" ? {
    ...f,
    nodeIds: Array.isArray(f.nodeIds) ? f.nodeIds : typeof f.nodeIds === "string" ? [f.nodeIds] : f.node !== undefined ? [String(f.node)] : [],
    summary: f.summary ?? f.problem ?? "",
    severity: typeof f.severity === "string" ? f.severity.toLowerCase() : f.severity,
  } : f)) : items;
  return { verdict, findings };
}

/**
 * Parses the model's reply: the first `{` to the last `}` (so fenced or chatty JSON works), validated. Node ids not
 * in `knownIds` are listed in `unknownIds`. Throws `ReviewParseError` when no valid JSON reply is found.
 */
export function parseReview(text: string, knownIds?: Iterable<string>): ParsedReview {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) throw new ReviewParseError("no JSON object in reply", text);
  let raw: unknown;
  try { raw = JSON.parse(m[0]); } catch (e) { throw new ReviewParseError(`invalid JSON: ${(e as Error).message}`, text); }
  const r = ReviewSchema.safeParse(normalise(raw));
  if (!r.success) throw new ReviewParseError(`unexpected reply shape: ${r.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`, text);
  const known = knownIds ? new Set(knownIds) : undefined;
  const unknownIds = known ? [...new Set(r.data.findings.flatMap((f) => f.nodeIds))].filter((id) => !known.has(id)).sort() : [];
  return { ...r.data, unknownIds };
}

// ---------------------------------------------------------------------------------------------------------------------
// Review

/** Evaluates `graph` under the lint template (genome packs plus `artyfact.flow@1`). */
export function lintGraph(graph: Graph, templates: Files = {}): Readiness {
  const template = loadTemplate(artyfactLint, artyfactMetaStore(templates));
  // The loader names the genome; the lint template extends it with one pack, so the graph is re-pointed at it.
  return evaluate(template, { ...graph, template: ARTYFACT_LINT });
}

export type ReviewModel = (prompt: string) => Promise<{ text: string; costUsd?: number }>;

export interface ReviewInput {
  baseFiles: Files;
  headFiles: Files;
  templates?: Files;
  /** Unified diff between base and head with `a/` and `b/` path prefixes. */
  diffText: string;
  model: ReviewModel;
  mode?: ReviewMode;
  reply?: ReplyFormat;
  slice?: SliceOptions;
}

export interface ReviewStats { changed: number; slice: number; total: number; fallback: boolean; promptChars: number; approxTokens: number }

export interface PreparedReview {
  base: Graph;
  head: Graph;
  changed: ChangedNodes;
  slice: ChangeSlice;
  prompt: string;
  stats: ReviewStats;
  /** Deterministic lint findings in head that are not in base. */
  deterministic: Finding[];
}

export interface ReviewResult extends PreparedReview, ParsedReview { costUsd?: number; text: string }

/** Loads both systems, computes the slice, builds the prompt and the new deterministic findings; no model call. */
export function prepareReview({ baseFiles, headFiles, templates = {}, diffText, mode = "slice", reply, slice: sliceOpts }: Omit<ReviewInput, "model">): PreparedReview {
  const base = loadArtyfactSystem(baseFiles, { templates });
  const head = loadArtyfactSystem(headFiles, { templates });
  const changed = changedNodes(base, head, diffText);
  const slice = changeSlice(head, base, changed.ids, sliceOpts);
  const prompt = buildReviewPrompt({
    diffText, mode, reply,
    ...(mode === "slice" && { sliceText: renderSlice(head, slice) }),
    ...(mode === "whole" && { specText: renderSpec(headFiles) }),
  });
  const deterministic = diffFindings(lintGraph(base, templates), lintGraph(head, templates)).appeared;
  const total = new Set(head.nodes.map((n) => n.id)).size;
  return {
    base, head, changed, slice, prompt, deterministic,
    stats: { changed: changed.ids.length, slice: slice.nodes.size, total, fallback: changed.fallback, promptChars: prompt.length, approxTokens: Math.round(prompt.length / 4) },
  };
}

/** Prepares the review, makes one model call and parses the reply against the node ids of both graphs. */
export const reviewChange = (input: ReviewInput): Promise<ReviewResult> => runReview(prepareReview(input), input.model);

/** The model call and parse for an already prepared review. */
export async function runReview(prep: PreparedReview, model: ReviewModel): Promise<ReviewResult> {
  const { text, costUsd } = await model(prep.prompt);
  const parsed = parseReview(text, [...prep.head.nodes, ...prep.base.nodes].map((n) => n.id));
  const findings = [...parsed.findings].sort((a, b) => REVIEW_SEVERITIES.indexOf(a.severity) - REVIEW_SEVERITIES.indexOf(b.severity));
  return { ...prep, ...parsed, findings, text, ...(costUsd !== undefined && { costUsd }) };
}
