import assert from "node:assert/strict";
import { test } from "node:test";
import { selectQuestionCandidates } from "../question-policy.mjs";

const candidate = (id, text, extra = {}) => ({ id, text, origins: ["proposal"], findingIds: [], objectIds: [], evidenceRefs: [], ...extra });

test("keeps booking candidates inspectable while selecting the concrete slot-hold decision", () => {
  const result = selectQuestionCandidates([
    candidate("success", "What would count as success, and when would you review it?", { origins: ["criteria"], findingIds: ["outcome:0"] }),
    candidate("slot-hold", "Does a pending request hold the slot, or can several members request it until you approve one?", { evidenceRefs: ["message:m1"] }),
  ], { messages: [{ id: "m1", role: "user", text: "Room bookings never overlap." }], stage: "exploring" });
  assert.equal(result.selected[0].id, "slot-hold");
  assert.equal(result.candidates.find(item => item.id === "success").status, "deferred");
  assert.deepEqual(result.candidates.find(item => item.id === "slot-hold").evidenceRefs, ["message:m1"]);
});

test("prefers a model question grounded in failed criteria over an ungrounded long proposal", () => {
  const result = selectQuestionCandidates([
    candidate("broad", "Could you describe every preference, report, screen, notification, and future workflow you might eventually want?"),
    candidate("grounded", "What happens to a pending booking request?", { origins: ["model"], findingIds: ["booking-hold:0"], objectIds: ["booking"] }),
  ], { messages: [{ id: "m1", role: "user", text: "Members can request a room." }], stage: "defining" });
  assert.equal(result.selected[0].id, "grounded");
  assert.equal(result.candidates.find(item => item.id === "broad").status, "deferred");
});

test("does not re-ask a Friday review answer", () => {
  const result = selectQuestionCandidates([
    candidate("review", "When should the review happen?"),
  ], { messages: [{ id: "m1", role: "user", text: "Review progress every Friday." }], stage: "defining" });
  assert.deepEqual(result.selected, []);
  assert.equal(result.candidates[0].status, "answered");
});

test("does not mistake a Friday booking detail for an answer to a combined success and review question", () => {
  const result = selectQuestionCandidates([candidate("success-review", "What would count as success, and when would you review it?")], { messages: [{ id: "m1", role: "user", text: "A member can book a room on Friday." }] });
  assert.equal(result.selected[0].id, "success-review");
});

test("does not ask approval for a read-only journal search", () => {
  const result = selectQuestionCandidates([
    candidate("search-approval", "Which changes need your approval?", { origins: ["criteria"], findingIds: ["authorization:0"], operation: { mode: "read", subject: "journal search" } }),
    candidate("search-scope", "Which journal entries should the search include?"),
  ], { messages: [{ id: "m1", role: "user", text: "I need to search my private journal." }], stage: "exploring" });
  assert.equal(result.selected[0].id, "search-scope");
  assert.equal(result.candidates.find(item => item.id === "search-approval").status, "superseded");
});

test("a correction supersedes the earlier grocery permission", () => {
  const result = selectQuestionCandidates([
    candidate("grocery-auto", "Should the assistant automatically change the grocery list?"),
  ], { messages: [
    { id: "m1", role: "user", text: "You can add grocery items for me." },
    { id: "m2", role: "user", text: "Actually, do not change the grocery list automatically." },
  ], stage: "defining" });
  assert.deepEqual(result.selected, []);
  assert.equal(result.candidates[0].status, "answered");
  assert.match(result.candidates[0].reason, /correction/i);
});

test("uses the latest topic-bound automatic-change correction", () => {
  const result = selectQuestionCandidates([candidate("grocery-auto", "Should the assistant automatically change the grocery list?")], { messages: [
    { id: "m1", role: "user", text: "Do not change the grocery list automatically." },
    { id: "m2", role: "user", text: "Actually, automatically adding grocery items is fine." },
    { id: "m3", role: "user", text: "Never automatically delete journal entries." },
  ] });
  assert.deepEqual(result.selected, []);
  assert.match(result.candidates[0].reason, /latest/i);
});

test("uses assistant context to recognize a short answer without treating assistant text as a fact", () => {
  const result = selectQuestionCandidates([
    candidate("review-day", "Which day should the weekly review happen?"),
  ], { messages: [
    { id: "a1", role: "assistant", text: "Which day should the weekly review happen?" },
    { id: "u1", role: "user", text: "Friday." },
  ], stage: "defining" });
  assert.deepEqual(result.selected, []);
  assert.equal(result.candidates[0].status, "answered");
});

test("does not treat an unrelated weekday, test, or uncertainty reply as an answer", () => {
  const weekday = selectQuestionCandidates([candidate("review", "When should the review happen?")], { messages: [{ id: "m1", role: "user", text: "The team meeting is Friday." }] });
  const test = selectQuestionCandidates([candidate("assay", "What concrete test would show booking works?")], { messages: [{ id: "m1", role: "user", text: "I tested the color palette yesterday." }] });
  const uncertain = selectQuestionCandidates([candidate("scope", "Which calendar should receive bookings?")], { messages: [{ id: "a1", role: "assistant", text: "Which calendar should receive bookings?" }, { id: "u1", role: "user", text: "Not sure." }] });
  assert.equal(weekday.selected[0].id, "review");
  assert.equal(test.selected[0].id, "assay");
  assert.equal(uncertain.selected[0].id, "scope");
});

test("keeps an approval question for a delete even when the conversation also mentions read-only search", () => {
  const result = selectQuestionCandidates([
    candidate("delete-approval", "Which changes need your approval?", { operation: { mode: "write", subject: "delete journal entries" } }),
  ], { messages: [{ id: "m1", role: "user", text: "Search the journal, but deleting entries must need my approval." }] });
  assert.equal(result.selected[0].id, "delete-approval");
});

test("stage changes priority but cannot turn an answered candidate back into an authority", () => {
  const candidates = [
    candidate("assay", "What concrete test would show this criterion is met?", { origins: ["criteria"], findingIds: ["assay:0"] }),
    candidate("scope", "Which member can approve a booking?"),
  ];
  const messages = [{ id: "m1", role: "user", text: "The concrete test is a successful booking request." }];
  const exploring = selectQuestionCandidates(candidates, { messages, stage: "exploring" });
  const realizing = selectQuestionCandidates(candidates, { messages, stage: "realizing" });
  assert.equal(exploring.candidates.find(item => item.id === "assay").status, "answered");
  assert.equal(realizing.candidates.find(item => item.id === "assay").status, "answered");
  assert.equal(realizing.selected[0].id, "scope");
});

test("semantic flagged findings become a specific inspectable candidate", () => {
  const result = selectQuestionCandidates([], { messages: [{ id: "m1", role: "user", text: "The report is important." }], judgments: [{ kind: "contradiction", disposition: "flagged", subject: "report-retention", reason: "The retention rule conflicts with the stated purpose.", question: "How long should reports be retained?", refs: ["message:m1"] }] });
  assert.equal(result.selected[0].text, "How long should reports be retained?");
  assert.deepEqual(result.selected[0].origins, ["semantic"]);
  assert.deepEqual(result.selected[0].evidenceRefs, ["message:m1"]);
});

test("uses semantic candidate references nested under refs", () => {
  const result = selectQuestionCandidates([candidate("one", "Which booking policy applies?")], { judgments: [{ kind: "question_already_answered", disposition: "flagged", refs: { candidateIds: ["one"] } }] });
  assert.deepEqual(result.selected, []);
  assert.equal(result.candidates[0].status, "deferred");
  assert.equal(result.candidates[0].provisional, true);
});

test('already-answered judgment is not hidden by an earlier usefulness judgment',()=>{
 const result=selectQuestionCandidates([{id:'q',text:'Which review day?',findingIds:['review:0']}],{judgments:[
  {kind:'question_usefulness',disposition:'supported',refs:{candidateIds:['q']},probabilities:{yes:.99}},
  {kind:'question_already_answered',disposition:'flagged',refs:{candidateIds:['q']},probabilities:{yes:.99}},
 ]});
 assert.equal(result.selected.length,0);assert.equal(result.candidates[0].status,'deferred');assert.equal(result.candidates[0].provisional,true);
});

test('probable duplication outweighs model-origin preference without asserting a user answer',()=>{
 const candidates=[{id:'model',text:'Who benefits from this?',origin:'model',findingIds:['semantic:beneficiary']},{id:'specific',text:'Should the monthly review cover the previous calendar month?',origin:'proposal',findingIds:[]}];
 const judgments=[...['model','specific'].flatMap((id,i)=>[
  {kind:'question_usefulness',refs:{candidateIds:[id]},disposition:'unknown',probabilities:{yes:i===0?.19:.77}},
  {kind:'question_already_answered',refs:{candidateIds:[id]},disposition:'unknown',probabilities:{yes:i===0?.83:.10}},
 ])];
 const result=selectQuestionCandidates(candidates,{judgments});assert.equal(result.selected[0].id,'specific');assert.notEqual(result.candidates[0].status,'answered');
});
