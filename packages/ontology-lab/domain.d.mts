import type { ReadinessEvaluation, WorldSnapshot, WorldTemplate } from "../contracts/index.ts";

export type LabMessage = { id: string; role: "user" | "assistant"; text: string };
export type LabEvidence = { messageId: string; quote: string };
export type LabAssertion = "declared" | "proposal";
export type LabProposal = {
  title: string; purpose: string; evidence: LabEvidence[];
  entities: Array<{ id: string; kind: string; title: string; parentId: string | null; properties: Array<{ key: string; value: string }>; evidence: LabEvidence[]; assertion: LabAssertion }>;
  relations: Array<{ id: string; kind: string; fromId: string; toId: string; evidence: LabEvidence[]; assertion: LabAssertion }>;
  questions: string[];
};
export type LabQuestionCard = { id: string; text: string; why: string; objectIds: string[]; findingIds: string[] };
export type QuestionCard = LabQuestionCard;
export type LabEvent = { id: string; seq: number; time: string; kind: string; actor: "input" | "extractor" | "mapper" | "criteria" | "feedback"; title: string; detail: string; targets: { messageIds: string[]; objectIds: string[]; relationIds: string[]; findingIds: string[] }; snapshot: WorldSnapshot | null; evaluation: ReadinessEvaluation | null; questions: string[]; questionCards?: LabQuestionCard[] };
export const extractionSchema: Record<string, unknown>;
export function validateProposal(proposal: LabProposal, messages: LabMessage[], template: WorldTemplate): LabProposal;
export function createDraft(baseFixture: WorldSnapshot, runId: string): WorldSnapshot;
export function applyProposal(baseFixture: WorldSnapshot, runId: string, proposal: LabProposal, messages: LabMessage[]): { snapshot: WorldSnapshot; changes: { objectIds: string[]; relationIds: string[]; thingIds: string[] } };
export function feedbackFromEvaluation(evaluation: ReadinessEvaluation): Array<{ id: string; severity: string; message: string; question: string; objectIds: string[] }>;
export function planQuestions(evaluation: ReadinessEvaluation, snapshot: WorldSnapshot, extractionQuestions?: string[]): LabQuestionCard[];
export const feedbackQuestions: typeof feedbackFromEvaluation;
export const buildDraft: typeof applyProposal;
export function createLabEvent(event: Omit<LabEvent, "time" | "detail" | "targets" | "snapshot" | "evaluation" | "questions" | "questionCards"> & Partial<Pick<LabEvent, "time" | "detail" | "targets" | "snapshot" | "evaluation" | "questions" | "questionCards">>): LabEvent;
export const EXAMPLE_MESSAGES: LabMessage[];
export const EXAMPLE_PROPOSAL: LabProposal;
