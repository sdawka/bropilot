// RemoteDirector: forwards user turns to the agent server over the bus and does nothing itself.
// The agent replies asynchronously as `cue` messages, applied by directors/index.ts's subscribe handler.
import type { Cue, Director, UserTurn } from '../director';
import { publish, agentId } from '../bus';

export class RemoteDirector implements Director {
  topics() { return [{ id: 'chat', label: 'Talk' }]; }
  start(): Cue[] { return []; }
  onUser(turn: UserTurn): Cue[] {
    if (!agentId) return [{ t: 'say', text: 'No agent connected' }];
    publish({ kind: 'user', turn });
    return [];
  }
}
