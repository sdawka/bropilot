import { hashOf } from "../canon";
import { EDB_RELATIONS, edbProgram, FORM_DECLS, TEMPLATE_DECLS } from "../evaluate/edb";
import { templateFacts, type Facts } from "../evaluate/facts";
import { fold, FINDING_LEVELS, type Finding } from "../evaluate/findings";
import { meta } from "../evaluate/packs/meta";
import { factSet, parse, run, stratify, RuleParseError, StratificationError, type Program, type Tuple } from "../rules";
import { resolveLineage, type Template, type TemplateStore } from "./template";

export interface TemplateForm { valid: boolean; findings: Finding[]; hash: string }

export class TemplateFormError extends Error {
  constructor(public templateHash: string, public findings: Finding[]) {
    const first = findings.find((f) => f.level === "error");
    super(`template ${templateHash} is not a valid template: ${first ? `${first.rule} on ${first.subject}` : "evaluation incomplete"}`);
    this.name = "TemplateFormError";
  }
  get rule(): string | undefined { return this.findings.find((f) => f.level === "error")?.rule; }
}

export const packName = (p: { id: string; version: string }): string => `${p.id}@${p.version}`;

function packFacts(t: Template): Record<string, Tuple[]> {
  const out: Record<string, Tuple[]> = { packError: [], packRead: [], packDerives: [] };
  const programs: Program[] = [];
  const fail = (pack: string, e: unknown) => {
    if (e instanceof StratificationError) out.packError.push([pack, "stratify", e.message]);
    else if (e instanceof RuleParseError) out.packError.push([e.file === "edb" ? pack : e.file, "parse", e.message]);
    else throw e;
  };
  for (const p of t.rules) {
    const name = packName(p);
    let prog: Program;
    try { prog = parse(p.source, name); } catch (e) { fail(name, e); continue; }
    programs.push(prog);
    for (const r of prog.rules) {
      out.packDerives.push([r.head.rel]);
      for (const l of r.body) {
        const rel = l.kind === "atom" ? l.rel : l.kind === "count" ? l.atom.rel : undefined;
        if (rel) out.packRead.push([`${name}:${rel}`, name, rel]);
      }
    }
  }
  try { stratify([edbProgram(), ...programs]); } catch (e) { fail(t.ref, e); }
  return out;
}

/** Template set plus the meta-level facts meta@1 reads. */
export function formFacts(t: Template, store?: TemplateStore): Facts {
  const edges = store ? resolveLineage(t.ref, t.extends, store) : { edges: t.edges, ancestors: [] };
  const known = store ? [t.ref, ...edges.ancestors.map((a) => `${a.id}@${a.version}`)] : t.lineage;
  return {
    ...templateFacts(t),
    extends: edges.edges,
    templateKnown: known.map((r) => [r]),
    templateNode: t.nodes.map((n) => [n.id, n.kind]),
    templateNodeLink: t.nodes.flatMap((n) => (n.links ?? []).map((l) => [n.id, l.rel])),
    questionPolicy: t.questions.flatMap((q) => q.policy.map((p) => [q.id, String(p.answer), p.level])),
    questionSliceKind: t.questions.flatMap((q) => (q.slice.kinds ?? []).map((k) => [q.id, k])),
    questionSliceRel: t.questions.flatMap((q) => (q.slice.rels ?? []).map((r) => [q.id, r])),
    findingLevel: FINDING_LEVELS.map((l) => [l]),
    edbRelation: EDB_RELATIONS.map((r) => [r]),
    ...packFacts(t),
  };
}

const metaName = packName(meta);
const metaPrograms = () => [parse(TEMPLATE_DECLS + FORM_DECLS, "form-edb"), parse(meta.source, metaName)];

/** Runs meta@1 over the template. With `store`, `extends` is re-resolved; otherwise the lineage recorded at load is used. */
export function checkTemplateForm(t: Template, store?: TemplateStore): TemplateForm {
  const result = run(factSet(formFacts(t, store)), metaPrograms());
  const findings = fold(result, [metaName]);
  return { valid: !result.incomplete && !findings.some((f) => f.level === "error"), findings, hash: t.hash };
}

const cache = new Map<string, TemplateForm>();
const CACHE_LIMIT = 64;

/** Form check cached by template hash. */
export function cachedForm(t: Template): TemplateForm {
  const key = hashOf([t.hash, metaName, meta.source]);
  let form = cache.get(key);
  if (!form) {
    form = checkTemplateForm(t);
    if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!);
    cache.set(key, form);
  }
  return form;
}
