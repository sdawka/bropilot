import type { RulePack } from "../meta/schema";

/**
 * A rule whose id starts with `pair.` judges two nodes. The dialect cannot build strings, so the pack emits
 * `semanticCandidate(Rule, A, B)` with the second node id in the text column and `A < B`; `judge` joins them into
 * the subject `A|B` and `buildSlice` resolves both.
 */
export const PAIR_PREFIX = "pair.";
export const PAIR_SEPARATOR = "|";

export interface ProbeOptions {
  /** Fields whose values are statements to probe; each list element is its own statement. Default `["description"]`. */
  texts?: string[];
  /** Kinds asked `text.unmeasurable`. Default outcome, claim and criterion. */
  measurable?: string[];
  /** Kinds asked `criterion.unfalsifiable`. Default criterion. */
  criteria?: string[];
  /** Relations whose two ends are asked `pair.contradiction`. Default none. */
  probePairs?: string[];
  /** Kinds whose children of one non-root parent are paired; `["*"]` is every kind. Default every kind. */
  siblings?: string[];
}

const str = (s: string) => JSON.stringify(s);
/** An empty option still emits `""`, which names no field, kind or relation, so `meta@1` sees the relation emitted. */
const facts = (rel: string, xs: readonly string[]) => (xs.length ? xs : [""]).map((x) => `${rel}(${str(x)}).`).join("\n");

/** The generic part of `semantic.probe@1`; the options become facts appended to it. */
export const PROBE_SOURCE = `
% semantic.probe@1 - emits candidates for the reusable semantic questions. A rule fires only when the template
% declares the question, so a template enables rules through its questions.
.decl node(Id: sym, Kind: sym, Parent: sym)
.decl field(Node: sym, Field: sym, Value: sym)
.decl link(From: sym, Rel: sym, To: sym, Certainty: sym)
.decl question(Id: sym, Answer: sym)
.decl semanticCandidate(Rule: sym, Subject: sym, Text: sym) .output

.decl probeText(Field: sym)
.decl probeMeasurable(Kind: sym)
.decl probeCriterion(Kind: sym)
.decl probePair(Rel: sym)
.decl probeSibling(Kind: sym)
.decl probeStatement(Node: sym, Text: sym)
.decl probeTexted(Node: sym)
.decl probeSiblingKind(Kind: sym)
.decl probePaired(A: sym, B: sym)

.message "text.vague" "{1} may be too vague to act on or verify: {2}"
.message "text.unmeasurable" "{1} may not be measurable as stated: {2}"
.message "criterion.unfalsifiable" "Criterion {1} may be unfalsifiable: {2}"
.message "pair.contradiction" "{1} and {2} may contradict each other."

probeStatement(N,T) :- probeText(F), field(N,F,T), T != "".
probeTexted(N) :- probeStatement(N,_).

semanticCandidate("text.vague",N,T) :- question("text.vague",_), probeStatement(N,T).
semanticCandidate("text.unmeasurable",N,T) :- question("text.unmeasurable",_), probeStatement(N,T), node(N,K,_), probeMeasurable(K).
semanticCandidate("criterion.unfalsifiable",N,T) :- question("criterion.unfalsifiable",_), probeStatement(N,T), node(N,K,_), probeCriterion(K).

probeSiblingKind(K) :- probeSibling("*"), node(_,K,_).
probeSiblingKind(K) :- probeSibling(K).
probePaired(A,B) :- probePair(R), link(A,R,B,_), A != B, probeTexted(A), probeTexted(B).
probePaired(A,B) :- probeTexted(A), node(A,KA,P), P != "", probeSiblingKind(KA), probeTexted(B), node(B,KB,P), probeSiblingKind(KB), A != B.

semanticCandidate("pair.contradiction",A,B) :- question("pair.contradiction",_), probePaired(A,B), A < B.
semanticCandidate("pair.contradiction",B,A) :- question("pair.contradiction",_), probePaired(A,B), B < A.
`;

export const PROBE_DEFAULTS: Required<ProbeOptions> = {
  texts: ["description"],
  measurable: ["outcome", "claim", "criterion"],
  criteria: ["criterion"],
  probePairs: [],
  siblings: ["*"],
};

/** `semantic.probe@1` configured for one vocabulary. */
export function semanticProbe(o: ProbeOptions = {}): RulePack {
  const c: Required<ProbeOptions> = {
    texts: o.texts ?? PROBE_DEFAULTS.texts,
    measurable: o.measurable ?? PROBE_DEFAULTS.measurable,
    criteria: o.criteria ?? PROBE_DEFAULTS.criteria,
    probePairs: o.probePairs ?? PROBE_DEFAULTS.probePairs,
    siblings: o.siblings ?? PROBE_DEFAULTS.siblings,
  };
  const options = [
    "% options",
    facts("probeText", c.texts), facts("probeMeasurable", c.measurable), facts("probeCriterion", c.criteria),
    facts("probePair", c.probePairs), facts("probeSibling", c.siblings),
  ].join("\n");
  return { id: "semantic.probe", version: "1", source: `${PROBE_SOURCE}\n${options}\n` };
}
