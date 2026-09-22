// consolidate-questions: rewrites a consolidated (group) follow-up's deterministic message ("N
// gaps about «title»: …" plus member lines, from src/consolidate.ts::groupViolations, Agent A) as
// one question a user can answer in a single sentence. Triggered by the `consolidate` text command
// (directors/scripted.ts) on the current tier-3 Now item. v4.2 (plan: "Agent B — AI functions").
import { nodeById } from '../../store.ts';
import type { Cue, Context } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';

export interface ConsolidateQuestionsIn { followupId: string }
export interface ConsolidateQuestionsOut {
  prompt: string;
  options: string[];
  answersAll: boolean;
  /** Which follow-up to refine — carried on the output (not just the input) so `toCues` can build
   * the `refine` cue without needing the original input. Optional because a real model's JSON (or
   * the FAKE_AI canned output) may omit it — `toCues` degrades to a plain `say` in that case. */
  followupId?: string;
  count?: number; // number of member gaps folded into `prompt`, for the confirmation line
}

/** Deterministic group message shape (src/consolidate.ts): first line is the summary, following
 * lines are "- <member message>". Split those back out so the stub has something to fold into one
 * sentence without re-deriving the grouping logic itself. */
function memberLinesOf(message: string): string[] {
  return message
    .split('\n')
    .slice(1)
    .map((l) => l.replace(/^-\s*/, '').trim())
    .filter(Boolean);
}

function stub(input: ConsolidateQuestionsIn, ctx: Context): ConsolidateQuestionsOut {
  const item = ctx.next && ctx.next.id === input.followupId ? ctx.next : null;
  if (!item) return { prompt: 'Nothing to consolidate.', options: [], answersAll: false, followupId: input.followupId };

  const title = item.subjects.length ? (nodeById(item.subjects[0])?.title ?? item.subjects[0]) : 'this';
  const members = memberLinesOf(item.prompt);
  const options = [...new Set(item.options ?? [])].slice(0, 4);
  // Fold each member line into a clause about "it": drop the title and kind tag, the trailing "?"/".".
  const clause = (m: string) => {
    const esc = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return m.replace(new RegExp(`"${esc}"( \\([\\w-]+\\))?`, 'g'), 'it').replace(/[?.]\s*$/, '').trim();
  };
  const prompt = members.length >= 2
    ? `One answer for ${members.length} gaps about "${title}": ${members.map(clause).join('; ')}. Is it meant to stand alone as it is, or should it get all of these?`
    : item.prompt;
  const count = members.length || 1;
  return { prompt, options, answersAll: true, followupId: input.followupId, count };
}

function toCues(out: ConsolidateQuestionsOut, callId: string): Cue[] {
  if (!out.followupId) return [{ t: 'say', id: `${callId}-s1`, text: out.prompt }];
  const text = out.answersAll
    ? `Rewrote ${out.count ?? 1} gap${(out.count ?? 1) === 1 ? '' : 's'} as one question.`
    : `Rewrote part of the question — it may not cover every gap.`;
  return [
    { t: 'refine', followupId: out.followupId, prompt: out.prompt, options: out.options.length ? out.options : undefined },
    { t: 'say', id: `${callId}-s1`, text },
  ];
}

export const consolidateQuestions: AIFunctionImpl<ConsolidateQuestionsIn, ConsolidateQuestionsOut> = {
  context: { digest: (ctx) => `next=${ctx.next?.id ?? 'none'} tier=${ctx.next?.tier ?? 'none'}` },
  stub,
  toCues,
};
