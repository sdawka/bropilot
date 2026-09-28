// route-utterance: classifies free text that matched none of ScriptedDirector's exact Talk
// commands, picking which registry function should handle it (v4.3, System One). This is the
// router itself, not a screen-facing function — it never produces cues of its own; whichever
// function it dispatches to (via scripted.ts's routeFree) produces the cues the user sees. The
// stub is today's fall-through: always describe-screen, unsure or not.
import type { Cue, Context } from '../../director.ts';
import type { AIFunctionImpl, DecisionSpec, S1Answers } from '../types.ts';

export interface RouteUtteranceIn { text: string }
export interface RouteUtteranceOut { fn: string }

function stub(): RouteUtteranceOut {
  return { fn: 'describe-screen' };
}

/** No cues of its own: the router only decides which function runs; that function's own toCues
 * produces what the user sees. scripted.ts never calls this — it's here only so the AIFunctionImpl
 * shape is complete and any generic caller gets an empty (safe) result. */
function toCues(_out: RouteUtteranceOut, _callId: string): Cue[] {
  return [];
}

// 'describe-screen' listed first: FAKE_S1 (agent/system1.ts) picks the first criteria key when
// confident, and describe-screen is the correct safe default for unsure/ambiguous text.
const decision: DecisionSpec<RouteUtteranceIn, RouteUtteranceOut> = {
  id: 'route-utterance',
  questions: (input: RouteUtteranceIn, ctx: Context) => ({
    state: { text: input.text, screen: ctx.view },
    questions: {
      fn: {
        type: 'choice',
        instructions: 'Which one function should handle what the user typed? The text matched none of the exact Talk commands. Pick describe-screen when unsure or when the text names a thing on screen.',
        criteria: {
          'describe-screen': 'Name or explain what is on screen or a node the text mentions',
          'next-decision': 'The user asks what to do next',
          'propose-followup': 'The user asks for a sub-question or follow-up',
          'find-gaps': 'The user asks what is missing or incomplete',
          'consolidate-questions': 'The user asks to fold the open gaps into one question',
          'find-contradictions': 'The user asks what disagrees or conflicts',
          'review-change': 'The user asks to judge or review a task',
          'raise-question': 'The user states something the system should ask them about',
        },
      },
    },
  }),
  decide: (answers: S1Answers) => ({ fn: (answers.fn as { choice: string }).choice }),
};

export const routeUtterance: AIFunctionImpl<RouteUtteranceIn, RouteUtteranceOut> = {
  context: { digest: (ctx) => `view=${ctx.view}` },
  stub,
  toCues,
  decision,
};
