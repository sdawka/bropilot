/**
 * Deterministic question selection for the ontology lab.  This policy chooses
 * a conversational next step; it never grants a capability or changes a
 * readiness finding.
 */

const WEEKDAYS = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const GENERIC = /\b(what would count as success|when would you review|which changes need (your )?approval|who is this .* meant to help|what change should show|what concrete test would show)\b/i;
const READ_ONLY = /\b(search|read|view|list|find|look up)\b/i;
const APPROVAL = /\b(approval|approve|permission|authoriz)/i;
const STOP_WORDS = new Set(["a", "an", "and", "are", "as", "at", "be", "can", "could", "do", "does", "for", "from", "happen", "how", "i", "if", "in", "is", "it", "me", "my", "of", "on", "or", "should", "the", "this", "to", "we", "what", "when", "which", "who", "will", "with", "would", "you", "your"]);

function words(value) {
  return new Set(String(value ?? "").toLowerCase().match(/[a-z0-9]+/g)?.filter(word => !STOP_WORDS.has(word)) ?? []);
}

function normalized(value) { return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase(); }
function refs(value) { return Array.isArray(value) ? [...value] : []; }
function judgmentCandidateIds(judgment) { return [...refs(judgment?.candidateIds), ...refs(judgment?.refs?.candidateIds)]; }

function candidatesFromJudgments(judgments) {
  return judgments.flatMap((judgment, index) => {
    const question = judgment?.question ?? judgment?.suggestedQuestion;
    if (judgment?.kind?.startsWith("question_") || judgment?.disposition !== "flagged" || typeof question !== "string" || !question.trim()) return [];
    const subjectId = typeof judgment.subject === "object" ? judgment.subject?.id : judgment.subject;
    return [{
      id: `question:semantic:${subjectId ?? index}`,
      text: question.trim(),
      origins: ["semantic"],
      why: judgment.reason ?? "A semantic review found a specific unresolved contradiction.",
      findingIds: refs(judgment.findingIds),
      objectIds: refs(judgment.objectIds ?? (subjectId ? [subjectId] : [])),
      evidenceRefs: refs(judgment.refs ?? judgment.evidenceRefs),
      semanticJudgmentRefs: [judgment.id ?? `${judgment.kind ?? "judgment"}:${index}`],
    }];
  });
}

function explicitDisposition(candidate, judgments) {
  const matches = judgments.filter(judgment => judgment && (judgment.candidateId === candidate.id || judgment.questionId === candidate.id || judgmentCandidateIds(judgment).includes(candidate.id) || (typeof judgment.question === "string" && normalized(judgment.question) === normalized(candidate.text))));
  const matching = matches.find(j => j.kind === "question_already_answered" && j.disposition === "flagged")
    ?? matches.find(j => ["answered", "deferred", "superseded"].includes(j.disposition))
    ?? matches.find(j => j.kind === "question_usefulness" && j.disposition === "flagged");
  if (!matching) return null;
  const status = matching.kind?.startsWith("question_") ? "deferred" : matching.disposition;
  return { status, provisional: true, reason: matching.kind === "question_already_answered" ? "Provisionally deferred: the semantic model suspects this was already answered; this is not a confirmed user decision." : matching.reason ?? `Provisional semantic review: ${status}.`, semanticJudgmentRefs: [matching.id].filter(Boolean) };
}

function answeredByConversation(candidate, messages) {
  const userMessages = messages.filter(message => message?.role === "user" && typeof message.text === "string");
  const question = normalized(candidate.text);
  const topic = words(candidate.text);
  const overlaps = text => [...words(text)].filter(word => topic.has(word)).length;
  if (/\breview\b/i.test(question) && !/\b(success|measure|metric|count as)\b/i.test(question) && /\b(which day|when)\b/i.test(question) && userMessages.some(message => WEEKDAYS.test(message.text) && overlaps(message.text) > 0)) return { reason: "A user message already supplies the review day." };
  if (/concrete test|what .* test/i.test(question) && userMessages.some(message => /\b(test|check|verify|verified|successful)\b/i.test(message.text) && overlaps(message.text) >= 2)) return { reason: "A user message already supplies a test or check." };
  if (/automatical/i.test(question)) {
    const topicWords = [...topic].filter(word => word !== "automatic" && word !== "automatically" && word !== "change");
    const matching = userMessages.filter(message => /\bautomatical/i.test(message.text) && (!topicWords.length || topicWords.some(word => words(message.text).has(word))));
    const latest = matching.at(-1);
    if (latest && /\b(do not|don't|never|no|yes|okay|ok|fine|allow)\b/i.test(latest.text)) return { reason: "The latest user correction answers the automatic-change choice." };
  }
  const assistantIndex = messages.findIndex(message => message?.role === "assistant" && normalized(message.text) === question);
  if (assistantIndex >= 0) {
    const reply = messages.slice(assistantIndex + 1).find(message => message?.role === "user" && typeof message.text === "string");
    if (reply && words(reply.text).size > 0 && words(reply.text).size <= 4 && !/\b(not sure|don.t know|uncertain|maybe|idk)\b/i.test(reply.text)) return { reason: "A short user reply answers the preceding assistant question." };
  }
  return null;
}

function falsePremise(candidate, messages) {
  const text = candidate.text ?? "";
  const operation = candidate.operation ?? {};
  const conversation = messages.filter(message => message?.role === "user").map(message => message.text).join(" ");
  if (APPROVAL.test(text) && (operation.mode === "read" || (operation.mode !== "write" && READ_ONLY.test(operation.subject ?? "") && READ_ONLY.test(conversation)))) {
    return "A read-only search needs no approval question; access checks remain applicable.";
  }
  return null;
}

function priority(candidate, stage) {
  const tokenCount = words(candidate.text).size;
  const grounded = candidate.findingIds.length > 0 || candidate.objectIds.length > 0 || candidate.evidenceRefs.length > 0;
  let score = Math.min(tokenCount, 12) * 0.5;
  if (GENERIC.test(candidate.text)) score -= 14;
  if (candidate.origins.includes("model") || candidate.origins.includes("semantic")) score += 10;
  if (grounded) score += 12;
  if (candidate.origins.includes("proposal") && !grounded) score -= 8;
  if (stage === "exploring" && candidate.findingIds.some(id => /assay|indicator|evaluation|outcome/.test(id))) score -= 10;
  if (stage === "defining" && candidate.findingIds.some(id => /authorization|assay|indicator|evaluation/.test(id))) score += 4;
  if (stage === "realizing" && candidate.findingIds.some(id => /assay|authorization|criterion/.test(id))) score += 12;
  return score;
}

function semanticPriority(candidate, judgments) {
  const related = judgments.filter(item => item?.candidateId === candidate.id || judgmentCandidateIds(item).includes(candidate.id));
  const usefulness = related.find(item => item.kind === "question_usefulness")?.probabilities?.yes;
  const answered = related.find(item => item.kind === "question_already_answered")?.probabilities?.yes;
  // Ranking is a reversible preference, not semantic acceptance. Both signals
  // matter even when neither crosses the conservative fact-review thresholds.
  return (Number.isFinite(usefulness) ? (usefulness - 0.5) * 60 : 0)
    - (Number.isFinite(answered) ? answered * 60 : 0);
}

/**
 * Keeps every supplied candidate visible with an explicit disposition, while
 * selecting at most one useful next question.  Stages alter only sorting.
 */
export function selectQuestionCandidates(candidates, { messages = [], stage = "exploring", judgments = [] } = {}) {
  if (!Array.isArray(candidates)) throw new TypeError("candidates must be an array");
  if (!Array.isArray(messages)) throw new TypeError("messages must be an array");
  if (!Array.isArray(judgments)) throw new TypeError("judgments must be an array");
  if (!new Set(["exploring", "defining", "realizing"]).has(stage)) throw new TypeError("stage must be exploring, defining, or realizing");
  const pool = [...candidates, ...candidatesFromJudgments(judgments)].map((candidate, index) => ({
    id: typeof candidate?.id === "string" ? candidate.id : `question:candidate:${index}`,
    text: typeof candidate?.text === "string" ? candidate.text.trim() : "",
    origins: refs(candidate?.origins ?? (candidate?.origin ? [candidate.origin] : ["proposal"])),
    why: candidate?.why ?? "An unresolved question is available.",
    findingIds: refs(candidate?.findingIds), objectIds: refs(candidate?.objectIds), evidenceRefs: refs(candidate?.evidenceRefs),
    semanticJudgmentRefs: refs(candidate?.semanticJudgmentRefs), operation: candidate?.operation,
  })).filter(candidate => candidate.text);

  const evaluated = pool.map(candidate => {
    const explicit = explicitDisposition(candidate, judgments);
    const premise = falsePremise(candidate, messages);
    const answered = answeredByConversation(candidate, messages);
    if (explicit) return { ...candidate, ...explicit };
    if (premise) return { ...candidate, status: "superseded", reason: premise };
    if (answered) return { ...candidate, status: "answered", ...answered };
    return { ...candidate, status: "available", reason: "Not answered or contradicted in the current conversation." };
  });
  const available = evaluated.filter(candidate => candidate.status === "available").sort((left, right) => priority(right, stage) + semanticPriority(right, judgments) - priority(left, stage) - semanticPriority(left, judgments) || left.id.localeCompare(right.id));
  const selected = available[0] ?? null;
  for (const candidate of evaluated) if (selected && candidate.id !== selected.id && candidate.status === "available") {
    candidate.status = "deferred";
    candidate.reason = "A more consequential unresolved question was selected first.";
  }
  if (selected) selected.status = "selected";
  return { stage, selected: selected ? [selected] : [], primary: selected, candidates: evaluated };
}
