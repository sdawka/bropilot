// A scripted Director: the tours plus the shared Talk router (./route.ts). All content — every
// prompt, template string, and stub — lives in src/ai/functions/*. Free text nobody claims goes to
// describe-screen. A Flue/LLM director (./remote.ts) uses the same router with a different fallback.
import { currentContext } from '../director.ts';
import type { Cue, Director, UserTurn } from '../director.ts';
import { runAI } from '../ai/runtime.ts';
import { aiFunction } from '../ai/index.ts';
import { Router } from './route.ts';

const TOPICS = [
  { id: 'map', label: 'Walk the Map' },
  { id: 'bet', label: 'Explain a bet' },
  { id: 'unrealised', label: "What's not realised?" },
  { id: 'term', label: 'Add a glossary term' },
];

export class ScriptedDirector implements Director {
  /** Compute a fresh Context on demand — ScriptedDirector isn't handed one per turn (only
   * `onContext` sees it, once, at startup), so it builds its own via the same function the main
   * screen publishes from. */
  private ctx = () => currentContext(this.topics(), 'scripted');
  private router = new Router(this.ctx);
  private describe = (text: string): Cue[] => runAI(aiFunction('describe-screen'), { text }, this.ctx());

  topics() { return TOPICS; }

  start(topic: string): Cue[] {
    switch (topic) {
      case 'map': return runAI(aiFunction('walk-map'), undefined, this.ctx());
      case 'bet': return runAI(aiFunction('explain-node'), { op: 'explain' }, this.ctx());
      case 'unrealised': return runAI(aiFunction('unrealised-to-tasks'), undefined, this.ctx());
      case 'term': return this.router.beginTerm();
      default: return this.describe(topic);
    }
  }

  onUser(turn: UserTurn): Cue[] {
    if ('choice' in turn) return this.router.answerPending(turn.choice, this.describe);
    if (!('text' in turn)) return [];
    return this.router.routeText(turn.text, this.describe);
  }
}
