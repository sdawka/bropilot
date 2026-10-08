// route-utterance: classifies free text that matched none of ScriptedDirector's exact Talk
// commands, picking which registry function should handle it (v4.3, System One). This is the
// router itself, not a screen-facing function — it never produces cues of its own; whichever
// function it dispatches to (via route.ts's fall-through) produces the cues the user sees. The
// stub is today's fall-through: always describe-screen, unsure or not.
import type { Cue, Context } from '../../director.ts';
import type { AIFunctionImpl, DecisionSpec, S1Answers } from '../types.ts';

export interface RouteUtteranceIn { text: string }
export interface RouteUtteranceOut { fn: string }

function stub(): RouteUtteranceOut {
  return { fn: 'describe-screen' };
}

/** No cues of its own: the router only decides which function runs; that function's own toCues
 * produces what the user sees. route.ts never calls this — it's here only so the AIFunctionImpl
 * shape is complete and any generic caller gets an empty (safe) result. */
function toCues(_out: RouteUtteranceOut, _callId: string): Cue[] {
  return [];
}

// 'describe-screen' listed first: FAKE_S1 (agent/system1.ts) picks the first criteria key when
// confident, and describe-screen is the correct safe default for unsure/ambiguous text.
// `agent` (2026-09-28, live session): "which of the three capabilities would you build first, and
// why?" was classified next-decision and got "Next: Summarise it in a paragraph." Advice, judgement
// and open questions about the design now have their own key; route.ts sends it to the director's
// fallback (the Talk agent under RemoteDirector, describe-screen under ScriptedDirector).
const decision: DecisionSpec<RouteUtteranceIn, RouteUtteranceOut> = {
  id: 'route-utterance',
  questions: (input: RouteUtteranceIn, ctx: Context) => ({
    state: { text: input.text, screen: ctx.view },
    questions: {
      fn: {
        type: 'choice',
        instructions: 'Which one function should handle what the user typed? The text matched none of the exact Talk commands. Pick agent when the user wants advice, an opinion, a judgement, a comparison or reasoning about the design (questions like why, which would you, should we, how would you, what do you think) — those need a written reply, not a list item. Pick next-decision only when the user asks which open question to answer next. Pick describe-screen when unsure or when the text names a thing on screen.',
        criteria: {
          'describe-screen': 'Name or explain what is on screen or a node the text mentions',
          agent: 'The user asks for advice, an opinion, a comparison, reasoning, or anything needing a written reply',
          'next-decision': 'The user asks only which open question to work on next ("what next?", "what now?"), not which option, feature or design choice is better or why',
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
