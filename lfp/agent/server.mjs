// LAN relay so a phone can be the mirror: rebroadcasts every WebSocket message to all other
// clients (verbatim behaviour + printed URLs from the old relay.mjs). When ANTHROPIC_API_KEY is
// set (in the environment, or in a gitignored .env at the project root), this process *also*
// joins its own bus as a client with role 'agent' and drives a Flue "Talk" conversation per design session (agent/talk.ts)
// that turns `user` turns into `cue`s — see /Users/sdawka/.claude/plans/let-s-centralize-the-interaction-staged-mochi.md.
//
// Without a key this behaves exactly like `npm run relay` did: pure rebroadcast, no agent hello.
import { WebSocketServer, WebSocket } from 'ws';
import { networkInterfaces } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';

const PORT = 5200;

// ── .env (gitignored) — only the keys not already set in the shell win ─────────────────────────
function loadDotEnv() {
  const path = join(process.cwd(), '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const s = line.trim();
    if (!s || s.startsWith('#')) continue;
    const eq = s.indexOf('=');
    if (eq === -1) continue;
    const key = s.slice(0, eq).trim();
    let value = s.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, ''); // inline `KEY=value # note`, as node --env-file reads it
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv();

// ── the relay: rebroadcast every message to every other client ─────────────────────────────────
const wss = new WebSocketServer({ port: PORT });
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('message', (data) => {
    const s = data.toString();
    for (const c of clients) if (c !== ws && c.readyState === 1) c.send(s);
  });
  ws.on('close', () => clients.delete(ws));
});

const lan = Object.values(networkInterfaces()).flat().find((i) => i && i.family === 'IPv4' && !i.internal)?.address ?? 'localhost';
console.log(`relay on ws://${lan}:${PORT}`);
console.log(`main screen:  http://${lan}:5199/#overview?relay=${lan}`);
console.log(`phone mirror: http://${lan}:5199/#mirror?relay=${lan}`);

// ── the agent: only when a key is configured ────────────────────────────────────────────────────
// Provider choice lives in agent/agents/from-spec.ts (modelFor): OpenRouter when OPENROUTER_API_KEY is
// set, direct Anthropic when only ANTHROPIC_API_KEY is. Without either this is a plain relay.
// System One (v4.3, AGENT-RUNTIME.md §9): typed decisions over the same bus. Independent of the
// Talk agent — a TYPESAFE_API_KEY, the OPENROUTER_API_KEY (Jev is on OpenRouter too) or FAKE_S1=1
// is enough to answer system1-request messages.
const { system1Mode, system1Provider } = await import('./system1.ts');
const s1Mode = system1Mode();
console.log(`system1: ${s1Mode}${s1Mode === 'live' ? ` via ${system1Provider()}` : ''}${s1Mode === 'off' ? ' (set TYPESAFE_API_KEY or OPENROUTER_API_KEY, or FAKE_S1=1, in lfp/.env)' : ''}`);

if (process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY) {
  await runAgent();
} else if (process.env.FAKE_AI === '1' || s1Mode !== 'off') {
  if (process.env.FAKE_AI === '1') console.log('FAKE_AI=1, no model key — running the AI-function relay with canned output only (no Talk agent, no Flue conversation).');
  else console.log('no model key — running the System One service only (no Talk agent).');
  await runServicesOnly();
} else {
  console.log('no model key — running as a plain relay (no agent).');
  console.log('  set OPENROUTER_API_KEY (preferred, one key for every tier) or ANTHROPIC_API_KEY in lfp/.env to enable the Talk agent.');
  console.log('  set FAKE_AI=1 instead to exercise ai-request/ai-response with canned output and no key (what smoke uses).');
}

// ── critique points (backlog item 7; AGENT-RUNTIME.md §3 "Critique points") ────────────────────
// The main screen publishes `{ kind: 'critique', answerId, questionId, question, answer }` when a
// commit newly commits the answer to q-outcome / q-capability / q-summary under the RemoteDirector.
// It becomes one Talk turn whose message is this note (no user message). Same static prompt, same
// signals, same tools: the note is the only thing that differs from a user turn. At most one per
// answerId for the life of this process (the browser dedupes too).
const clipNote = (text, n) => { const t = String(text ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
function critiqueNote(msg) {
  return `[Critique point after ${msg.questionId} — no user message. The founder just committed "${clipNote(msg.answer, 200)}" as the answer to "${clipNote(msg.question, 120)}". Read the graph digest (the latest graph signal), name the weakest link in the design in 3 sentences or fewer, and stage the one change that fixes it in this same turn: stage first, then say once what you staged and why. If nothing is weak, say so in one sentence and stage nothing. Use only point, stage and say; call read_graph only if the digest cut off a node you need.]`;
}
const critiqued = new Set(); // answerIds already critiqued
/** True the first time an answerId is seen; logs and drops a repeat. */
function claimCritique(msg) {
  if (!msg?.answerId || critiqued.has(msg.answerId)) { console.log(`[critique] ${msg?.answerId ?? '(no answerId)'} already critiqued — dropped`); return false; }
  critiqued.add(msg.answerId);
  return true;
}

/** The System One service on a bus client: answers system1-request, announces itself with
 * system1-ready at connect and again for every main-screen hello (the browser may load after us). */
async function attachSystem1(ws, send, onMainHello) {
  const { createSystem1Service } = await import('./system1-service.ts');
  const service = createSystem1Service({ send });
  const ready = () => send({ kind: 'system1-ready', ready: s1Mode !== 'off', mode: s1Mode });
  ready();
  return (msg) => {
    if (msg.kind === 'system1-request') { service.handle(msg).catch((err) => console.error('[system1-service] handle failed:', err)); return true; }
    if (msg.kind === 'hello' && msg.role === 'main') { ready(); onMainHello?.(); return true; }
    return false;
  };
}

// ── no model key: the ai-request (FAKE_AI) and/or system1-request services, no Flue conversation ──
async function runServicesOnly() {
  const clientId = `agent-fake-${Math.random().toString(36).slice(2, 8)}`;
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  const send = (msg) => ws.send(JSON.stringify({ ...msg, from: clientId }));
  // Only a FAKE_AI service says hello as an agent (the main screen switches to RemoteDirector on
  // that hello); the System One service alone must not — the ScriptedDirector keeps routing.
  const helloAsAgent = () => ws.send(JSON.stringify({ kind: 'hello', role: 'agent', from: clientId }));
  if (process.env.FAKE_AI === '1') helloAsAgent();
  const aiService = process.env.FAKE_AI === '1' ? (await import('./ai-service.ts')).createAiService({ send }) : null;
  // re-hello on every main-screen hello, like the Flue branch: a page loaded after us must still switch to RemoteDirector
  const handleS1 = await attachSystem1(ws, send, process.env.FAKE_AI === '1' ? helloAsAgent : undefined);
  console.log(`${process.env.FAKE_AI === '1' ? 'fake-AI service' : 'System One service'} connected to the bus as`, clientId);

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    // Same as the Flue branch: a main screen that loads after us must still hear an agent hello, or
    // it stays on the ScriptedDirector. Only the FAKE_AI service is an agent; System One alone is not.
    if (msg.kind === 'hello' && msg.role === 'main' && process.env.FAKE_AI === '1') ws.send(JSON.stringify({ kind: 'hello', role: 'agent', from: clientId }));
    if (handleS1(msg)) return;
    // FAKE_AI has no Talk conversation: a critique point gets one canned say, so smoke can see the
    // whole path (browser publish → server dedupe → cue in the transcript) without a key.
    if (msg.kind === 'critique' && process.env.FAKE_AI === '1') {
      if (!claimCritique(msg)) return;
      console.log('[dispatch] reason=critique', JSON.stringify(critiqueNote(msg)));
      console.log('[turn] fake reason=critique in=0 out=0 cost=$0.0000');
      ws.send(JSON.stringify({ kind: 'cue', cue: { t: 'say', text: `Critique (fake) after ${msg.questionId}: nothing to stage.` }, msgId: `m-${Date.now().toString(36)}`, from: clientId }));
      return;
    }
    if (msg.kind === 'ai-request' && aiService) { console.log(`[ai-request] ${msg.fn} ${msg.id}`); aiService.handle(msg).catch((err) => console.error('[ai-service] handle failed:', err)); }
  });
}

async function runAgent() {
  const { start, sqlite } = await import('@flue/runtime/node');
  const { init, observe } = await import('@flue/runtime');
  const { busRef } = await import('./bus-ref.ts');
  const { Talk, setTurnSignals, graphDigest } = await import('./talk.ts');
  const { Builder } = await import('./agents/builder.ts');
  const { Reviewer } = await import('./agents/reviewer.ts');
  const { modelFor } = await import('./agents/from-spec.ts');
  const { AGENTS } = await import('../src/agents.ts');
  const { AiFunction, createAiService } = await import('./ai-service.ts');

  // Every top-level agent (spec.hosting === 'top') is registered; delegates are declared inside Talk.
  // AiFunction is the Stage 3-B structured-call runner (docs/AGENT-RUNTIME.md §7) — a fresh instance
  // per ai-request, never a delegate (delegates can't call useModel/harness.prompt on their own model).
  // Conversations persist in agent/.flue/ (gitignored) so a builder task survives a server restart.
  await start({ agents: [Talk, Builder, Reviewer, AiFunction], db: sqlite('agent/.flue/flue.sqlite') });
  // One conversation per design session, shared by the main screen and every mirror. A single
  // 'talk' id outlived the design: after the user wiped the graph the agent still talked about the
  // old one (found 2026-09-28 driving a design session). The browser's snapshot carries its
  // sessionId (store.ts; a new one on Reset to seed); a different one switches the conversation.
  // A snapshot without one (older browser) keeps the plain 'talk' id.
  let talk = init(Talk, { id: 'talk' });
  let talkDispatched = false; // abort() on a handle that never ran anything is pointless
  let sessionId = null;
  let firstSnapshotSeen;
  const firstSnapshot = new Promise((resolve) => { firstSnapshotSeen = resolve; });
  function onSessionId(id) {
    if (typeof id !== 'string' || !id || id === sessionId) return;
    sessionId = id;
    // Reset to seed: stop whatever the old design's conversation is still doing (the running head
    // and anything queued behind it) before the new one starts. Its read() rejects with 'aborted',
    // which handleUserTurn already catches. Durable, so a restart does not resume it either.
    if (talkDispatched) {
      const old = talk;
      old.abort().then(() => console.log('[talk] previous conversation aborted')).catch((err) => console.log(`[talk] abort previous: ${err?.message ?? err}`));
    }
    talkDispatched = false;
    talk = init(Talk, { id: `talk:${id}` });
    sinceLastTurn.length = 0; // about the previous design
    console.log(`[talk] session ${id}`);
  }
  console.log('agents:', AGENTS.filter((a) => a.hosting !== 'path').map((a) => `${a.id}→${modelFor(a) ?? 'no model'}`).join(', '));

  const clientId = `agent-${Math.random().toString(36).slice(2, 8)}`;
  const genId = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const pending = new Map(); // msgId -> { resolve, timer }
  let latestSnapshot = null;
  // What the model has not seen yet. Control turns (Approve/Discard/Undo on either screen) are
  // applied on the main screen and never become a model turn, so without this the model's last tool
  // output ("staged: 1 change") is its view of the world on the next message. The main screen
  // echoes every cue it applies; a commit/discard/undo echo we did not send is the user's doing.
  // Found 2026-09-28: after Approve the agent said "hit Commit to save it". Cleared on dispatch.
  let lastCtx = null;
  const sinceLastTurn = []; // { t: 'commit' | 'discard' | 'undo', n: staged count before it }
  const ownCues = { commit: 0, discard: 0, undo: 0 }; // sent by our tools, echo not seen yet
  // Normalised say/ask texts published during the running turn. What was actually sent is the
  // truth for "did the model already speak", not the read() stream: that can open with a
  // conversation-reset snapshot (compaction) whose tool calls never arrive as tool-input chunks.
  let turnSaid = [];
  const norm = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();

  const ws = new WebSocket(`ws://localhost:${PORT}`);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  ws.send(JSON.stringify({ kind: 'hello', role: 'agent', from: clientId }));
  console.log('agent connected to the bus as', clientId);

  function send(msg) {
    ws.send(JSON.stringify({ ...msg, from: clientId }));
  }

  // Stage 3-B: answers `ai-request` bus messages (src/ai/backend.ts::BusBackend) with a real model
  // call via agent/ai-service.ts. Uses the same `send` as everything else here, so ai-response
  // frames are indistinguishable on the wire from cue/aicall frames.
  const aiService = createAiService({ send });
  const handleS1 = await attachSystem1(ws, send);

  // Runtime events → stdout + an `aicall` bus message per model turn (fn = agent name, model, usage,
  // cost) so the main screen can record agent turns in state.aiCalls (Stage 3 reads this kind).
  // cacheRead/cacheWrite show whether the prompt cache is hitting: `in` is the uncached remainder
  // on Anthropic-format usage, so a warm turn reads most of its prompt from cache. `sys=` is a hash
  // of the system prompt from the in-process turn_request event; it must not change between turns
  // of one conversation (a change busts the cache for the whole history).
  const sysHash = new Map(); // turnId -> 8-char hash
  // Why the running Talk dispatch happened, for the [turn] line: user (a plain user turn), catch-up
  // (a user turn that also carried the since-your-last-turn note) or critique (a critique point).
  let dispatchReason = null;
  observe((ev) => {
    if (ev.type === 'turn_request') {
      const sp = ev.request?.input?.systemPrompt;
      if (typeof sp === 'string') sysHash.set(ev.turnId, createHash('sha1').update(sp).digest('hex').slice(0, 8));
    } else if (ev.type === 'turn' && ev.response?.usage) {
      const u = ev.response.usage;
      const sys = sysHash.get(ev.turnId);
      sysHash.delete(ev.turnId);
      const purpose = ev.purpose && ev.purpose !== 'agent' ? ` purpose=${ev.purpose}` : '';
      const reason = dispatchReason && ev.agentName !== 'AiFunction' ? ` reason=${dispatchReason}` : '';
      console.log(`[turn] ${ev.agentName} ${ev.request?.requestedModel ?? ''}${purpose}${reason} in=${u.input} out=${u.output} cacheRead=${u.cacheRead ?? 0} cacheWrite=${u.cacheWrite ?? 0} cost=$${(u.cost?.total ?? 0).toFixed(4)}${sys ? ` sys=${sys}` : ''}`);
      send({ kind: 'aicall', fn: ev.agentName, model: ev.request?.requestedModel ?? null, usage: { input: u.input, output: u.output, cacheRead: u.cacheRead ?? 0, cacheWrite: u.cacheWrite ?? 0, costUsd: u.cost?.total ?? 0 }, conversationId: ev.conversationId, at: Date.now() });
    } else if (ev.type === 'tool') {
      console.log(`[tool] ${ev.agentName} ${ev.toolName ?? ''}${ev.isError ? ' ERROR' : ''}`);
    } else if (ev.type === 'task') {
      console.log(`[task] ${ev.agentName} → delegate done${ev.isError ? ' with error' : ''}`);
    } else if (ev.type === 'submission_settled') {
      console.log(`[settled] ${ev.agentName} ${ev.outcome ?? ''}`);
    }
  });

  const clip = (text, n) => { const t = String(text ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const nextOf = (ctx) => (ctx?.next ? `${ctx.next.id} "${clip(ctx.next.prompt, 140)}" (tier ${ctx.next.tier})` : 'none');
  const stagedOf = (ctx) => (ctx?.staged ? `${plural(ctx.staged.count, 'change')}${ctx.staged.note ? ` (${clip(ctx.staged.note, 100)})` : ''}` : 'none');
  const askOf = (ctx) => (ctx?.ask ? `${ctx.ask.id} "${clip(ctx.ask.text, 140)}"` : 'none');

  function screenLineFrom(ctx) {
    const items = Array.isArray(ctx?.screen?.items) ? ctx.screen.items : [];
    const titles = items.slice(0, 20).map((i) => i.title).join(', ');
    return [
      `view=${ctx?.view ?? 'unknown'} params=${JSON.stringify(ctx?.params ?? {})}`,
      `visible: ${titles || '(nothing reported)'}`,
      `next: ${nextOf(ctx)}`,
      `staged: ${stagedOf(ctx)}`,
      `ask: ${askOf(ctx)}`,
    ].join('\n');
  }

  // The screen line is a `screen` signal appended at the start of each dispatched turn (see
  // agents/talk.ts::useAgentStart), never part of the system prompt: remember the latest context
  // here and hand it over at dispatch time (below). Tools already return the fresh context.
  function onContext(ctx) {
    if (!ctx) return;
    lastCtx = ctx;
  }

  /** A commit/discard/undo the main screen applied: ours (a tool call) or the user's (a control). */
  function onAppliedCue(cue) {
    const t = cue?.t;
    if (!(t in ownCues)) return;
    if (ownCues[t] > 0) { ownCues[t]--; return; }
    // lastCtx is still the pre-control context: the main screen echoes the cue before it publishes context.
    sinceLastTurn.push({ t, n: t === 'undo' ? null : lastCtx?.staged?.count ?? null });
    if (sinceLastTurn.length > 10) sinceLastTurn.splice(0, sinceLastTurn.length - 10);
  }

  /** One catch-up clause; k identical events in a row read as one ("×2 … each"). */
  function sinceClause({ t, n }, k) {
    const times = k > 1 ? ` ×${k}` : '';
    const each = k > 1 ? ' each' : '';
    if (t === 'commit') return `user approved the staged changes${times} (${n == null ? 'all' : n} committed${each})`;
    if (t === 'discard') return `user discarded the staged changes${times}${n ? ` (${plural(n, 'change')}${each})` : ''}`;
    return k > 1 ? `user undid the last ${k} commits` : 'user undid the last commit';
  }

  /** The bracketed catch-up line for the next dispatched message, or '' when nothing happened. */
  function takeSinceNote() {
    if (!sinceLastTurn.length) return '';
    const clauses = [];
    for (let i = 0; i < sinceLastTurn.length; ) {
      let j = i + 1;
      while (j < sinceLastTurn.length && sinceLastTurn[j].t === sinceLastTurn[i].t && sinceLastTurn[j].n === sinceLastTurn[i].n) j++;
      clauses.push(sinceClause(sinceLastTurn[i], j - i));
      i = j;
    }
    const note = `[Since your last turn: ${clauses.join('; ')}. Screen now: next = ${nextOf(lastCtx)}, staged = ${stagedOf(lastCtx)}.]\n`;
    sinceLastTurn.length = 0;
    return note;
  }

  /** A delegate's final answer (the `task` tool's output) as at most two sentences of plain text. */
  function delegateText(output) {
    let raw = output;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) raw = raw.text ?? raw.output ?? raw.result ?? raw.content ?? JSON.stringify(raw);
    if (Array.isArray(raw)) raw = raw.map((p) => (typeof p === 'string' ? p : p?.text ?? '')).join(' ');
    const plain = String(raw ?? '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/^\s*(#{1,6}|[-*+]|\d+\.)\s+/gm, '')
      .replace(/[*_`>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!plain) return '';
    const sentences = plain.match(/[^.!?]+[.!?]+(\s|$)/g);
    return clip(sentences ? sentences.slice(0, 2).join('').trim() : plain, 400);
  }

  // Tools publish a cue and await its ack via this — see agent/tools.ts.
  // Flue runs tools at-least-once (reference/agent-api.md §dispatch), so the same say/ask can come
  // through twice in one turn; the screen shows it once.
  busRef.publishCue = (cue) =>
    new Promise((resolve) => {
      if (cue?.t === 'say' || cue?.t === 'ask') {
        const text = norm(cue.text);
        if (turnSaid.includes(text)) { console.log(`[agent] repeated ${cue.t} not re-sent`); resolve(lastCtx ? { ctx: lastCtx } : null); return; }
        turnSaid.push(text);
      }
      const msgId = genId();
      const timer = setTimeout(() => {
        pending.delete(msgId);
        if (cue?.t in ownCues && ownCues[cue.t] > 0) ownCues[cue.t]--; // no main screen: no echo is coming
        resolve(null);
      }, 2000);
      pending.set(msgId, { resolve, timer });
      if (cue?.t in ownCues) ownCues[cue.t]++;
      send({ kind: 'cue', cue, msgId });
    });
  busRef.getSnapshot = () => latestSnapshot;
  busRef.getLastContext = () => lastCtx; // read_open; was never wired, so it always said "no context yet"
  // `talk.ts::run_review` writes the verdict to reality.json itself (it runs in this process); this
  // is just the "browser ignores for now" broadcast (v4.2 §Agent C) — fire-and-forget, no ack.
  busRef.publishReality = (payload) => send({ kind: 'reality', ...payload });

  ws.on('message', async (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    // A main screen that loads (or reloads) after us never saw our first hello — without this it
    // stays on the ScriptedDirector and every turn is a stub. (Before handleS1: that also answers
    // the main hello.) Found 2026-09-28 driving a design session.
    if (msg.kind === 'hello' && msg.role === 'main') ws.send(JSON.stringify({ kind: 'hello', role: 'agent', from: clientId }));
    if (handleS1(msg)) return;
    switch (msg.kind) {
      case 'context':
        onContext(msg.ctx);
        break;
      case 'cue':
        if (msg.from !== clientId) onAppliedCue(msg.cue); // the main screen's echo of what it applied
        break;
      case 'snapshot':
        // The kernel digest goes into the prompt at dispatch time, like the screen line: a snapshot
        // lands mid-response after every commit/undo tool call and would re-render the instructions.
        latestSnapshot = { graph: msg.graph, kernel: msg.kernel };
        onSessionId(msg.sessionId);
        firstSnapshotSeen();
        break;
      case 'ack': {
        const p = pending.get(msg.msgId);
        if (p) {
          clearTimeout(p.timer);
          pending.delete(msg.msgId);
          onContext(msg.ctx);
          p.resolve({ ctx: msg.ctx });
        }
        break;
      }
      case 'user':
        enqueueTurn(msg.turn);
        break;
      case 'critique':
        if (claimCritique(msg)) enqueueTurn({ critique: msg });
        break;
      case 'ai-request':
        aiService.handle(msg).catch((err) => console.error('[ai-service] handle failed:', err));
        break;
      default:
        break; // 'hello', 'ai-response' from other agents (shouldn't happen) — ignore
    }
  });

  // One user turn, one response. Flue has no per-dispatch queue option: a dispatch to a busy
  // instance joins the live response at the next turn boundary (reference/agent-api.md §dispatch),
  // which swallowed "what next" sent right after "contradictions". So a turn waits here until the
  // previous one has settled before it is dispatched.
  let turnChain = Promise.resolve();
  function enqueueTurn(turn) {
    const run = turnChain.then(() => handleUserTurn(turn));
    turnChain = run.catch(() => {});
    return run;
  }

  async function handleUserTurn(turn) {
    // Control turns (approve/discard/undo/tour nav) are applied on the main screen and never sent to
    // the model; their effect reaches it through onAppliedCue → takeSinceNote on the next turn.
    if ('control' in turn) return;
    let message;
    if ('critique' in turn) message = critiqueNote(turn.critique);
    else if ('text' in turn) message = `User: ${turn.text}`;
    else if ('choice' in turn) message = `User chose "${turn.choice}" for ask ${turn.forAsk}`;
    else if ('topic' in turn) message = `User selected topic: ${turn.topic}`;
    else return;
    // The first turn waits for the first snapshot: it carries the sessionId that picks the
    // conversation. Turns behind it wait in turnChain. No snapshot in 3 s: the current one.
    await Promise.race([firstSnapshot, new Promise((resolve) => setTimeout(resolve, 3000))]);
    // The catch-up note and the screen line ride the `screen` signal; the kernel digest and the
    // committed-graph digest ride `kernel`/`graph` signals only when their hash changed (Talk's
    // useAgentStart decides). The user message itself stays exactly what the user did.
    const since = takeSinceNote();
    const reason = 'critique' in turn ? 'critique' : since ? 'catch-up' : 'user';
    console.log(`[dispatch] reason=${reason}`, JSON.stringify(message), since ? `+ ${JSON.stringify(since.trim())}` : '');

    const convo = talk; // a session switch mid-turn must not split dispatch and read
    turnSaid = [];
    try {
      setTurnSignals({
        screen: since + screenLineFrom(lastCtx),
        kernel: latestSnapshot ? latestSnapshot.kernel || '(empty kernel digest)' : undefined,
        graph: latestSnapshot ? graphDigest(latestSnapshot.graph) : undefined,
      });
      talkDispatched = true;
      dispatchReason = reason;
      const receipt = await convo.dispatch(message);
      const toolNames = new Map(); // toolCallId -> toolName (tool-output chunks carry only the id)
      let delegateOutput = null; // the last `task` (observer/planner) result in this response
      // read() replays the conversation's earlier chunks too (seen 2026-09-28: the second turn's
      // log repeated the first turn's say calls), so only this submission's messages count.
      const ours = new Set();
      const reply = await convo.read(receipt, {
        onEvent(chunk) {
          if (chunk.type === 'message-started') {
            if (chunk.submissionId === receipt.submissionId) ours.add(chunk.messageId);
          } else if (chunk.type === 'tool-input') {
            if (!ours.has(chunk.messageId)) return;
            console.log('[tool-input]', chunk.toolName, JSON.stringify(chunk.input));
            toolNames.set(chunk.toolCallId, chunk.toolName);
          } else if (chunk.type === 'tool-output') {
            if (!toolNames.has(chunk.toolCallId)) return;
            console.log('[tool-output]', chunk.toolCallId, JSON.stringify(chunk.output));
            if (toolNames.get(chunk.toolCallId) === 'task') delegateOutput = chunk.output;
          } else if (chunk.type === 'tool-output-error') {
            if (!toolNames.has(chunk.toolCallId)) return;
            console.log('[tool-output-error]', chunk.toolCallId, chunk.errorText);
          }
        },
      });
      // The model answered in plain text without ever calling say/ask — publish it as a `say` cue
      // so it still reaches the screen (fire-and-forget; no ack wait, unlike tool-driven cues).
      // Any say/ask this turn already spoke; the closing text usually restates it.
      const saidViaTool = turnSaid.length > 0;
      if (!saidViaTool && reply.text && reply.text.trim()) {
        send({ kind: 'cue', cue: { t: 'say', text: reply.text.trim() }, msgId: genId() });
      } else if (!saidViaTool && delegateOutput != null) {
        // Neither say/ask nor text, but a delegate answered (seen 2026-09-28: the observer's "I find
        // no contradictions…" never reached the screen). Show the delegate's first sentences.
        const text = delegateText(delegateOutput);
        if (text) {
          console.log('[agent] reply recovered from delegate');
          send({ kind: 'cue', cue: { t: 'say', text }, msgId: genId() });
        }
      }
    } catch (err) {
      // A session switch aborts the old conversation (onSessionId); its read rejects here by design.
      if (err?.outcome === 'aborted') console.log('[agent] turn aborted (session switched)');
      else console.error('[agent] turn failed:', err);
    } finally {
      dispatchReason = null;
    }
  }
}
