// Zips registry.ts's metadata (id, version, purpose, context.needs, prompt, output, feedback,
// source) with functions/*.ts's implementations (context.digest, stub, toCues) by id. Throws at
// import time if the two id sets differ, so a missing/renamed function fails loudly at startup
// rather than silently dropping a topic. Browser code should import AI functions from here, never
// from registry.ts directly (registry.ts is the Node-runnable metadata half — see Import rules).
import { AI_FUNCTIONS as AI_FUNCTION_META } from './registry.ts';
import type { AIFunctionDef, AIFunctionImpl } from './types.ts';
import { describeScreen } from './functions/describe-screen.ts';
import { nextDecision } from './functions/next-decision.ts';
import { answerToEffects } from './functions/answer-to-effects.ts';
import { proposeFollowup } from './functions/propose-followup.ts';
import { explainNode } from './functions/explain-node.ts';
import { walkMap } from './functions/walk-map.ts';
import { findGaps } from './functions/find-gaps.ts';
import { unrealisedToTasks } from './functions/unrealised-to-tasks.ts';
import { defineTerm } from './functions/define-term.ts';
import { reviewChange } from './functions/review-change.ts';
import { raiseQuestion } from './functions/raise-question.ts';
import { consolidateQuestions } from './functions/consolidate-questions.ts';
import { findContradictions } from './functions/find-contradictions.ts';

const impls: Record<string, AIFunctionImpl<any, any>> = {
  'describe-screen': describeScreen,
  'next-decision': nextDecision,
  'answer-to-effects': answerToEffects,
  'propose-followup': proposeFollowup,
  'explain-node': explainNode,
  'walk-map': walkMap,
  'find-gaps': findGaps,
  'unrealised-to-tasks': unrealisedToTasks,
  'define-term': defineTerm,
  'review-change': reviewChange,
  'raise-question': raiseQuestion,
  'consolidate-questions': consolidateQuestions,
  'find-contradictions': findContradictions,
};

const metaIds = AI_FUNCTION_META.map((f) => f.id).sort();
const implIds = Object.keys(impls).sort();
if (metaIds.join(',') !== implIds.join(',')) {
  throw new Error(`ai/index: registry ids [${metaIds.join(', ')}] don't match implementation ids [${implIds.join(', ')}]`);
}

/** The full AI-function defs: metadata + implementation, merged by id. */
export const AI_FUNCTIONS: AIFunctionDef[] = AI_FUNCTION_META.map((meta) => {
  const impl = impls[meta.id];
  return { ...meta, ...impl, context: { ...meta.context, ...impl.context } } as AIFunctionDef;
});

const byId: Record<string, AIFunctionDef> = Object.fromEntries(AI_FUNCTIONS.map((f) => [f.id, f]));

export function aiFunction(id: string): AIFunctionDef {
  const fn = byId[id];
  if (!fn) throw new Error(`ai/index: unknown AI function "${id}"`);
  return fn;
}
