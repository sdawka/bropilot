// The one Talk router, shared by ScriptedDirector and RemoteDirector. All content — every prompt,
// template string, and stub — lives in src/ai/functions/*; this file only decides *which* AI
// function handles a line of text and threads the tiny bit of state a two-step ask needs (which
// pending function/stage is open) across turns.
//
// Order: a pending two-step ask claims the next line; else an exact command regex; else, when
// System One is on, `route-utterance` (Jev) picks a registry function. Anything nobody claims —
// including route-utterance choosing `agent` or `describe-screen`, a low-confidence answer, a timeout or an
// error — goes to the caller's `fallback`: describe-screen for ScriptedDirector, "publish the turn to
// the agent" for RemoteDirector. So exact commands and confident routes run locally on both.
import { applyCues } from '../director.ts';
import type { Context, Cue } from '../director.ts';
import { runAI } from '../ai/runtime.ts';
import { aiFunction } from '../ai/index.ts';
import { decideGated, system1Enabled } from '../ai/system1.ts';
import { state, persist, nodeById, type AICall } from '../store.ts';

/** Advice, judgement and open design questions ("which … would you build first, and why?", "should
 * we …", "what do you think"). route-utterance offers an `agent` key for these; this is the
 * deterministic backstop when Jev still picks next-decision (the live failure of 2026-09-28): a
 * next-decision answer on such text goes to the fallback instead. The bare "what next" commands
 * never reach here (exact regex above). */
const JUDGEMENT = /\b(why|which\b.*\b(would|should|first|better|best)|should (we|i)|would you|do you think|recommend|opinion|compare|versus|trade-?offs?|pros and cons|worth)\b/i;
/** "what should I do next?" is still next-decision: a `next` with no `why` keeps the classification. */
const isJudgement = (text: string) => JUDGEMENT.test(text) && (/\bwhy\b/i.test(text) || !/\bnext\b/i.test(text));

/** What to do with text neither a regex nor a confident route-utterance answer claims. Its cues are
 * returned synchronously on the fast path, or applied via applyCues when route-utterance settles. */
export type Fallback = (text: string) => Cue[];

type Pending =
  | { fn: 'define-term'; stage: 'title' | 'desc'; title?: string }
  | { fn: 'explain-node'; op: 'reword' };

export class Router {
  private pending: Pending | null = null;

  /** `ctx` builds a fresh Context on demand (the async route-utterance branch reads it again when
   * the answer lands, so the dispatched function sees the screen as it is then). */
  private readonly ctx: () => Context;
  constructor(ctx: () => Context) { this.ctx = ctx; }

  /** True while a two-step ask (define-term, explain-node reword) is waiting for its next line. */
  hasPending() { return this.pending !== null; }

  /** Starts define-term's two-step ask (the "Add a glossary term" topic). */
  beginTerm(): Cue[] {
    this.pending = { fn: 'define-term', stage: 'title' };
    return runAI(aiFunction('define-term'), { stage: 'start' }, this.ctx());
  }

  /** Routes one line of text (a typed turn or a choice with nothing pending). */
  routeText(text: string, fallback: Fallback): Cue[] {
    return this.pending ? this.answerPending(text, fallback) : this.route(text, fallback);
  }

  // ── pending two-step asks (define-term, explain-node's reword) ──
  answerPending(text: string, fallback: Fallback): Cue[] {
    const p = this.pending;
    if (!p) return this.route(text, fallback);
    if (p.fn === 'define-term') {
      if (p.stage === 'title') {
        this.pending = { fn: 'define-term', stage: 'desc', title: text.trim() };
        return runAI(aiFunction('define-term'), { stage: 'title', text }, this.ctx());
      }
      this.pending = null;
      return runAI(aiFunction('define-term'), { stage: 'desc', text, title: p.title ?? '' }, this.ctx());
    }
    // explain-node reword: the ask cue already pointed at (and thus selected) the bet, so the
    // stub reads it back off ctx.selectedId — no extra state to carry here.
    this.pending = null;
    return runAI(aiFunction('explain-node'), { op: 'reword-apply', text }, this.ctx());
  }

  // ── free text: a handful of keyword routes, else route-utterance, else the fallback ──
  private route(text: string, fallback: Fallback): Cue[] {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();
    const editBet = lower.match(/^edit bet[:\s]+(.+)$/);
    if (editBet) {
      this.pending = { fn: 'explain-node', op: 'reword' };
      const cues = runAI(aiFunction('explain-node'), { op: 'reword-start', hint: editBet[1] }, this.ctx());
      if (!cues.some((c) => c.t === 'ask')) this.pending = null; // no matching bet found: nothing pending after all
      return cues;
    }
    if (/^(what next|next)$/.test(lower)) return runAI(aiFunction('next-decision'), undefined, this.ctx());
    if (/^follow\s?up$/.test(lower)) return runAI(aiFunction('propose-followup'), {}, this.ctx());
    if (/^(back|stop)$/.test(lower)) return [];
    if (/^gaps$/.test(lower)) return runAI(aiFunction('find-gaps'), undefined, this.ctx());

    if (/^consolidate$/.test(lower)) {
      const ctx = this.ctx();
      if (ctx.next?.source !== 'violation') return [{ t: 'say', id: `s-consolidate-${Date.now()}`, text: 'Nothing to consolidate.' }];
      return runAI(aiFunction('consolidate-questions'), { followupId: ctx.next.id }, ctx);
    }
    if (/^contradictions?$/.test(lower)) return runAI(aiFunction('find-contradictions'), undefined, this.ctx());

    const review = trimmed.match(/^review\s+(task-\S+)/i);
    if (review) return runAI(aiFunction('review-change'), { taskId: review[1] }, this.ctx());

    const raise = trimmed.match(/^raise(?: on (task-\S+))?[:\s]+(.+)$/i);
    if (raise) return runAI(aiFunction('raise-question'), { taskId: raise[1], missing: raise[2] }, this.ctx());

    const revalidate = trimmed.match(/^revalidate\s+(.+)$/i);
    if (revalidate) {
      const node = this.findByTitle(revalidate[1]);
      if (!node) return [{ t: 'say', id: `s-revalidate-${Date.now()}`, text: `Couldn't find a node titled "${revalidate[1]}".` }];
      return [{ t: 'revalidate', nodeId: node.id }];
    }

    return this.routeFree(trimmed, fallback);
  }

  /** Exact commands never pay the round trip; only fall-through text is classified. When a
   * System One client is on the bus, Jev classifies which function should handle it
   * (route-utterance); `describe-screen`, a low-confidence answer, a timeout, or an error all go to
   * the fallback. */
  private routeFree(trimmed: string, fallback: Fallback): Cue[] {
    if (!system1Enabled()) return fallback(trimmed);

    const routeFn = aiFunction('route-utterance');
    const ctx = this.ctx();
    const req = routeFn.decision?.questions({ text: trimmed }, ctx) ?? null;
    if (!req) return fallback(trimmed);

    const fnQuestion = req.questions.fn;
    const criteriaKeys = fnQuestion.type === 'choice' ? Object.keys(fnQuestion.criteria) : [];

    const callId = `call-route-utterance-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const pendingSayId = `${callId}-s0`;
    const pending: AICall = {
      id: callId,
      fn: 'route-utterance',
      version: routeFn.version,
      runtime: 'system1',
      at: Date.now(),
      contextDigest: routeFn.context.digest(ctx),
      input: trimmed,
      output: '',
      cueIds: [],
      status: 'pending',
    };
    state.aiCalls.push(pending);
    persist();

    decideGated('route-utterance', req).then(
      (res) => {
        const answer = res.answers.fn;
        const chosen = answer?.type === 'choice' ? answer.choice : undefined;
        if (res.ok && chosen && criteriaKeys.includes(chosen)) {
          this.updateAICall(callId, { runtime: 'system1', confidence: res.confidence, model: res.model, costUsd: res.costUsd, output: chosen, status: 'ok' });
          applyCues(this.dispatch(chosen, trimmed, fallback));
        } else {
          this.updateAICall(callId, { runtime: 'stub', fallback: 'low-confidence', confidence: res.confidence, model: res.model, costUsd: res.costUsd, status: 'ok' });
          applyCues(fallback(trimmed));
        }
      },
      (err: unknown) => {
        const reason = err instanceof Error ? err.message : String(err);
        this.updateAICall(callId, { runtime: 'stub', fallback: /timed out/.test(reason) ? 'timeout' : 'error', status: 'ok' });
        applyCues(fallback(trimmed));
      },
    );

    return [{ t: 'say', id: pendingSayId, text: 'Deciding…', transient: true }];
  }

  /** Dispatches the function route-utterance classified, with the args each one needs — mirrors
   * the args the regex branches above already pass their own functions. `agent`, `describe-screen`
   * (and a review with no task in view, or next-decision on JUDGEMENT text) are not claims: they go
   * to the fallback. */
  private dispatch(fn: string, text: string, fallback: Fallback): Cue[] {
    const ctx = this.ctx();
    switch (fn) {
      case 'next-decision':
        if (isJudgement(text)) return fallback(text);
        return runAI(aiFunction('next-decision'), undefined, ctx);
      case 'propose-followup': return runAI(aiFunction('propose-followup'), {}, ctx);
      case 'find-gaps': return runAI(aiFunction('find-gaps'), undefined, ctx);
      case 'find-contradictions': return runAI(aiFunction('find-contradictions'), undefined, ctx);
      case 'consolidate-questions':
        if (ctx.next?.source !== 'violation') return [{ t: 'say', id: `s-consolidate-${Date.now()}`, text: 'Nothing to consolidate.' }];
        return runAI(aiFunction('consolidate-questions'), { followupId: ctx.next.id }, ctx);
      case 'review-change': {
        const next = ctx.next;
        const isTask = !!next && nodeById(next.id)?.kind === 'task';
        if (next && isTask) return runAI(aiFunction('review-change'), { taskId: next.id }, ctx);
        return fallback(text);
      }
      case 'raise-question': return runAI(aiFunction('raise-question'), { missing: text }, ctx);
      // advice / judgement / an open question: the director's fallback (the agent under Remote,
      // describe-screen under Scripted) — never a local function that answers with a list item
      case 'agent':
      case 'describe-screen':
      default:
        return fallback(text);
    }
  }

  private updateAICall(callId: string, patch: Partial<AICall>) {
    const call = state.aiCalls.find((c) => c.id === callId);
    if (!call) return;
    Object.assign(call, patch);
    persist();
  }

  /** Best-effort title lookup (no AI call): exact case-insensitive match first, else substring
   * either direction, longest title wins — same heuristic as describe-screen's stub. */
  private findByTitle(text: string) {
    const q = text.trim().toLowerCase();
    const exact = state.graph.nodes.find((n) => n.title.toLowerCase() === q);
    if (exact) return exact;
    return state.graph.nodes
      .filter((n) => n.title.toLowerCase().includes(q) || q.includes(n.title.toLowerCase()))
      .sort((a, b) => b.title.length - a.title.length)[0];
  }
}
