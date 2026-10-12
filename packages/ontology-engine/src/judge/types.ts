export type NoulCriteria = { true: string; false: string };
export type ChoiceCriteria = Record<string, string>;
export type ScoreCriteria = string[];
export type Instructions = string | object | unknown[];

/** `benign` is read by the fake provider only and stripped before a question goes on the wire. */
export type NoulQuestion = { type: "noul"; instructions: Instructions; criteria: NoulCriteria; benign?: "yes" | "no" };
export type ChoiceQuestion = { type: "choice"; instructions: Instructions; criteria: ChoiceCriteria; benign?: string };
/** `benign` is a level index into `criteria`. */
export type ScoreQuestion = { type: "score"; instructions: Instructions; criteria: ScoreCriteria; benign?: number };
export type S1Question = NoulQuestion | ChoiceQuestion | ScoreQuestion;
export type S1Questions = Record<string, S1Question>;

export type NoulAnswer = { type: "noul"; noul: number };
export type ChoiceAnswer = { type: "choice"; choice: string; probabilities: Record<string, number>; confidence: number };
export type ScoreAnswer = { type: "score"; score: number; probabilities: Record<string, number>; confidence: number; legend?: unknown };
export type Answer = NoulAnswer | ChoiceAnswer | ScoreAnswer;

export type Usage = { input_tokens: number; output_tokens: number };
export type S1Mode = "http" | "fake" | "off";

export interface S1Reply {
  answers: Record<string, Answer>;
  model: string;
  ms: number;
  usage: Usage;
  provider: string;
}

export interface AskOptions { timeoutMs?: number; retries?: number; backoffMs?: number; cacheKey?: string }

export interface SystemOne {
  mode: S1Mode;
  model: string;
  ask(state: unknown, questions: S1Questions, opts?: AskOptions): Promise<S1Reply>;
}

export interface Thresholds { confident: number; review: number }
export type JudgmentStatus = "confident" | "review" | "unknown";

export interface Provenance {
  /** The replying provider, `off` when nothing could be asked, `error` when the call failed. */
  provider: string;
  model: string;
  stateHash: string;
  questionHash: string;
  thresholds: Thresholds;
  usage?: Usage;
  error?: { name: string; message: string; code?: string; status?: number };
}

export interface Judgment {
  question: string;
  status: JudgmentStatus;
  answer?: string;
  confidence?: number;
}
