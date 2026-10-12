import { hashOf } from "../canon";
import { TemplateSourceSchema, type TemplateNode, type TemplateSource } from "./schema";

export interface TemplateStore { get(ref: string): unknown }

export interface Template extends Omit<TemplateSource, "extends"> {
  ref: string;
  extends?: string;
  /** Refs that resolved, self first. */
  lineage: string[];
  /** Every `extends` edge walked, including unresolved targets and the edge that closes a cycle. */
  edges: [string, string][];
  hash: string;
}

export const refOf = (s: { id: string; version: number }): string => `${s.id}@${s.version}`;

export function memoryStore(sources: unknown[]): TemplateStore {
  const byRef = new Map(sources.map((s) => { const t = TemplateSourceSchema.parse(s); return [refOf(t), t] as const; }));
  return { get: (ref) => byRef.get(ref) };
}

export const emptyStore: TemplateStore = { get: () => undefined };

/** Follows `extends` from `ref` through `store`; stops at an unresolved target or the edge that closes a cycle. */
export function resolveLineage(ref: string, parent: string | undefined, store: TemplateStore) {
  const ancestors: TemplateSource[] = [];
  const edges: [string, string][] = [];
  const seen = new Set([ref]);
  for (let from = ref, to = parent; to !== undefined;) {
    edges.push([from, to]);
    if (seen.has(to)) break;
    const raw = store.get(to);
    if (raw === undefined) break;
    const next = TemplateSourceSchema.parse(raw);
    if (refOf(next) !== to) throw new Error(`store returned ${refOf(next)} for ${to}`);
    seen.add(to);
    ancestors.push(next);
    from = to;
    to = next.extends;
  }
  return { ancestors, edges };
}

const mergeById = <T extends { id: string }>(lists: T[][]): T[] => {
  const out = new Map<string, T>();
  for (const l of lists) for (const x of l) { out.delete(x.id); out.set(x.id, x); }
  return [...out.values()];
};

/** The nearest `textDefaults` in the chain wins wholesale; absent everywhere, the key is left out so hashes are unchanged. */
const textDefaultsOf = (chain: TemplateSource[]) => {
  const t = chain.find((s) => s.textDefaults !== undefined)?.textDefaults;
  return t === undefined ? {} : { textDefaults: t };
};

function merge(chain: TemplateSource[]): Omit<TemplateSource, "id" | "version" | "meta" | "extends"> {
  const top = [...chain].reverse();
  const c = top.map((s) => s.constraints);
  return {
    kinds: Object.assign({}, ...top.map((s) => s.kinds)),
    relations: Object.assign({}, ...top.map((s) => s.relations)),
    constraints: {
      forbiddenCycles: mergeById(c.map((x) => x.forbiddenCycles)),
      incompatible: mergeById(c.map((x) => x.incompatible)),
      exclusive: mergeById(c.map((x) => x.exclusive)),
      exactlyOne: mergeById(c.map((x) => x.exactlyOne)),
      complete: mergeById(c.map((x) => x.complete)),
    },
    criteria: mergeById(top.map((s) => s.criteria)),
    rules: mergeById(top.map((s) => s.rules)),
    questions: mergeById(top.map((s) => s.questions)),
    nodes: mergeById(top.map((s) => s.nodes)),
    ...textDefaultsOf(chain),
  };
}

/** Parses a template against meta@1 and resolves `extends` through `store`; child declarations win by key or id. */
export function loadTemplate(raw: unknown, store: TemplateStore = emptyStore): Template {
  const self = TemplateSourceSchema.parse(raw);
  const { ancestors, edges } = resolveLineage(refOf(self), self.extends, store);
  const chain = [self, ...ancestors];
  const body = {
    ref: refOf(self), id: self.id, version: self.version, meta: self.meta,
    ...(self.extends !== undefined && { extends: self.extends }),
    lineage: chain.map(refOf), edges, ...merge(chain),
  };
  return { ...body, hash: hashOf(body) };
}

export const templateHash = (t: Omit<Template, "hash"> & { hash?: string }): string => hashOf({ ...t, hash: undefined });

const SELF = /\$self/g;
const subst = (v: unknown, self: string): unknown =>
  typeof v === "string" ? v.replace(SELF, self)
    : Array.isArray(v) ? v.map((x) => subst(x, self))
    : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, subst(x, self)]))
    : v;

/** The template's prefilled nodes with `$self` replaced by `self`. */
export const instantiateNodes = (t: Template, self: string): TemplateNode[] => t.nodes.map((n) => subst(n, self) as TemplateNode);
