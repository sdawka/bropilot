import { explain, render, type DerivationTree, type Result, type Tuple } from "../rules";

export type Level = "error" | "missing" | "warning" | "info";
/** Levels a question policy may map an answer to; `pass` is reachable only through judgment. */
export const FINDING_LEVELS = ["error", "missing", "warning", "info", "pass"] as const;

export interface Finding {
  level: Level;
  /** Rule id from the pack; `semantic:<rule>` for semantic candidates. */
  rule: string;
  subject?: string;
  message: string;
  /** EDB facts at the leaves of the derivation, each as `[relation, ...tuple]`. */
  facts: Tuple[];
  derivation: DerivationTree;
  /** `<pack id>@<version>` whose rule derived the finding. */
  pack?: string;
}

const LEVEL_ORDER: Level[] = ["error", "missing", "warning", "info"];
const SEVERITY_LEVEL: Record<string, Level> = { hard: "error", soft: "warning", advisory: "info" };
const DEPTH = 64;

function leaves(t: DerivationTree, out: Tuple[] = []): Tuple[] {
  if (t.edb) out.push([t.relation, ...t.tuple]);
  for (const c of t.children) leaves(c, out);
  return out;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
export const compareFindings = (a: Finding, b: Finding): number =>
  LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level) || cmp(a.rule, b.rule)
  || cmp(a.subject ?? "", b.subject ?? "") || cmp(a.pack ?? "", b.pack ?? "");

/** Folds violation/missing/warning/semanticCandidate rows of one run into findings. */
export function fold(result: Result, packNames: string[]): Finding[] {
  const findings: Finding[] = [];
  const add = (relation: string, level: (t: Tuple) => Level, prefix = "") => {
    for (const t of result.relations.get(relation) ?? []) {
      const rule = String(t[0]);
      const derivation = explain(result, relation, t, DEPTH);
      const origin = derivation.rule?.slice(0, derivation.rule.lastIndexOf(":"));
      findings.push({
        level: level(t),
        rule: prefix + rule,
        ...(t[1] !== undefined && { subject: String(t[1]) }),
        message: result.messages.has(rule) ? render(result.messages, t) : rule,
        facts: leaves(derivation),
        derivation,
        ...(origin && packNames.includes(origin) && { pack: origin }),
      });
    }
  };
  add("violation", (t) => SEVERITY_LEVEL[String(t[2])] ?? "error");
  add("missing", () => "missing");
  add("warning", () => "warning");
  add("semanticCandidate", () => "info", "semantic:");
  return findings.sort(compareFindings);
}
