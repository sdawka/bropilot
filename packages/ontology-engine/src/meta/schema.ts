import { z } from "zod";
import { isCardinality } from "./cardinality";

const name = z.string().min(1);
const card = z.string().refine(isCardinality, { message: "expected cardinality N, N..M or N..*" });
const scalar = z.union([z.string(), z.number(), z.boolean()]);

export const FIELD_TYPES = ["string", "number", "boolean", "ref", "refs", "list", "object"] as const;
export const SEVERITIES = ["hard", "soft", "advisory"] as const;
export const ANSWER_TYPES = ["yes-no", "choice", "score"] as const;

/**
 * Deterministic text-quality constraints on a string field. Negative bounds, an unknown `distinctFrom` field and a
 * `pattern` that does not compile are form errors in meta@1 rather than parse errors, so they carry a finding.
 */
export const TEXT_KEYS = ["minLength", "minWords", "placeholders", "distinctFrom", "pattern"] as const;
const textShape = {
  minLength: z.number().int().optional(),
  minWords: z.number().int().optional(),
  /** Case-insensitive tokens or short phrases; a value equal to one, or containing one as a whole word, is a placeholder. */
  placeholders: z.array(z.string().min(1)).optional(),
  /** Other field names of the same kind, or the literal `"id"`. */
  distinctFrom: z.array(name).optional(),
  /** A JavaScript regular expression source, compiled without flags and tested against the trimmed value. */
  pattern: z.string().optional(),
};
export const TextConstraintsSchema = z.strictObject(textShape);

/** Engine placeholder tokens, applied only when a template opts in with `textDefaults`. */
export const DEFAULT_PLACEHOLDERS: readonly string[] = [
  "tbd", "todo", "tba", "fixme", "xxx", "???", "lorem ipsum", "placeholder", "n/a", "none yet", "to be defined", "to be determined",
];
/** Field names `textDefaults` applies to. */
export const TEXT_DEFAULT_FIELDS: readonly string[] = ["description", "title"];

export const FieldSchema = z.strictObject({
  name,
  type: z.enum(FIELD_TYPES),
  required: z.boolean().optional(),
  enum: z.array(scalar).optional(),
  ...textShape,
});

export const KindSchema = z.strictObject({
  description: z.string().optional(),
  fields: z.array(FieldSchema).default([]),
  parents: z.array(name).optional(),
  completeness: z.strictObject({
    fields: z.array(name).default([]),
    children: z.array(z.strictObject({ kind: name, cardinality: card })).default([]),
    relations: z.array(z.strictObject({ rel: name, cardinality: card })).default([]),
  }).default({ fields: [], children: [], relations: [] }),
});

export const RelationSchema = z.strictObject({
  description: z.string().optional(),
  from: z.array(name).min(1),
  to: z.array(name).min(1),
  cardinality: z.strictObject({ out: card.default("0..*"), in: card.default("0..*") }).default({ out: "0..*", in: "0..*" }),
  acyclic: z.boolean().optional(),
  inverse: name.optional(),
  certainty: name.optional(),
});

const id = name;
export const ConstraintsSchema = z.strictObject({
  forbiddenCycles: z.array(z.strictObject({ id, relations: z.array(name).min(1) })).default([]),
  incompatible: z.array(z.strictObject({ id, kind: name, when: z.array(z.strictObject({ field: name, value: scalar })).min(2) })).default([]),
  exclusive: z.array(z.strictObject({ id, relations: z.array(name).min(2) })).default([]),
  exactlyOne: z.array(z.strictObject({
    id, kind: name,
    of: z.array(z.union([z.strictObject({ field: name }), z.strictObject({ rel: name })])).min(2),
  })).default([]),
  complete: z.array(z.strictObject({ id, kind: name })).default([]),
});

export const CriterionSchema = z.strictObject({
  id,
  owner: name,
  subject: name,
  severity: z.enum(SEVERITIES),
  description: z.string().optional(),
  gates: z.array(name).default([]),
  hooks: z.array(name).default([]),
});

export const RulePackSchema = z.strictObject({ id, version: z.union([z.string(), z.number()]).transform(String), source: z.string() });

export const SLICE_DIRECTIONS = ["out", "in", "both"] as const;

/** The bounded state a question sees: the subject, optionally its parent chain, and nodes within `hops` links. */
export const SliceSchema = z.strictObject({
  parents: z.boolean().default(true),
  hops: z.number().int().nonnegative().default(0),
  direction: z.enum(SLICE_DIRECTIONS).default("out"),
  rels: z.array(name).optional(),
  kinds: z.array(name).optional(),
  fields: z.array(name).optional(),
});

/** `id` is the rule id of the semantic candidate the question resolves. `choices` are options for `choice` and levels for `score`. */
export const QuestionSchema = z.strictObject({
  id,
  text: z.string().optional(),
  answer: z.enum(ANSWER_TYPES),
  choices: z.array(z.string()).optional(),
  slice: SliceSchema.default({ parents: true, hops: 0, direction: "out" }),
  benign: scalar,
  policy: z.array(z.strictObject({ answer: scalar, level: name })).min(1),
});

export const TemplateNodeSchema = z.strictObject({
  id,
  kind: name,
  parent: name.optional(),
  fields: z.record(z.string(), z.unknown()).default({}),
  provisional: z.boolean().optional(),
  /** Outgoing links of the prefilled node; `from` is the node itself. */
  links: z.array(z.strictObject({ rel: name, to: name, certainty: name.optional() })).optional(),
});

export const TemplateSourceSchema = z.strictObject({
  id,
  version: z.number().int().nonnegative(),
  meta: z.literal(1),
  extends: name.optional(),
  kinds: z.record(z.string(), KindSchema).default({}),
  relations: z.record(z.string(), RelationSchema).default({}),
  constraints: ConstraintsSchema.default({ forbiddenCycles: [], incompatible: [], exclusive: [], exactlyOne: [], complete: [] }),
  criteria: z.array(CriterionSchema).default([]),
  rules: z.array(RulePackSchema).default([]),
  questions: z.array(QuestionSchema).default([]),
  nodes: z.array(TemplateNodeSchema).default([]),
  /**
   * Opt-in text constraints for every declared string field named `description` or `title`. A field's own text
   * keys win key by key. `placeholders` defaults to `DEFAULT_PLACEHOLDERS`; `{}` opts in with only that.
   */
  textDefaults: TextConstraintsSchema.optional(),
});

export type Field = z.infer<typeof FieldSchema>;
export type Kind = z.infer<typeof KindSchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type Constraints = z.infer<typeof ConstraintsSchema>;
export type Criterion = z.infer<typeof CriterionSchema>;
export type RulePack = z.infer<typeof RulePackSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Slice = z.infer<typeof SliceSchema>;
export type TextConstraints = z.infer<typeof TextConstraintsSchema>;
export type TemplateNode = z.infer<typeof TemplateNodeSchema>;
export type TemplateSource = z.infer<typeof TemplateSourceSchema>;
export type TemplateInput = z.input<typeof TemplateSourceSchema>;
