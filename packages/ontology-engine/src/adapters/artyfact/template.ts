import type { TemplateInput } from "../../meta/schema";
import { authorization, facts, journeys, metamodel, readiness, theory, topologyPrivatePairs } from "./packs";
import * as schema from "./schema";

type FieldType = "string" | "number" | "boolean" | "ref" | "list" | "object";
type F = { name: string; type: FieldType; required?: boolean; enum?: string[] };
const f = (name: string, type: FieldType = "string", e?: readonly string[], required?: boolean): F =>
  ({ name, type, ...(e && { enum: [...e] }), ...(required && { required }) });
const strings = (...names: string[]) => names.map((n) => f(n));
const lists = (...names: string[]) => names.map((n) => f(n, "list"));

export const NODE_KINDS = schema.NodeKind.options;
const OTHER_KINDS = ["template", "kit", "artifact", "feature", "commitment", "criterion", "hook", "journey", "step", "evolution"] as const;
export const ARTYFACT_KINDS: string[] = [...NODE_KINDS, ...OTHER_KINDS];

const ONTOLOGY: F[] = [
  f("name"), f("owningThing", "ref"), f("revision", "number"), f("description"), f("source", "object"),
  ...strings("route", "cardinality", "actor", "trigger", "mode", "fromTemplate"),
  ...lists("states", "roles", "preconditions", "effects", "failure", "fields", "invariants"),
];

const OWN: Record<string, F[]> = {
  system: [...strings("profile", "phase", "head", "narrative"), ...lists("purposes", "rulePacks", "alternatives", "openQuestions")],
  thing: lists("purposeRefs", "sections"),
  external: [f("kind", "string", schema.ExternalKind.options), ...strings("modeled", "external")],
  purpose: [...strings("statement", "intendedChange"), ...lists("successCriteria", "nonGoals", "constraints")],
  claim: [
    ...strings("purpose", "mechanism", "outcome", "indicator", "evaluationMethod", "limitation"), f("activities", "list"),
    f("kind", "string", ["hypothesis", "invariant"]), f("status", "string", ["unknown", "supported", "challenged", "inconclusive"]), f("deferred", "boolean"),
  ],
  requirement: [f("thing", "ref"), ...strings("title", "text"), f("enabled", "boolean")],
  template: [f("kind", "string", ["system", "thing"]), ...strings("version", "name", "description"), ...lists("sections", "criteria", "hooks", "requires", "sourceMapDefaults"), f("scaffold", "object")],
  kit: [f("version")],
  artifact: [f("type", "string", schema.ArtifactType.options), ...strings("repo", "commit"), f("scope", "list")],
  feature: [...strings("name", "summary"), f("deferred", "boolean"), f("source", "object")],
  commitment: [f("statement"), ...lists("features", "coupledWith"), f("source", "object")],
  criterion: [
    f("version", "number"), f("title", "string", undefined, true), f("claim"),
    f("ownerKind", "string", ["system", "thing"], true), f("subjectKind", "string", NODE_KINDS), f("targetKind", "string", schema.TargetKind.options),
    f("severity", "string", ["hard", "soft", "advisory"], true), f("gates", "list", schema.Gate.options), f("applicableWhen"), f("deferred", "boolean"),
    ...lists("hooks", "satisfies"), f("fromTemplate"),
  ],
  hook: [
    f("version", "number"), f("assay"), f("criteria", "list"), f("tier", "string", ["basic", "execution", "semantic"]),
    f("engine", "string", ["manifest", "diff", "model-rules", "system-one", "vitest", "browser", "http", "llm"]),
    f("targetKind", "string", schema.TargetKind.options), f("triggers", "list", schema.Gate.options), f("inputs", "object"), f("verdictMapping", "object"),
    f("timeoutMs", "number"), f("costTier", "string", ["free", "cheap", "expensive"]), f("binding", "string", ["defined", "implementation-missing", "bound"], true), f("fromTemplate"),
  ],
  journey: [...strings("name", "actorGoal", "start"), ...lists("features", "requirements", "segments"), f("deferred", "boolean")],
  step: [
    f("step", "string", undefined, true), f("actor", "string", ["user", "system", "external", "counterpart"]), ...strings("action", "state", "screen", "operation", "external"),
    f("kind", "string", ["action", "reaction", "wait", "branch", "failure", "end"]), f("unresolved", "boolean"), ...lists("requirementRefs", "next"),
  ],
  evolution: [
    ...strings("title", "intent", "baseRevision", "decision"), f("state", "string", schema.EvolutionState.options, true),
    f("kind", "string", ["implementation", "genome-amendment", "mixed"]), f("risk", "string", ["low", "medium", "high"]),
    ...lists("affectedClaims", "genomeDelta", "requiredEvidence", "dependsOn", "realizations"),
  ],
};

const fieldsOf = (k: string): F[] => {
  const byName = new Map<string, F>();
  for (const x of [...((NODE_KINDS as readonly string[]).includes(k) ? ONTOLOGY : []), ...(OWN[k] ?? [])]) byName.set(x.name, x);
  return [...byName.values()];
};

const ALL = ARTYFACT_KINDS;
const rel = (from: string[], to: string[], extra: object = {}) => ({ from, to, ...extra });

/** artyfact's vocabulary as a meta@1 template: node kinds, the cross-link relation enum, and the references `toFacts` encodes. */
export const artyfactGenome: TemplateInput = {
  id: "template.meta.artyfact-genome",
  version: 1,
  meta: 1,
  kinds: Object.fromEntries(ALL.map((k) => [k, {
    fields: fieldsOf(k),
    ...(k === "step" && { parents: ["journey"] }),
    ...(k === "criterion" && { completeness: { relations: [{ rel: "owner", cardinality: "1" }, { rel: "subject", cardinality: "1" }] } }),
  }])),
  relations: {
    ...Object.fromEntries(schema.Relation.options.map((r) => [r, rel(ALL, ALL, { description: "artyfact cross-link; `refines` and `affects` also carry the node fields of the same name." })])),
    beneficiary: rel(["purpose", "claim"], ["external"]),
    subject: rel(["requirement", "criterion"], ALL),
    owner: rel(["criterion"], ["system", "thing"], { cardinality: { out: "0..1", in: "0..*" } }),
    sourceRef: rel(["criterion"], ALL),
    acceptance: rel(["evolution"], ["criterion"]),
    stepNext: rel(["step"], ["step"]),
    stepScreen: rel(["step"], ALL),
    stepOperation: rel(["step"], ALL),
    stepExternal: rel(["step"], ALL),
    requires: rel(["system"], ["kit"]),
    pinned: rel(["system", "thing"], ["kit", "template"]),
    artifact: rel(["thing"], ["artifact"]),
  },
  questions: [{
    id: "topology.multiRecipient", answer: "yes-no", benign: "no",
    text: "Does this effect deliver one action to more than one person at once?",
    slice: { hops: 1, rels: ["writes", "invokes"], fields: ["name", "effects", "fields", "cardinality"] },
    policy: [{ answer: "no", level: "pass" }, { answer: "yes", level: "error" }],
  }],
  rules: [facts, metamodel, readiness, authorization, journeys, theory, topologyPrivatePairs],
};
