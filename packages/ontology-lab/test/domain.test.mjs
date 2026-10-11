import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  EXAMPLE_MESSAGES,
  EXAMPLE_PROPOSAL,
  applyProposal,
  buildQuestionCandidates,
  createDraft,
  createLabEvent,
  extractionSchema,
  feedbackFromEvaluation,
  planQuestions,
  validateProposal,
} from "../domain.mjs";

const fixture = JSON.parse(readFileSync(new URL("../../contracts/fixtures/assistant-valid.json", import.meta.url), "utf8"));
const copy = value => structuredClone(value);

test("the model schema uses supported composition and only protected entity kinds", () => {
  const unsupported = new Set(["allOf", "not", "dependentRequired", "dependentSchemas", "if", "then", "else"]);
  const walk = value => {
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      assert.equal(unsupported.has(key), false, `unsupported structured-output keyword: ${key}`);
      walk(nested);
    }
  };
  walk(extractionSchema);
  const allowed = extractionSchema.properties.entities.items.properties.kind.enum;
  assert.ok(allowed.every(kind => fixture.template.objectShapes.some(shape => shape.kind === kind)));
  assert.ok(!allowed.includes("world") && !allowed.includes("environment"));
});

test("a valid grounded extraction becomes an isolated draft with unknown scopes", () => {
  const { snapshot, changes } = applyProposal(fixture, "demo", EXAMPLE_PROPOSAL, EXAMPLE_MESSAGES);
  assert.equal(snapshot.worldId, "lab-demo");
  assert.equal(snapshot.environment.id, "lab-demo-environment");
  assert.deepEqual(snapshot.completeness.map(item => item.status), ["complete", "incomplete", "complete", "incomplete"]);
  assert.equal(snapshot.objects.some(object => object.id === "assistant-world"), false);
  assert.equal(snapshot.objects.some(object => object.id === "user"), true);
  assert.match(snapshot.objects[0].source.reference, /message:m1:personal assistant/);
  assert.equal(snapshot.purpose.beneficiaryIds[0], "user");
  assert.equal(snapshot.purpose.outcomeIds[0], "reviewed-french-work");
  assert.ok(changes.objectIds.includes("review-criterion"));
  assert.equal(snapshot.relations.some(relation => relation.kind === "verifiedBy"), false, "the example deliberately leaves its assay link unknown");
});

test("draft keeps only protected metadata and structural root objects", () => {
  const draft = createDraft(fixture, "blank");
  assert.deepEqual(draft.things, []);
  assert.deepEqual(draft.relations, []);
  assert.deepEqual(draft.theory, { claims: [] });
  assert.deepEqual(draft.moves, []);
  assert.equal(draft.objects.length, 2);
  assert.ok(draft.completeness.every(item => item.status === "incomplete"));
  assert.equal(draft.template.id, fixture.template.id);
  assert.deepEqual(draft.rulePacks, fixture.rulePacks);
});

test("evidence must be an exact quote from a user message", () => {
  const proposal = copy(EXAMPLE_PROPOSAL);
  proposal.entities[0].evidence[0].quote = "invented evidence";
  assert.throws(() => validateProposal(proposal, EXAMPLE_MESSAGES, fixture.template), { code: "invalid_evidence" });
});

test("proposal-level evidence is required and must quote a user message", () => {
  const missing = copy(EXAMPLE_PROPOSAL);
  delete missing.evidence;
  assert.throws(() => validateProposal(missing, EXAMPLE_MESSAGES, fixture.template), { code: "invalid_proposal" });
  const unknown = copy(EXAMPLE_PROPOSAL);
  unknown.evidence[0].quote = "not in the message";
  assert.throws(() => validateProposal(unknown, EXAMPLE_MESSAGES, fixture.template), { code: "invalid_evidence" });
});

test("assistant questions can be context but cannot become evidence", () => {
  const messages = [...EXAMPLE_MESSAGES, { id: "a1", role: "assistant", text: "Should we call this a calendar plan?" }];
  assert.doesNotThrow(() => validateProposal(EXAMPLE_PROPOSAL, messages, fixture.template));
  const onlyAssistant = [{ id: "a1", role: "assistant", text: "Should we call this a calendar plan?" }];
  assert.throws(() => validateProposal(EXAMPLE_PROPOSAL, onlyAssistant, fixture.template), { code: "invalid_messages" });
  const assistantEvidence = copy(EXAMPLE_PROPOSAL);
  assistantEvidence.evidence = [{ messageId: "a1", quote: "calendar plan" }];
  assert.throws(() => validateProposal(assistantEvidence, messages, fixture.template), { code: "invalid_evidence" });
});

test("endpoint rules and duplicate ids are enforced before mapping", () => {
  const illegal = copy(EXAMPLE_PROPOSAL);
  illegal.relations[0].fromId = "user";
  assert.throws(() => validateProposal(illegal, EXAMPLE_MESSAGES, fixture.template), { code: "illegal_relation_endpoint" });
  const duplicate = copy(EXAMPLE_PROPOSAL);
  duplicate.entities[1].id = duplicate.entities[0].id;
  assert.throws(() => validateProposal(duplicate, EXAMPLE_MESSAGES, fixture.template), { code: "duplicate_entity_id" });
  const reserved = copy(EXAMPLE_PROPOSAL);
  reserved.entities[0].id = "world";
  assert.throws(() => validateProposal(reserved, EXAMPLE_MESSAGES, fixture.template), { code: "reserved_id" });
});

test("generated Thing identities cannot collide with authored object or relation ids", () => {
  const collision = copy(EXAMPLE_PROPOSAL);
  collision.entities.push({
    id: "planning", kind: "service", title: "Planning", parentId: "world", properties: [],
    evidence: [{ messageId: "m1", quote: "personal assistant" }], assertion: "proposal",
  });
  collision.entities.push({
    id: "node-planning", kind: "goal", title: "Collision", parentId: "world", properties: [],
    evidence: [{ messageId: "m1", quote: "goal of learning French" }], assertion: "proposal",
  });
  assert.throws(() => applyProposal(fixture, "collision", collision, EXAMPLE_MESSAGES), { code: "identity_collision" });
});

test("runtime validation rejects unknown fields and unsafe property keys", () => {
  const unknown = copy(EXAMPLE_PROPOSAL);
  unknown.extra = true;
  assert.throws(() => validateProposal(unknown, EXAMPLE_MESSAGES, fixture.template), { code: "unexpected_property" });
  const unsafe = copy(EXAMPLE_PROPOSAL);
  unsafe.entities[0].properties = [{ key: "constructor", value: "no" }];
  assert.throws(() => validateProposal(unsafe, EXAMPLE_MESSAGES, fixture.template), { code: "invalid_properties" });
});

test("adapters use a protected generic adapter template", () => {
  const adapter = copy(EXAMPLE_PROPOSAL);
  adapter.entities.push({
    id: "email-adapter", kind: "adapter", title: "Email adapter", parentId: "world", properties: [],
    evidence: [{ messageId: "m1", quote: "personal assistant" }], assertion: "proposal",
  });
  const { snapshot } = applyProposal(fixture, "adapter", adapter, EXAMPLE_MESSAGES);
  assert.equal(snapshot.things.find(thing => thing.id === "thing-email-adapter").templateRef.id, "lab-managed-adapter");
  assert.equal(snapshot.things.find(thing => thing.id === "thing-email-adapter").capabilities.external, false);
});

test("criteria feedback preserves unknown severity as a question", () => {
  const feedback = feedbackFromEvaluation({ findings: [{ ruleId: "scope", severity: "unknown", message: "Scope is incomplete", objectIds: ["user"] }] });
  assert.match(feedback[0].question, /What evidence/);
  assert.deepEqual(feedback[0].objectIds, ["user"]);
});

test("planned questions combine missing success and review evidence without raw rule labels", () => {
  const { snapshot } = applyProposal(fixture, "questions", EXAMPLE_PROPOSAL, EXAMPLE_MESSAGES);
  const evaluation = { findings: [
    { ruleId: "assistant.outcome-requires-indicator", severity: "unknown", message: "missing indicator", objectIds: ["reviewed-french-work"] },
    { ruleId: "assistant.outcome-requires-evaluation", severity: "unknown", message: "missing evaluation", objectIds: ["reviewed-french-work"] },
    { ruleId: "assistant.criterion-requires-assay", severity: "unknown", message: "missing assay", objectIds: ["review-criterion"] },
  ] };
  const cards = planQuestions(evaluation, snapshot, ["How should the assistant measure whether French practice happened?", "Which calendar connection is allowed?"]);
  assert.equal(cards[0].text, "For «Reviewed French practice work», what would count as success, and when would you review it?");
  assert.match(cards[0].why, /measure and a review plan/);
  assert.deepEqual(cards[0].findingIds, ["assistant.outcome-requires-indicator:0", "assistant.outcome-requires-evaluation:1"]);
  assert.match(cards[1].text, /what concrete test would show this criterion is met/i);
  assert.equal(cards[2].text, "How should the assistant measure whether French practice happened?");
  const candidatePool = buildQuestionCandidates(evaluation, snapshot, ["How should the assistant measure whether French practice happened?", "Which calendar connection is allowed?"]);
  assert.ok(candidatePool.some(card => card.text === "Which calendar connection is allowed?"));
  assert.ok(cards.every(card => !card.text.includes("assistant.")));
});

test("trace events preserve old string questions and default structured cards", () => {
  const event = createLabEvent({ id: "event-1", seq: 1, kind: "input", actor: "input", title: "Input", questions: ["What matters?"] });
  assert.deepEqual(event.questions, ["What matters?"]);
  assert.deepEqual(event.questionCards, []);
});

test("trace events retain optional review, selection, timing, and stage metadata", () => {
  const selection = { stage: "defining", selected: [], primary: null, candidates: [] };
  const event = createLabEvent({ id: "event-2", seq: 2, kind: "semantic.completed", actor: "semantic", title: "Semantic review", semanticReview: { version: "v1" }, questionSelection: selection, timings: { semanticMs: 12 }, stage: "defining", processor: "luna" });
  assert.equal(event.semanticReview.version, "v1");
  assert.equal(event.questionSelection, selection);
  assert.deepEqual(event.timings, { semanticMs: 12 });
  assert.equal(event.stage, "defining");
  assert.equal(event.processor, "luna");
});
