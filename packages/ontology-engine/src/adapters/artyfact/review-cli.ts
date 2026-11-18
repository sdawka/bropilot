/// <reference types="node" />
/**
 * Node-only change review CLI:
 *   review --head <dir> (--base <dir> | --base-ref <git ref>) [--templates <dir>] [--json] [--print-prompt]
 *          [--mode slice|diff|whole] [--model opus] [--reply findings|experiment]
 * Exit code 1 when the model's verdict is `defect` or head has new error-level lint findings, 2 on usage or load errors.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { parseArgs } from "node:util";
import { claudeModel } from "./claude-model";
import { findingLines, guessTemplates } from "./lint";
import { readDir } from "./node";
import { prepareReview, ReviewParseError, runReview, type PreparedReview, type ReplyFormat, type ReviewMode, type ReviewModel, type ReviewResult } from "./review";

const USAGE = "usage: review --head <dir> (--base <dir> | --base-ref <git ref>) [--templates <dir>] [--json] [--print-prompt] [--mode slice|diff|whole] [--model opus] [--reply findings|experiment]\n";

function run(cmd: string, args: string[], opts: { cwd?: string; input?: Buffer; ok?: number[] } = {}): Buffer {
  const r = spawnSync(cmd, args, { cwd: opts.cwd, input: opts.input, maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw r.error;
  if (!(opts.ok ?? [0]).includes(r.status ?? -1)) throw new Error(`${cmd} ${args.join(" ")}: ${r.stderr.toString().trim() || `exit ${r.status}`}`);
  return r.stdout;
}

/**
 * `git diff --no-index` between two directories, with both directory paths stripped from the header lines so paths read
 * `a/<file>` and `b/<file>`; directory names never reach the model.
 */
export function unifiedDiff(baseDir: string, headDir: string): string {
  const a = realpathSync(baseDir), b = realpathSync(headDir);
  const text = run("git", ["diff", "--no-index", "--no-color", "--no-ext-diff", "--", a, b], { cwd: tmpdir(), ok: [0, 1] }).toString("utf8");
  const strip = (p: string) => p.replace(/^\//, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const prefix = new RegExp(`([ab])/(?:${strip(a)}|${strip(b)})/`, "g");
  return text.split("\n").map((l) => (/^(diff --git |--- |\+\+\+ |rename |copy |Binary files )/.test(l) ? l.replace(prefix, "$1/") : l)).join("\n");
}

/** Extracts `ref`'s copy of `dir` (inside a git work tree) into a fresh temp directory `root`; `dir` is the copy's path there. */
export function materialiseRef(dir: string, ref: string): { dir: string; root: string } {
  const real = realpathSync(dir);
  const top = realpathSync(run("git", ["-C", real, "rev-parse", "--show-toplevel"]).toString("utf8").trim());
  const prefix = relative(top, real);
  const out = mkdtempSync(join(tmpdir(), "review-base-"));
  const tar = run("git", ["-C", top, "archive", "--format=tar", ref, "--", prefix || "."]);
  run("tar", ["-x", "-C", out], { input: tar });
  return { dir: join(out, prefix), root: out };
}

const statsLine = ({ stats: s }: PreparedReview) =>
  `changed ${s.changed}${s.fallback ? " (from diff text)" : ""}, slice ${s.slice} of ${s.total} nodes, prompt ${s.promptChars} chars (~${s.approxTokens} tokens)`;

export function formatReview(r: ReviewResult): string {
  const out = [statsLine(r), ""];
  out.push(r.deterministic.length ? `deterministic, new in head (${r.deterministic.length})` : "deterministic: no new findings");
  for (const f of r.deterministic) out.push(...findingLines({ ...f, rule: `${f.level} ${f.rule}` }));
  out.push("", `model verdict: ${r.verdict}${r.costUsd !== undefined ? `  (cost $${r.costUsd.toFixed(4)})` : ""}`);
  for (const f of r.findings) {
    out.push(`  [${f.severity}] ${f.nodeIds.join(", ") || "-"}  ${f.summary}`);
    if (f.evidence) out.push(`      evidence: ${f.evidence}`);
  }
  if (r.unknownIds.length) out.push("", `cited ids not in either graph: ${r.unknownIds.join(", ")}`);
  return out.join("\n");
}

const jsonOf = (r: PreparedReview & Partial<ReviewResult>) => ({
  stats: r.stats,
  changed: r.changed.reasons,
  slice: Object.fromEntries(r.slice.nodes),
  deterministic: r.deterministic.map(({ level, rule, subject, message, pack }) => ({ level, rule, subject, message, pack })),
  ...(r.verdict && { verdict: r.verdict, findings: r.findings, unknownIds: r.unknownIds, costUsd: r.costUsd }),
});

/** CLI entry; relative paths resolve against the directory `npm run` was started from. `model` is injectable for tests. */
export async function main(argv: string[], model?: ReviewModel): Promise<number> {
  const temp: string[] = [];
  try { return await mainIn(argv, temp, model); } finally { for (const t of temp) rmSync(t, { recursive: true, force: true }); }
}

async function mainIn(argv: string[], temp: string[], model?: ReviewModel): Promise<number> {
  let v: Record<string, string | boolean | undefined>;
  try {
    v = parseArgs({
      args: argv, strict: true, allowPositionals: false,
      options: {
        base: { type: "string" }, "base-ref": { type: "string" }, head: { type: "string" }, templates: { type: "string" },
        json: { type: "boolean" }, "print-prompt": { type: "boolean" }, mode: { type: "string" }, model: { type: "string" }, reply: { type: "string" },
      },
    }).values;
  } catch (e) {
    process.stderr.write(`review: ${(e as Error).message}\n${USAGE}`);
    return 2;
  }
  const mode = (v.mode ?? "slice") as ReviewMode;
  const reply = (v.reply ?? "findings") as ReplyFormat;
  if (typeof v.head !== "string" || (typeof v.base === "string") === (typeof v["base-ref"] === "string")
    || !["slice", "diff", "whole"].includes(mode) || !["findings", "experiment"].includes(reply)) {
    process.stderr.write(USAGE);
    return 2;
  }
  const cwd = process.env.INIT_CWD ?? process.cwd();
  let prep: PreparedReview;
  try {
    const head = resolve(cwd, v.head);
    let base: string;
    if (typeof v.base === "string") base = resolve(cwd, v.base);
    else { const m = materialiseRef(head, v["base-ref"] as string); temp.push(m.root); base = m.dir; }
    const tdir = typeof v.templates === "string" ? resolve(cwd, v.templates) : guessTemplates(head);
    const input = { baseFiles: readDir(base), headFiles: readDir(head), templates: tdir ? readDir(tdir) : {}, diffText: unifiedDiff(base, head), mode, reply };
    if (!input.diffText.trim()) {
      process.stdout.write(v.json ? `${JSON.stringify({ stats: null, verdict: "clean", findings: [] })}\n` : "no differences\n");
      return 0;
    }
    prep = prepareReview(input);
  } catch (e) {
    process.stderr.write(`review: ${e instanceof Error ? e.message : String(e)}\n`);
    return 2;
  }
  if (v["print-prompt"]) {
    process.stdout.write(`${prep.prompt}\n`);
    process.stderr.write(`${statsLine(prep)}\n`);
    return 0;
  }
  let r: ReviewResult;
  try {
    r = await runReview(prep, model ?? claudeModel(typeof v.model === "string" ? v.model : "opus"));
  } catch (e) {
    process.stderr.write(`review: ${e instanceof Error ? e.message : String(e)}\n`);
    if (e instanceof ReviewParseError) process.stderr.write(`reply was:\n${e.text}\n`);
    return 2;
  }
  process.stdout.write(`${v.json ? JSON.stringify(jsonOf(r), null, 2) : formatReview(r)}\n`);
  return r.verdict === "defect" || r.deterministic.some((f) => f.level === "error") ? 1 : 0;
}
