// Wires the active Director to the bus and the main screen. Runs in the main tab only.
import { watch } from 'vue';
import { state, persist, rankOpen, nextQuestion, type AICall } from '../store';
import { applyCues, tourStep, stopTour, pauseTour, currentContext, onCueApplied, type UserTurn, type Director } from '../director';
import { publish, subscribe, bus, agentId } from '../bus';
import { ScriptedDirector } from './scripted';
import { RemoteDirector } from './remote';
import { kernelDigest } from '../kernel';
import { runAI } from '../ai/runtime.ts';
import { aiFunction } from '../ai/index.ts';

const genAiCallId = () => `call-agent-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

/** Records an `aicall` bus message (published by agent/server.mjs for a Talk turn, not through
 * `runAI`) into `state.aiCalls`, so Kernel.vue's AI-calls table shows model/cost for those too. */
function recordAgentCall(m: Extract<import('../bus').BusMessage, { kind: 'aicall' }>) {
  const call: AICall = {
    id: genAiCallId(),
    fn: `agent:${m.fn}`,
    version: 'flue',
    runtime: 'flue',
    at: m.at,
    contextDigest: m.conversationId,
    input: '',
    output: '',
    cueIds: [],
    model: m.model,
    costUsd: m.usage?.costUsd,
    status: 'ok',
  };
  state.aiCalls.push(call);
  persist();
}

let director: Director = new ScriptedDirector();
let started = false;

export function currentDirector() { return director; }

export function topics() { return director.topics(); }

export function startTopic(id: string) {
  state.transcript.push({ who: 'user', text: `▶ ${topics().find((t) => t.id === id)?.label ?? id}`, at: Date.now() });
  applyCues(director.start(id));
  publishContext();
}

/** The graph + kernel the agent server reads, plus `sessionId` so it can start a fresh
 * conversation when the design session changes (Reset to seed). */
export function publishSnapshot() {
  publish({ kind: 'snapshot', graph: state.graph, kernel: kernelDigest(), sessionId: state.sessionId });
}

/** Is `id` an open item (a Now-strip question), as opposed to an `ask` cue's id? */
const isOpenItem = (id: string) => nextQuestion.value?.id === id || rankOpen().some((i) => i.id === id);

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
  // Answering is code, not a model call: "Answer it" + text (forItem) or a Now-strip option (a
  // choice for an open item) stages the answer, no director turn. Choices on an `ask` cue still
  // go to the director.
  const answerFor = 'text' in turn ? turn.forItem : 'choice' in turn && isOpenItem(turn.forAsk) ? turn.forAsk : undefined;
  if (answerFor) {
    const content = 'text' in turn ? turn.text : turn.choice;
    state.transcript.push({ who: 'user', text: content, at: Date.now() });
    applyCues([{ t: 'answer', questionId: answerFor, content }]);
    linkLatestAnswer();
    publishContext();
    return;
  }
  if ('choice' in turn) { state.transcript.push({ who: 'user', text: turn.choice, at: Date.now() }); state.ask = null; }
  if ('text' in turn) { state.transcript.push({ who: 'user', text: turn.text, at: Date.now() }); if (state.ask) state.ask = null; }
  applyCues(director.onUser(turn));
  publishContext();
}

/** After an answer is staged (by "Answer it" or the agent's `answer` cue): propose the edges for
 * the new nodes and append them to the same changeset (link-answer, AGENT-RUNTIME.md §9). Without
 * this every template answer lands as orphans. Async: the stage cue lands a moment later, unless
 * the user already approved. */
function linkLatestAnswer() {
  const answerId = state.answers.at(-1)?.id;
  if (!answerId || !state.staged) return;
  applyCues(runAI(aiFunction('link-answer'), { answerId }, currentContext(topics(), bus().label)));
}

export function publishContext() {
  publish({ kind: 'context', ctx: currentContext(topics(), bus().label) });
}

/** Call once from App.vue on the main screen. */
export function startDirectorHost() {
  if (started) return; started = true;
  const offBus = subscribe((m) => {
    if (m.kind === 'user') handleUser(m.turn);
    else if (m.kind === 'hello' && m.role === 'mirror') publishContext();
    else if (m.kind === 'hello' && m.role === 'agent') {
      director = new RemoteDirector();
      publishSnapshot();
      publishContext();
    } else if (m.kind === 'cue' && m.from === agentId) {
      applyCues([m.cue]);
      if (m.cue.t === 'answer') linkLatestAnswer();
      if (m.msgId) publish({ kind: 'ack', msgId: m.msgId, ctx: currentContext(topics(), bus().label) });
    } else if (m.kind === 'aicall') {
      recordAgentCall(m);
    } else if (m.kind === 'system1-ready') {
      state.system1Ready = m.ready;
      state.system1Mode = m.mode;
    }
  });
  publish({ kind: 'hello', role: 'main' });
  const offCues = onCueApplied((cue) => {
    publish({ kind: 'cue', cue });
    if (cue.t === 'commit' || cue.t === 'undo') publishSnapshot();
  });
  // keep mirrors (and the agent) in sync with what is on screen
  const stopWatch = watch(
    () => [state.selectedId, state.say, state.ask, state.tour?.i, state.staged?.effects.length, state.highlight, state.graph.nodes.length, state.screen, location.hash],
    publishContext,
    { deep: true },
  );
  window.addEventListener('hashchange', publishContext);
  director.onContext?.(currentContext(topics(), bus().label));
  // Vite hot reload re-runs this module with `started` reset while bus.ts and director.ts keep
  // their listener sets, so without this every cue was echoed (and every agent say applied) twice
  // after any edit during a live session. Found 2026-09-28: doubled approvals in the agent's
  // catch-up note and one reply shown as two transcript lines.
  if (import.meta.hot) import.meta.hot.dispose(() => { offBus(); offCues(); stopWatch(); window.removeEventListener('hashchange', publishContext); });
}
