// propose-followup: given a question or a selected node, proposes one sub-question. Stub is a
// fixed template; a real model would read the parent's content and propose something concrete.
import { nodeById } from '../../store.ts';
import type { Cue, Context } from '../../director.ts';
import type { AIFunctionImpl } from '../types.ts';

export interface ProposeFollowupIn { parentId?: string }
export interface ProposeFollowupOut { parentId: string; label: string; prompt: string }

function stub(input: ProposeFollowupIn, ctx: Context): ProposeFollowupOut {
  const parentId = input.parentId ?? ctx.selectedId ?? ctx.next?.questionId ?? '';
  const label = nodeById(parentId)?.title ?? ctx.next?.prompt ?? parentId;
  return { parentId, label, prompt: `What is a concrete example of ${label}?` };
}

function toCues(out: ProposeFollowupOut, _callId: string): Cue[] {
  if (!out.parentId) return [];
  return [{ t: 'followup', parentId: out.parentId, prompt: out.prompt, kind: 'sub' }];
}

export const proposeFollowup: AIFunctionImpl<ProposeFollowupIn, ProposeFollowupOut> = {
  context: { digest: (ctx) => `selection=${ctx.selectedId ?? 'none'} next=${ctx.next?.questionId ?? 'none'}` },
  stub,
  toCues,
};
