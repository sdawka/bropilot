import type { TemplateInput } from "../meta/schema";
import { semanticProbe, type ProbeOptions } from "./probe";

type QuestionInput = NonNullable<TemplateInput["questions"]>[number];

/** Rule ids of the reusable semantic questions. A `pair.` rule carries two subjects (see `PAIR_PREFIX`). */
export const SEMANTIC_RULES = ["text.vague", "text.unmeasurable", "pair.contradiction", "criterion.unfalsifiable"] as const;
export type SemanticRule = (typeof SEMANTIC_RULES)[number];

/** Fields a slice keeps when the template does not say; the product and artyfact vocabularies name their text this way. */
export const DEFAULT_SLICE_FIELDS = ["title", "name", "description"];

export interface CatalogueOptions {
  /** Fields every slice node keeps: the statement fields plus whatever labels the node (title, name). */
  fields?: string[];
  /** Which rules to include; default all of `SEMANTIC_RULES`. */
  rules?: readonly SemanticRule[];
}

/**
 * The questions, modelled on sys1's `ambiguity_detection`, `criteria_fulfillment` and `consistency_check` categories.
 * For yes-no questions, `choices` holds the `true` and `false` criteria sent on the wire, in that order.
 */
const ENTRIES: Record<SemanticRule, (fields: string[]) => QuestionInput> = {
  "text.vague": (fields) => ({
    id: "text.vague",
    answer: "yes-no",
    text: "Is this statement too vague to act on or verify? The statement is state.candidate.text; it belongs to state.subject, "
      + "and state.parents give its context. Vague means two competent engineers could implement or check it in materially "
      + "different ways, or could not tell when it is done: it rests on an undefined subjective quality, has no threshold or "
      + "stop condition, or names no concrete behaviour. Length does not matter, and a short statement that pins down one "
      + "behaviour, quantity or rule is not vague.",
    choices: [
      "Vague: competent readers could build or check it in materially different ways, or could not tell when it is done.",
      "Concrete: competent readers would arrive at the same behaviour and the same done-test.",
    ],
    slice: { parents: true, hops: 0, fields },
    benign: "no",
    policy: [{ answer: "no", level: "pass" }, { answer: "yes", level: "warning" }],
  }),
  "text.unmeasurable": (fields) => ({
    id: "text.unmeasurable",
    answer: "yes-no",
    text: "Can this outcome, claim or criterion be measured or tested as stated? The statement is state.candidate.text and "
      + "belongs to state.subject. Measurable means it names an observable quantity, event or condition, so that a test, "
      + "count or recorded observation could show whether it holds. Feelings, impressions or improvements with no stated "
      + "observable, threshold or method are not measurable as stated.",
    choices: [
      "Measurable: an observation, count or test could show whether the statement holds.",
      "Not measurable: no observation, count or test named or implied by the statement could show whether it holds.",
    ],
    slice: { parents: true, hops: 0, fields },
    benign: "yes",
    policy: [{ answer: "yes", level: "pass" }, { answer: "no", level: "warning" }],
  }),
  "pair.contradiction": (fields) => ({
    id: "pair.contradiction",
    answer: "yes-no",
    text: "Do these two statements contradict each other? Compare state.subject with state.counterpart, two nodes of one "
      + "specification; state.parents give context. They contradict when both cannot hold of the same system at the same "
      + "time: one requires, permits or bounds what the other forbids or exceeds. Statements about different things, or "
      + "one that merely adds detail to the other, do not contradict.",
    choices: [
      "Contradict: the two statements cannot both hold of the same system.",
      "Consistent: both statements can hold of the same system at once.",
    ],
    slice: { parents: true, hops: 0, fields },
    benign: "no",
    policy: [{ answer: "no", level: "pass" }, { answer: "yes", level: "error" }],
  }),
  "criterion.unfalsifiable": (fields) => ({
    id: "criterion.unfalsifiable",
    answer: "yes-no",
    text: "Is this acceptance criterion unfalsifiable? The criterion is state.candidate.text and belongs to state.subject. "
      + "Unfalsifiable means no test, fixture or observation could ever show that it is not met, because it hedges, rests on "
      + "opinion, or names no condition that could fail. A criterion naming a concrete input and an expected result is falsifiable.",
    choices: [
      "Unfalsifiable: no test or observation could show the criterion is not met.",
      "Falsifiable: some test or observation could show the criterion is not met.",
    ],
    slice: { parents: true, hops: 0, fields },
    benign: "no",
    policy: [{ answer: "no", level: "pass" }, { answer: "yes", level: "warning" }],
  }),
};

/** The catalogue entries to add to a template's `questions`. */
export function semanticCatalogue(o: CatalogueOptions = {}): QuestionInput[] {
  const fields = o.fields ?? DEFAULT_SLICE_FIELDS;
  return (o.rules ?? SEMANTIC_RULES).map((r) => ENTRIES[r](fields));
}

export const SEMANTIC_CATALOGUE: QuestionInput[] = semanticCatalogue();

export type SemanticProbeOptions = ProbeOptions & CatalogueOptions;

/**
 * Adds the catalogue questions and the `semantic.probe@1` pack to a template source. Questions and packs the
 * template already declares under the same id win, so a template can override one entry.
 */
export function withSemanticProbes(t: TemplateInput, o: SemanticProbeOptions = {}): TemplateInput {
  const own = new Set((t.questions ?? []).map((q) => q.id));
  const pack = semanticProbe(o);
  return {
    ...t,
    questions: [...(t.questions ?? []), ...semanticCatalogue(o).filter((q) => !own.has(q.id))],
    rules: (t.rules ?? []).some((r) => r.id === pack.id) ? t.rules : [...(t.rules ?? []), pack],
  };
}
