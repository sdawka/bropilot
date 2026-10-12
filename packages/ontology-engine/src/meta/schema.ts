import { z } from "zod";
import { isCardinality } from "./cardinality";

const name = z.string().min(1);
const card = z.string().refine(isCardinality, { message: "expected cardinality N, N..M or N..*" });
const scalar = z.union([z.string(), z.number(), z.boolean()]);

export const FIELD_TYPES = ["string", "number", "boolean", "ref", "refs", "list", "object"] as const;
export const SEVERITIES = ["hard", "soft", "advisory"] as const;
export const ANSWER_TYPES = ["yes-no", "choice", "score"] as const;

export const FieldSchema = z.strictObject({
  name,
  type: z.enum(FIELD_TYPES),
  required: z.boolean().optional(),
  enum: z.array(scalar).optional(),
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
});

export type Field = z.infer<typeof FieldSchema>;
export type Kind = z.infer<typeof KindSchema>;
export type Relation = z.infer<typeof RelationSchema>;
export type Constraints = z.infer<typeof ConstraintsSchema>;
export type Criterion = z.infer<typeof CriterionSchema>;
export type RulePack = z.infer<typeof RulePackSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type Slice = z.infer<typeof SliceSchema>;
export type TemplateNode = z.infer<typeof TemplateNodeSchema>;
export type TemplateSource = z.infer<typeof TemplateSourceSchema>;
export type TemplateInput = z.input<typeof TemplateSourceSchema>;
