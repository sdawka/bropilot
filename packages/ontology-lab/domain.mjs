/**
 * Small, dependency-free domain boundary for the local ontology lab.  The
 * model may propose these values; this module owns validation and turns them
 * into the WorldSnapshot understood by the Rust core.
 */

import { selectQuestionCandidates } from "./question-policy.mjs";

const MAX_MESSAGES = 24;
const MAX_TEXT = 4_000;
const MAX_ENTITIES = 48;
const MAX_RELATIONS = 64;
const MAX_QUESTIONS = 12;
const SAFE_ID = /^[a-z][a-z0-9-]{0,63}$/;
const ASSERTIONS = new Set(["declared", "proposal"]);
const RESERVED_PROPERTY_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const THING_TEMPLATES = {
  interface: "managed-interface",
  service: "managed-service",
  adapter: "external-calendar",
  store: "managed-store",
};

const string = (description, maxLength = MAX_TEXT) => ({ type: "string", description, minLength: 1, maxLength });

/** Strict final-response schema passed to `codex exec --output-schema`. */
export const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "purpose", "evidence", "entities", "relations", "questions"],
  properties: {
    title: string("A concise proposed title for the draft world.", 160),
    purpose: string("The user-facing purpose, grounded in the conversation.", 600),
    evidence: { $ref: "#/$defs/evidence" },
    entities: {
      type: "array", maxItems: MAX_ENTITIES,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "kind", "title", "parentId", "properties", "evidence", "assertion"],
        properties: {
          id: { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$", description: "Unique slug; world and environment are reserved aliases, never entity IDs." },
          kind: { type: "string", enum: ["beneficiary", "outcome", "indicator", "evaluationPlan", "interface", "service", "adapter", "store", "operation", "authorizationRule", "acceptanceCriterion", "assay", "thing", "subsystem", "goal", "task", "calendarBlock", "schedulingConflict"] },
          title: string("A concise proposed entity title.", 240),
          parentId: { anyOf: [{ type: "string", pattern: "^(world|environment|[a-z][a-z0-9-]{0,63})$" }, { type: "null" }] },
          properties: {
            type: "array", maxItems: 16,
            items: {
              type: "object", additionalProperties: false, required: ["key", "value"],
              properties: { key: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_-]{0,63}$" }, value: string("A small scalar property.", 600) },
            },
          },
          evidence: { $ref: "#/$defs/evidence" },
          assertion: { enum: ["declared", "proposal"] },
        },
      },
    },
    relations: {
      type: "array", maxItems: MAX_RELATIONS,
      items: {
        type: "object", additionalProperties: false,
        required: ["id", "kind", "fromId", "toId", "evidence", "assertion"],
        properties: {
          id: { type: "string", pattern: "^[a-z][a-z0-9-]{0,63}$" }, kind: { type: "string", minLength: 1, maxLength: 80 },
          fromId: { type: "string", pattern: "^(world|environment|[a-z][a-z0-9-]{0,63})$" },
          toId: { type: "string", pattern: "^(world|environment|[a-z][a-z0-9-]{0,63})$" },
          evidence: { $ref: "#/$defs/evidence" }, assertion: { enum: ["declared", "proposal"] },
        },
      },
    },
    questions: { type: "array", maxItems: MAX_QUESTIONS, items: string("A concise clarification question.", 400) },
  },
  $defs: {
    evidence: {
      type: "array", minItems: 1, maxItems: 4,
      items: {
        type: "object", additionalProperties: false, required: ["messageId", "quote"],
        properties: { messageId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,80}$" }, quote: string("An exact, short quote from that message.", 500) },
      },
    },
  },
};

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function clone(value) { return structuredClone(value); }

function sourceFor(assertion, evidence) {
  return { kind: assertion, reference: evidence.map(({ messageId, quote }) => `message:${messageId}:${quote}`).join(" | ") };
}

function checkText(value, path, max = MAX_TEXT) {
  if (typeof value !== "string" || value.length === 0 || value.length > max) fail("invalid_proposal", `${path} must be a non-empty string under ${max} characters`);
}

function checkShape(value, required, allowed, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_proposal", `${path} must be an object`);
  for (const key of Object.keys(value)) if (!allowed.has(key)) fail("unexpected_property", `${path} includes unsupported property ${key}`);
  for (const key of required) if (!(key in value)) fail("invalid_proposal", `${path} is missing ${key}`);
}

function checkId(id, path) {
  if (typeof id !== "string" || !SAFE_ID.test(id)) fail("invalid_id", `${path} must be a safe lowercase slug`);
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) fail("invalid_messages", "messages must contain 1–24 turns");
  const byId = new Map();
  let hasUser = false;
  for (const message of messages) {
    if (!message || typeof message !== "object" || typeof message.id !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(message.id)) fail("invalid_messages", "each message needs a safe id");
    if (message.role !== "user" && message.role !== "assistant") fail("invalid_messages", "message role must be user or assistant");
    if (message.role === "user") hasUser = true;
    checkText(message.text, `message ${message.id}`, MAX_TEXT);
    if (byId.has(message.id)) fail("duplicate_message_id", `duplicate message id: ${message.id}`);
    byId.set(message.id, message);
  }
  if (!hasUser) fail("invalid_messages", "messages must include at least one user turn");
  return byId;
}

function validateEvidence(evidence, messages, path) {
  if (!Array.isArray(evidence) || evidence.length === 0 || evidence.length > 4) fail("invalid_evidence", `${path} needs 1–4 evidence quotes`);
  for (const item of evidence) {
    checkShape(item, ["messageId", "quote"], new Set(["messageId", "quote"]), `${path} evidence`);
    if (!item || typeof item !== "object" || typeof item.messageId !== "string") fail("invalid_evidence", `${path} evidence needs a messageId`);
    checkText(item.quote, `${path} evidence quote`, 500);
    const message = messages.get(item.messageId);
    if (!message || message.role !== "user" || !message.text.includes(item.quote)) fail("invalid_evidence", `${path} evidence quote is not present in a user message`);
  }
}

function aliasId(id, draft) {
  return id === "world" ? draft.worldId : id === "environment" ? draft.environment.id : id;
}

function objectKind(id, entities) {
  if (id === "world") return "world";
  if (id === "environment") return "environment";
  return entities.get(id)?.kind;
}

/**
 * Validates the deliberately narrow extraction boundary. Exact quotes prove
 * only that text occurred in the conversation, not that it entails a model value.
 */
export function validateProposal(proposal, messages, template) {
  const messageById = validateMessages(messages);
  checkShape(proposal, ["title", "purpose", "evidence", "entities", "relations", "questions"], new Set(["title", "purpose", "evidence", "entities", "relations", "questions"]), "proposal");
  checkText(proposal.title, "title", 160);
  checkText(proposal.purpose, "purpose", 600);
  validateEvidence(proposal.evidence, messageById, "proposal");
  if (!Array.isArray(proposal.entities) || proposal.entities.length > MAX_ENTITIES) fail("invalid_proposal", "entities must contain at most 48 entries");
  if (!Array.isArray(proposal.relations) || proposal.relations.length > MAX_RELATIONS) fail("invalid_proposal", "relations must contain at most 64 entries");
  if (!Array.isArray(proposal.questions) || proposal.questions.length > MAX_QUESTIONS) fail("invalid_proposal", "questions must contain at most 12 entries");
  for (const question of proposal.questions) checkText(question, "question", 400);

  const shapeKinds = new Set(template?.objectShapes?.map(shape => shape.kind));
  const endpointByRelation = new Map(template?.allowedRelationEndpoints?.map(endpoint => [endpoint.relationKind, endpoint]));
  if (shapeKinds.size === 0 || endpointByRelation.size === 0) fail("invalid_template", "template lacks object shapes or relation endpoints");

  const entities = new Map();
  for (const entity of proposal.entities) {
    checkShape(entity, ["id", "kind", "title", "parentId", "properties", "evidence", "assertion"], new Set(["id", "kind", "title", "parentId", "properties", "evidence", "assertion"]), "entity");
    checkId(entity.id, "entity id");
    if (entity.id === "world" || entity.id === "environment") fail("reserved_id", `entity id ${entity.id} is reserved`);
    if (entities.has(entity.id)) fail("duplicate_entity_id", `duplicate entity id: ${entity.id}`);
    if (!shapeKinds.has(entity.kind) || entity.kind === "world" || entity.kind === "environment") fail("unsupported_kind", `unsupported entity kind: ${entity.kind}`);
    checkText(entity.title, `entity ${entity.id} title`, 240);
    if (entity.parentId !== null && entity.parentId !== undefined && typeof entity.parentId !== "string") fail("invalid_parent", `entity ${entity.id} parentId must be a string or null`);
    if (!ASSERTIONS.has(entity.assertion)) fail("invalid_assertion", `entity ${entity.id} has an unsupported assertion`);
    if (!Array.isArray(entity.properties) || entity.properties.length > 16) fail("invalid_properties", `entity ${entity.id} has too many properties`);
    const propertyKeys = new Set();
    for (const property of entity.properties) {
      checkShape(property, ["key", "value"], new Set(["key", "value"]), `entity ${entity.id} property`);
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(property.key) || RESERVED_PROPERTY_KEYS.has(property.key) || propertyKeys.has(property.key)) fail("invalid_properties", `entity ${entity.id} has invalid or duplicate property keys`);
      propertyKeys.add(property.key); checkText(property.value, `entity ${entity.id} property`, 600);
    }
    validateEvidence(entity.evidence, messageById, `entity ${entity.id}`);
    entities.set(entity.id, entity);
  }
  for (const entity of entities.values()) {
    if (entity.parentId && entity.parentId !== "world" && entity.parentId !== "environment" && !entities.has(entity.parentId)) fail("unknown_parent", `entity ${entity.id} refers to an unknown parent`);
  }

  const relations = new Set();
  for (const relation of proposal.relations) {
    checkShape(relation, ["id", "kind", "fromId", "toId", "evidence", "assertion"], new Set(["id", "kind", "fromId", "toId", "evidence", "assertion"]), "relation");
    checkId(relation.id, "relation id");
    if (relations.has(relation.id)) fail("duplicate_relation_id", `duplicate relation id: ${relation.id}`);
    relations.add(relation.id);
    const endpoint = endpointByRelation.get(relation.kind);
    if (!endpoint) fail("unsupported_relation", `unsupported relation kind: ${relation.kind}`);
    if (typeof relation.fromId !== "string" || typeof relation.toId !== "string") fail("invalid_relation", `relation ${relation.id} needs endpoint ids`);
    const fromKind = objectKind(relation.fromId, entities);
    const toKind = objectKind(relation.toId, entities);
    if (!fromKind || !toKind) fail("unknown_relation_endpoint", `relation ${relation.id} refers to an unknown endpoint`);
    if (!endpoint.fromKinds.includes(fromKind) || !endpoint.toKinds.includes(toKind)) fail("illegal_relation_endpoint", `relation ${relation.id} cannot connect ${fromKind} to ${toKind}`);
    if (!ASSERTIONS.has(relation.assertion)) fail("invalid_assertion", `relation ${relation.id} has an unsupported assertion`);
    validateEvidence(relation.evidence, messageById, `relation ${relation.id}`);
  }
  return proposal;
}

/** Creates a blank, non-canonical assistant-world draft from protected metadata. */
export function createDraft(baseFixture, runId) {
  checkId(String(runId), "run id");
  if (!baseFixture?.template || !Array.isArray(baseFixture.thingTemplates) || !Array.isArray(baseFixture.rulePacks)) fail("invalid_fixture", "base fixture must supply protected template metadata");
  const worldId = `lab-${runId}`;
  const environmentId = `${worldId}-environment`;
  const reference = `lab:${runId}:structural`;
  return {
    worldId,
    title: "Untitled ontology draft",
    revisionId: `${worldId}-draft`,
    template: clone(baseFixture.template),
    purpose: { statement: "", beneficiaryIds: [], outcomeIds: [] },
    environment: { id: environmentId, title: "Draft environment" },
    phase: "foundation",
    stateKind: "desired",
    things: [],
    thingTemplates: clone(baseFixture.thingTemplates),
    objects: [
      { id: worldId, kind: "world", title: "Untitled ontology draft", properties: {}, source: { kind: "declared", reference } },
      { id: environmentId, kind: "environment", title: "Draft environment", parentId: worldId, properties: {}, source: { kind: "declared", reference } },
    ],
    relations: [],
    completeness: [...new Set(baseFixture.template.requiredRelations.map(rule => rule.scopeId))].map(scopeId => ({ scopeId, status: "incomplete", source: { kind: "declared", reference } })),
    theory: { claims: [] },
    moves: [],
    rulePacks: clone(baseFixture.rulePacks),
    activeConstraints: [],
  };
}

function matchingThingTemplate(snapshot, kind) {
  const id = THING_TEMPLATES[kind];
  const template = snapshot.thingTemplates.find(item => item.id === id);
  if (!template) fail("missing_thing_template", `fixture has no Thing template for ${kind}`);
  return template;
}

function adapterTemplate(snapshot) {
  const existing = snapshot.thingTemplates.find(item => item.id === "lab-managed-adapter");
  if (existing) return existing;
  const managed = matchingThingTemplate(snapshot, "service");
  const template = {
    id: "lab-managed-adapter", version: "1", title: "Managed adapter",
    compatibleWorldTemplates: [{ id: snapshot.template.id, version: snapshot.template.version }],
    inheritsWorldContext: true, capabilities: clone(managed.capabilities),
  };
  snapshot.thingTemplates.push(template);
  return template;
}

function assertNoOutputIdCollisions(snapshot, proposal) {
  const ids = new Set(snapshot.objects.map(object => object.id));
  const add = (id, label) => {
    if (ids.has(id)) fail("identity_collision", `${label} collides with generated or structural id ${id}`);
    ids.add(id);
  };
  for (const entity of proposal.entities) {
    add(entity.id, "entity id");
    if (THING_TEMPLATES[entity.kind]) {
      add(`thing-${entity.id}`, "generated Thing id");
      add(`node-${entity.id}`, "generated Thing node id");
    }
  }
  for (const relation of proposal.relations) add(relation.id, "relation id");
}

/** Turns a checked extraction into a complete, isolated WorldSnapshot checkpoint. */
export function applyProposal(baseFixture, runId, proposal, messages) {
  validateProposal(proposal, messages, baseFixture.template);
  const snapshot = createDraft(baseFixture, runId);
  assertNoOutputIdCollisions(snapshot, proposal);
  snapshot.title = proposal.title;
  snapshot.objects[0].title = proposal.title;
  snapshot.objects[0].source = sourceFor("proposal", proposal.evidence);
  snapshot.purpose.statement = proposal.purpose;
  const objectIds = [];
  const relationIds = [];
  const thingIds = [];
  for (const entity of proposal.entities) {
    const parentId = entity.parentId === null || entity.parentId === undefined ? snapshot.worldId : aliasId(entity.parentId, snapshot);
    const source = sourceFor(entity.assertion, entity.evidence);
    let thingId;
    if (THING_TEMPLATES[entity.kind]) {
      const template = entity.kind === "adapter" ? adapterTemplate(snapshot) : matchingThingTemplate(snapshot, entity.kind);
      thingId = `thing-${entity.id}`;
      const thingNodeId = `node-${entity.id}`;
      snapshot.things.push({ id: thingId, kind: entity.kind, title: entity.title, revisionId: snapshot.revisionId, templateRef: { id: template.id, version: template.version }, capabilities: clone(template.capabilities), source });
      snapshot.objects.push({ id: thingNodeId, kind: "thing", title: entity.title, thingId, parentId, properties: {}, source });
      snapshot.objects.push({ id: entity.id, kind: entity.kind, title: entity.title, thingId, parentId: thingNodeId, properties: Object.fromEntries(entity.properties.map(item => [item.key, item.value])), source });
      thingIds.push(thingId); objectIds.push(thingNodeId, entity.id);
    } else {
      snapshot.objects.push({ id: entity.id, kind: entity.kind, title: entity.title, parentId, properties: Object.fromEntries(entity.properties.map(item => [item.key, item.value])), source });
      objectIds.push(entity.id);
    }
    if (entity.kind === "beneficiary") snapshot.purpose.beneficiaryIds.push(entity.id);
    if (entity.kind === "outcome") snapshot.purpose.outcomeIds.push(entity.id);
  }
  for (const relation of proposal.relations) {
    snapshot.relations.push({ id: relation.id, kind: relation.kind, fromId: aliasId(relation.fromId, snapshot), toId: aliasId(relation.toId, snapshot), source: sourceFor(relation.assertion, relation.evidence) });
    relationIds.push(relation.id);
  }
  // A scope is only complete when every currently proposed subject has every
  // relation required by its protected template.  This is deterministic
  // coverage, not a claim that the model's facts are true.
  const kindById = new Map(snapshot.objects.map(object => [object.id, object.kind]));
  for (const declaration of snapshot.completeness) {
    const requirements = snapshot.template.requiredRelations.filter(rule => rule.scopeId === declaration.scopeId);
    const complete = requirements.every(rule => {
      const subjects = snapshot.objects.filter(object => object.kind === rule.subjectKind);
      return subjects.length > 0 && subjects.every(subject => snapshot.relations.some(relation =>
        relation.kind === rule.relationKind
        && relation.fromId === subject.id
        && kindById.get(relation.toId) === rule.objectKind,
      ));
    });
    if (complete) declaration.status = "complete";
  }
  return { snapshot, changes: { objectIds, relationIds, thingIds } };
}

/** Presents actual core findings as questions without recasting unknown as success. */
export function feedbackFromEvaluation(evaluation) {
  if (!evaluation || !Array.isArray(evaluation.findings)) fail("invalid_evaluation", "evaluation must include findings");
  return evaluation.findings.map(finding => ({
    id: finding.ruleId,
    severity: finding.severity,
    message: finding.message,
    question: finding.severity === "unknown" ? `What evidence would let us complete: ${finding.message}?` : `How should we address: ${finding.message}?`,
    objectIds: [...(finding.objectIds ?? [])],
  }));
}

const RULES = {
  beneficiary: "assistant.purpose-requires-beneficiary",
  outcome: "assistant.purpose-requires-outcome",
  indicator: "assistant.outcome-requires-indicator",
  evaluation: "assistant.outcome-requires-evaluation",
  authorization: "assistant.operation-requires-authorization",
  assay: "assistant.criterion-requires-assay",
};

function questionId(ruleId, objectId = "world") { return `question:${ruleId}:${objectId}`; }
function normal(text) { return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(); }

/**
 * Turns actual Rust findings into a small set of calm, concrete next questions.
 * Extraction questions are preserved only as proposal-originated context.
 */
export function buildQuestionCandidates(evaluation, snapshot, extractionQuestions = []) {
  if (!evaluation || !Array.isArray(evaluation.findings) || !snapshot || !Array.isArray(snapshot.objects)) fail("invalid_evaluation", "questions need an evaluation and snapshot");
  const byId = new Map(snapshot.objects.map(object => [object.id, object]));
  const cards = [];
  const findingsFor = ruleId => evaluation.findings
    .map((finding, index) => ({ finding, id: `${finding.ruleId}:${index}` }))
    .filter(item => item.finding.ruleId === ruleId);
  const add = (card) => {
    if (cards.some(existing => normal(existing.text) === normal(card.text))) return;
    cards.push({ origins: ["criteria"], evidenceRefs: [], ...card });
  };
  const title = id => byId.get(id)?.title ?? "this part of the model";
  const missingSubject = kind => !snapshot.objects.some(object => object.kind === kind);
  const scopeFinding = scopeId => evaluation.findings
    .map((finding, index) => ({ finding, id: `${finding.ruleId}:${index}` }))
    .filter(item => item.finding.ruleId === "core.mandatory-scope-incomplete" && item.finding.message.includes(scopeId));

  const indicator = findingsFor(RULES.indicator);
  const review = findingsFor(RULES.evaluation);
  const outcomeIds = new Set([...indicator, ...review].flatMap(item => item.finding.objectIds ?? []));
  for (const outcomeId of outcomeIds) {
    const indicatorFinding = indicator.filter(item => (item.finding.objectIds ?? []).includes(outcomeId));
    const reviewFinding = review.filter(item => (item.finding.objectIds ?? []).includes(outcomeId));
    if (indicatorFinding.length && reviewFinding.length) {
      add({ id: questionId("outcome-success-review", outcomeId), text: `For «${title(outcomeId)}», what would count as success, and when would you review it?`, why: "The criteria check still lacks both a measure and a review plan for this outcome.", objectIds: [outcomeId], findingIds: [...indicatorFinding, ...reviewFinding].map(item => item.id) });
    } else if (indicatorFinding.length) {
      add({ id: questionId(RULES.indicator, outcomeId), text: `For «${title(outcomeId)}», what would count as success?`, why: "The criteria check has no measure for this outcome yet.", objectIds: [outcomeId], findingIds: indicatorFinding.map(item => item.id) });
    } else {
      add({ id: questionId(RULES.evaluation, outcomeId), text: `For «${title(outcomeId)}», when and how should progress be reviewed?`, why: "The criteria check has no review plan for this outcome yet.", objectIds: [outcomeId], findingIds: reviewFinding.map(item => item.id) });
    }
  }
  for (const item of findingsFor(RULES.authorization)) {
    for (const objectId of item.finding.objectIds ?? []) {
      const subject = title(objectId);
      add({ id: questionId(RULES.authorization, objectId), text: `For «${subject}», which changes need your approval?`, why: "The criteria check has no authorization rule for this operation.", objectIds: [objectId], findingIds: [item.id], operation: { mode: /\b(search|read|view|list|find|look up)\b/i.test(subject) ? "read" : "write", subject } });
    }
  }
  for (const item of findingsFor(RULES.assay)) {
    for (const objectId of item.finding.objectIds ?? []) add({ id: questionId(RULES.assay, objectId), text: `For «${title(objectId)}», what concrete test would show this criterion is met?`, why: "This defines a model check; it does not say that test has run.", objectIds: [objectId], findingIds: [item.id] });
  }
  const beneficiary = findingsFor(RULES.beneficiary);
  if (beneficiary.length) add({ id: questionId(RULES.beneficiary), text: "Who is this assistant meant to help?", why: "The criteria check has no beneficiary linked to the purpose.", objectIds: [], findingIds: beneficiary.map(item => item.id) });
  const outcome = findingsFor(RULES.outcome);
  if (outcome.length) add({ id: questionId(RULES.outcome), text: "What change should show that the assistant is helping?", why: "The criteria check has no outcome linked to the purpose.", objectIds: [], findingIds: outcome.map(item => item.id) });

  if (missingSubject("outcome") && scopeFinding("outcome-links").length) add({ id: "question:initial-outcome", text: "What would count as a useful outcome, and when should it be reviewed?", why: "The outcome checks are still incomplete and there is no outcome to assess yet.", objectIds: [], findingIds: scopeFinding("outcome-links").map(item => item.id) });
  if (missingSubject("operation") && scopeFinding("authorization-links").length) add({ id: "question:initial-approval", text: "Which changes should wait for your approval?", why: "The authorization checks are incomplete and no operation has been described yet.", objectIds: [], findingIds: scopeFinding("authorization-links").map(item => item.id) });
  if (missingSubject("acceptanceCriterion") && scopeFinding("assay-links").length) add({ id: "question:initial-test", text: "What should this Thing reliably do first, and how would you check it?", why: "The draft still needs one clear promise and a way to check it.", objectIds: [], findingIds: scopeFinding("assay-links").map(item => item.id) });
  if ((missingSubject("beneficiary") || missingSubject("outcome")) && scopeFinding("purpose-links").length) add({ id: "question:initial-purpose", text: "Who is this for, and what change should it make?", why: "The purpose links are incomplete.", objectIds: [], findingIds: scopeFinding("purpose-links").map(item => item.id) });

  for (const text of extractionQuestions) {
    if (typeof text !== "string" || !text.trim()) continue;
    add({ id: `question:proposal:${cards.length}`, text, origins: ["proposal"], why: "This was raised while interpreting the proposed model.", objectIds: [], findingIds: [], evidenceRefs: [] });
  }
  return cards;
}

/**
 * Compatibility wrapper for legacy callers. Supplying conversation options
 * selects one visible next question; callers without them receive the prior
 * inspectable candidate list.
 */
export function planQuestions(evaluation, snapshot, extractionQuestions = [], options = undefined) {
  const candidates = buildQuestionCandidates(evaluation, snapshot, extractionQuestions);
  if (!options || !Array.isArray(options.messages)) return candidates.slice(0, 3);
  const selection = selectQuestionCandidates(candidates, options);
  return selection.selected;
}

export const feedbackQuestions = feedbackFromEvaluation;
export const buildDraft = applyProposal;

export function createLabEvent({ id, seq, time = new Date().toISOString(), kind, actor, title, detail = "", targets = {}, snapshot = null, evaluation = null, questions = [], questionCards = [], semanticReview = null, questionSelection = null, timings = null, stage = null, processor = null }) {
  if (!Number.isInteger(seq) || seq < 0 || typeof id !== "string" || typeof kind !== "string" || !["input", "extractor", "mapper", "criteria", "feedback", "semantic", "questioner"].includes(actor)) fail("invalid_event", "event id, sequence, kind, and actor are required");
  return {
    id, seq, time, kind, actor, title, detail,
    targets: { messageIds: [...(targets.messageIds ?? [])], objectIds: [...(targets.objectIds ?? [])], relationIds: [...(targets.relationIds ?? [])], findingIds: [...(targets.findingIds ?? [])] },
    snapshot, evaluation, questions: [...questions], questionCards: [...questionCards], semanticReview, questionSelection, timings, stage, processor,
  };
}

export const EXAMPLE_MESSAGES = [{
  id: "m1", role: "user",
  text: "I want a personal assistant that turns my vague goal of learning French into a weekly calendar block, asks before changing anything important, and lets me review whether I actually did the work.",
}];

export const EXAMPLE_PROPOSAL = {
  title: "French practice assistant", purpose: "Help the user turn a French-learning goal into reviewed calendar work.",
  evidence: [
    { messageId: "m1", quote: "personal assistant" },
    { messageId: "m1", quote: "goal of learning French" },
    { messageId: "m1", quote: "review whether I actually did the work" },
  ],
  entities: [
    { id: "user", kind: "beneficiary", title: "User", parentId: "world", properties: [], evidence: [{ messageId: "m1", quote: "my vague goal of learning French" }], assertion: "declared" },
    { id: "reviewed-french-work", kind: "outcome", title: "Reviewed French practice work", parentId: "world", properties: [], evidence: [{ messageId: "m1", quote: "review whether I actually did the work" }], assertion: "declared" },
    { id: "french-goal", kind: "goal", title: "Learn French", parentId: "world", properties: [], evidence: [{ messageId: "m1", quote: "goal of learning French" }], assertion: "declared" },
    { id: "weekly-french-block", kind: "calendarBlock", title: "Weekly French practice block", parentId: "french-goal", properties: [{ key: "ownership", value: "assistant" }], evidence: [{ messageId: "m1", quote: "weekly calendar block" }], assertion: "proposal" },
    { id: "schedule-work", kind: "operation", title: "Schedule French practice", parentId: "world", properties: [], evidence: [{ messageId: "m1", quote: "turns my vague goal" }], assertion: "proposal" },
    { id: "important-change-policy", kind: "authorizationRule", title: "Ask before important changes", parentId: "schedule-work", properties: [], evidence: [{ messageId: "m1", quote: "asks before changing anything important" }], assertion: "declared" },
    { id: "review-criterion", kind: "acceptanceCriterion", title: "Review completed work", parentId: "world", properties: [], evidence: [{ messageId: "m1", quote: "review whether I actually did the work" }], assertion: "proposal" },
  ],
  relations: [
    { id: "has-user", kind: "hasBeneficiary", fromId: "world", toId: "user", evidence: [{ messageId: "m1", quote: "personal assistant" }], assertion: "proposal" },
    { id: "has-reviewed-work", kind: "hasOutcome", fromId: "world", toId: "reviewed-french-work", evidence: [{ messageId: "m1", quote: "review whether I actually did the work" }], assertion: "proposal" },
    { id: "schedule-authorized", kind: "authorizedBy", fromId: "schedule-work", toId: "important-change-policy", evidence: [{ messageId: "m1", quote: "asks before changing anything important" }], assertion: "declared" },
  ],
  questions: ["How should the assistant measure whether French practice happened?", "Which calendar connection, if any, is allowed to receive the weekly block?"],
};
