// A scripted Director: a keyword/topic router only. All content — every prompt, template string,
// and stub — lives in src/ai/functions/*; this file just decides *which* AI function to call and
// threads the tiny bit of state a two-step ask needs (which pending function/stage is open) across
// turns. A Flue/LLM director replaces the routing later; the functions stay the same either way.
import { currentContext } from '../director.ts';
import type { Cue, Director, UserTurn } from '../director.ts';
import { runAI } from '../ai/runtime.ts';
import { aiFunction } from '../ai/index.ts';

type Pending =
  | { fn: 'define-term'; stage: 'title' | 'desc'; title?: string }
  | { fn: 'explain-node'; op: 'reword' };

const TOPICS = [
  { id: 'map', label: 'Walk the Map' },
  { id: 'bet', label: 'Explain a bet' },
  { id: 'unrealised', label: "What's not realised?" },
  { id: 'term', label: 'Add a glossary term' },
];

export class ScriptedDirector implements Director {
  private pending: Pending | null = null;

  topics() { return TOPICS; }

  /** Compute a fresh Context on demand — ScriptedDirector isn't handed one per turn (only
   * `onContext` sees it, once, at startup), so it builds its own via the same function the main
   * screen publishes from. */
  private ctx() { return currentContext(this.topics(), 'scripted'); }

  start(topic: string): Cue[] {
    switch (topic) {
      case 'map': return runAI(aiFunction('walk-map'), undefined, this.ctx());
      case 'bet': return runAI(aiFunction('explain-node'), { op: 'explain' }, this.ctx());
      case 'unrealised': return runAI(aiFunction('unrealised-to-tasks'), undefined, this.ctx());
      case 'term':
        this.pending = { fn: 'define-term', stage: 'title' };
        return runAI(aiFunction('define-term'), { stage: 'start' }, this.ctx());
      default:
        return runAI(aiFunction('describe-screen'), { text: topic }, this.ctx());
    }
  }

  onUser(turn: UserTurn): Cue[] {
    if ('choice' in turn) return this.answerPending(turn.choice);
    if (!('text' in turn)) return [];
    return this.pending ? this.answerPending(turn.text) : this.route(turn.text);
  }

  // ── pending two-step asks (define-term, explain-node's reword) ──
  private answerPending(text: string): Cue[] {
    const p = this.pending;
    if (!p) return this.route(text);
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

  // ── free text: a handful of keyword routes, else the describe-screen fallback ──
  private route(text: string): Cue[] {
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
    return runAI(aiFunction('describe-screen'), { text: trimmed }, this.ctx());
  }
}
