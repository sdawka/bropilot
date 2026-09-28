// RemoteDirector: the shared Talk router (./route.ts) runs first, locally — exact commands, pending
// two-step asks and confident route-utterance answers never cost a model turn. Only what nobody
// claims is forwarded to the agent server over the bus; it replies asynchronously as `cue` messages,
// applied by directors/index.ts's subscribe handler.
import { currentContext } from '../director.ts';
import type { Cue, Director, UserTurn } from '../director.ts';
import { publish, agentId } from '../bus';
import { Router } from './route.ts';

export class RemoteDirector implements Director {
  private router = new Router(() => currentContext(this.topics(), 'remote'));

  topics() { return [{ id: 'chat', label: 'Talk' }]; }
  start(): Cue[] { return []; }

  onUser(turn: UserTurn): Cue[] {
    // The agent always receives the original turn (a choice stays a choice), even when the router
    // only gives up after route-utterance settles. handleUser already put the text in the transcript.
    const toAgent = (): Cue[] => {
      if (!agentId) return [{ t: 'say', text: 'No agent connected' }];
      publish({ kind: 'user', turn });
      return [];
    };
    if ('choice' in turn) return this.router.hasPending() ? this.router.answerPending(turn.choice, toAgent) : toAgent();
    if ('text' in turn) return this.router.routeText(turn.text, toAgent);
    return toAgent();
  }
}
