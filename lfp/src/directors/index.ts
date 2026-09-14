// Wires the active Director to the bus and the main screen. Runs in the main tab only.
import { watch } from 'vue';
import { state } from '../store';
import { applyCues, tourStep, stopTour, pauseTour, currentContext, onCueApplied, type UserTurn, type Director } from '../director';
import { publish, subscribe, bus, agentId } from '../bus';
import { ScriptedDirector } from './scripted';
import { RemoteDirector } from './remote';
import { kernelDigest } from '../kernel';

let director: Director = new ScriptedDirector();
let started = false;

export function currentDirector() { return director; }

export function topics() { return director.topics(); }

export function startTopic(id: string) {
  state.transcript.push({ who: 'user', text: `▶ ${topics().find((t) => t.id === id)?.label ?? id}`, at: Date.now() });
  applyCues(director.start(id));
  publishContext();
}

function publishSnapshot() {
  publish({ kind: 'snapshot', graph: state.graph, kernel: kernelDigest() });
}

export function handleUser(turn: UserTurn) {
  if ('control' in turn) {
    switch (turn.control) {
      case 'next': pauseTour(); tourStep(1); break;
      case 'back': pauseTour(); tourStep(-1); break;
      case 'stop': stopTour(); state.highlight = { nodes: [], edges: [], focus: null }; break;
      case 'approve': applyCues([{ t: 'commit' }]); break;
      case 'discard': applyCues([{ t: 'discard' }]); break;
      case 'undo': applyCues([{ t: 'undo' }]); break;
    }
    state.transcript.push({ who: 'user', text: `⏵ ${turn.control}`, at: Date.now() });
    publishContext();
    return;
  }
  if ('topic' in turn) { startTopic(turn.topic); return; }
  if ('choice' in turn) { state.transcript.push({ who: 'user', text: turn.choice, at: Date.now() }); state.ask = null; }
  if ('text' in turn) { state.transcript.push({ who: 'user', text: turn.text, at: Date.now() }); if (state.ask) state.ask = null; }
  applyCues(director.onUser(turn));
  publishContext();
}

export function publishContext() {
  publish({ kind: 'context', ctx: currentContext(topics(), bus().label) });
}

/** Call once from App.vue on the main screen. */
export function startDirectorHost() {
  if (started) return; started = true;
  subscribe((m) => {
    if (m.kind === 'user') handleUser(m.turn);
    else if (m.kind === 'hello' && m.role === 'mirror') publishContext();
    else if (m.kind === 'hello' && m.role === 'agent') {
      director = new RemoteDirector();
      publishSnapshot();
      publishContext();
    } else if (m.kind === 'cue' && m.from === agentId) {
      applyCues([m.cue]);
      if (m.msgId) publish({ kind: 'ack', msgId: m.msgId, ctx: currentContext(topics(), bus().label) });
    }
  });
  publish({ kind: 'hello', role: 'main' });
  onCueApplied((cue) => {
    publish({ kind: 'cue', cue });
    if (cue.t === 'commit' || cue.t === 'undo') publishSnapshot();
  });
  // keep mirrors (and the agent) in sync with what is on screen
  watch(
    () => [state.selectedId, state.say, state.ask, state.tour?.i, state.staged?.effects.length, state.highlight, state.graph.nodes.length, state.screen, location.hash],
    publishContext,
    { deep: true },
  );
  window.addEventListener('hashchange', publishContext);
  director.onContext?.(currentContext(topics(), bus().label));
}
