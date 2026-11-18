/// <reference types="node" />
/**
 * Node-only spec linter: `lint <system-dir> [--templates <dir>] [--json]`. Loads an artyfact system, evaluates it under
 * the lint template (genome packs plus `artyfact.flow@1`) and prints the findings. Exit code 1 on any error finding.
 */
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Readiness } from "../../evaluate/evaluate";
import type { Finding } from "../../evaluate/findings";
import { loadArtyfactSystem } from "./graph";
import { readDir } from "./node";
import { lintGraph } from "./review";

const FLOW_PACK = "artyfact.flow@1";
const LEVELS = ["error", "missing", "warning", "review", "info", "pass"] as const;

export interface LintResult { readiness: Readiness; nodes: number; links: number }

/** Lints the system in `systemDir`; templates come from `templatesDir` when given. */
export function lintSystem(systemDir: string, templatesDir?: string): LintResult {
  const tpls = templatesDir ? readDir(templatesDir) : {};
  const graph = loadArtyfactSystem(readDir(systemDir), { templates: tpls });
  return { readiness: lintGraph(graph, tpls), nodes: graph.nodes.length, links: graph.links.length };
}

const fact = (t: readonly unknown[]) => `${t[0]}(${t.slice(1).map((x) => JSON.stringify(x)).join(", ")})`;

/** Human-readable report: a summary line, then findings grouped by level; flow findings carry their supporting facts. */
export function formatLint({ readiness: r, nodes, links }: LintResult): string {
  const c = r.completeness;
  const out = [
    `nodes ${nodes}, links ${links}, buildable ${r.buildable}, actionable ${r.actionable}, completeness ${c.satisfied}/${c.required}`
    + `${r.incomplete ? ", INCOMPLETE (findings are a lower bound)" : ""}`,
  ];
  for (const level of LEVELS) {
    const fs = r.findings.filter((f) => f.level === level);
    if (!fs.length) continue;
    out.push("", `${level} (${fs.length})`);
    for (const f of fs) out.push(...findingLines(f));
  }
  if (!r.findings.length) out.push("", "no findings");
  return out.join("\n");
}

export function findingLines(f: Finding): string[] {
  const lines = [`  ${f.rule}  ${f.subject ?? "-"}  ${f.message}`];
  if (f.pack === FLOW_PACK) for (const t of [...new Set(f.facts.map(fact))]) lines.push(`      ${t}`);
  return lines;
}

/** Without `--templates`: the nearest `packages/templates` above the system directory, as in an artyfact checkout. */
export function guessTemplates(systemDir: string): string | undefined {
  for (let d = resolve(systemDir); ; d = dirname(d)) {
    const p = join(d, "packages", "templates");
    if (existsSync(p)) return p;
    if (dirname(d) === d) return undefined;
  }
}

/** CLI entry; relative paths resolve against the directory `npm run` was started from. */
export function main(argv: string[]): number {
  const args = [...argv];
  const json = args.includes("--json");
  const t = args.indexOf("--templates");
  const templates = t >= 0 ? args[t + 1] : undefined;
  const rest = args.filter((a, i) => a !== "--json" && (t < 0 || (i !== t && i !== t + 1)));
  if (rest.length !== 1 || (t >= 0 && !templates)) {
    process.stderr.write("usage: lint <system-dir> [--templates <dir>] [--json]\n");
    return 2;
  }
  const base = process.env.INIT_CWD ?? process.cwd();
  const systemDir = resolve(base, rest[0]);
  let result: LintResult;
  try {
    result = lintSystem(systemDir, templates ? resolve(base, templates) : guessTemplates(systemDir));
  } catch (e) {
    process.stderr.write(`lint: ${e instanceof Error ? e.message : String(e)}\n`);
    return 2;
  }
  process.stdout.write(`${json ? JSON.stringify(result.readiness, null, 2) : formatLint(result)}\n`);
  return result.readiness.findings.some((f) => f.level === "error") ? 1 : 0;
}
