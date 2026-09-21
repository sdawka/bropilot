// LAN relay so a phone can be the mirror: rebroadcasts every WebSocket message to all other
// clients (verbatim behaviour + printed URLs from the old relay.mjs). When ANTHROPIC_API_KEY is
// set (in the environment, or in a gitignored .env at the project root), this process *also*
// joins its own bus as a client with role 'agent' and drives one Flue "Talk" session (agent/talk.ts)
// that turns `user` turns into `cue`s — see /Users/sdawka/.claude/plans/let-s-centralize-the-interaction-staged-mochi.md.
//
// Without a key this behaves exactly like `npm run relay` did: pure rebroadcast, no agent hello.
import { WebSocketServer, WebSocket } from 'ws';
import { networkInterfaces } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

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
if (process.env.OPENROUTER_API_KEY || process.env.ANTHROPIC_API_KEY) {
  await runAgent();
} else if (process.env.FAKE_AI === '1') {
  console.log('FAKE_AI=1, no model key — running the AI-function relay with canned output only (no Talk agent, no Flue conversation).');
  await runFakeAiOnly();
} else {
  console.log('no model key — running as a plain relay (no agent).');
  console.log('  set OPENROUTER_API_KEY (preferred, one key for every tier) or ANTHROPIC_API_KEY in lfp/.env to enable the Talk agent.');
  console.log('  set FAKE_AI=1 instead to exercise ai-request/ai-response with canned output and no key (what smoke uses).');
}

// ── FAKE_AI=1, no key: just the ai-request/ai-response relay, no Flue conversation at all ─────────
async function runFakeAiOnly() {
  const { createAiService } = await import('./ai-service.ts');

  const clientId = `agent-fake-${Math.random().toString(36).slice(2, 8)}`;
  const ws = new WebSocket(`ws://localhost:${PORT}`);
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  ws.send(JSON.stringify({ kind: 'hello', role: 'agent', from: clientId }));
  console.log('fake-AI service connected to the bus as', clientId);

  const aiService = createAiService({ send: (msg) => ws.send(JSON.stringify({ ...msg, from: clientId })) });

  ws.on('message', (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    if (msg.kind === 'ai-request') { console.log(`[ai-request] ${msg.fn} ${msg.id}`); aiService.handle(msg).catch((err) => console.error('[ai-service] handle failed:', err)); }
  });
}

async function runAgent() {
  const { start, sqlite } = await import('@flue/runtime/node');
  const { init, observe } = await import('@flue/runtime');
  const { busRef } = await import('./bus-ref.ts');
  const { Talk, setKernelDigest, setScreenLine } = await import('./talk.ts');
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
  const talk = init(Talk, { id: 'talk' }); // one session shared by the main screen and every mirror
  console.log('agents:', AGENTS.filter((a) => a.hosting !== 'path').map((a) => `${a.id}→${modelFor(a) ?? 'no model'}`).join(', '));

  const clientId = `agent-${Math.random().toString(36).slice(2, 8)}`;
  const genId = () => `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  const pending = new Map(); // msgId -> { resolve, timer }
  let latestSnapshot = null;

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

  // Runtime events → stdout + an `aicall` bus message per model turn (fn = agent name, model, usage,
  // cost) so the main screen can record agent turns in state.aiCalls (Stage 3 reads this kind).
  observe((ev) => {
    if (ev.type === 'turn' && ev.response?.usage) {
      const u = ev.response.usage;
      console.log(`[turn] ${ev.agentName} ${ev.request?.requestedModel ?? ''} in=${u.input} out=${u.output} cost=$${(u.cost?.total ?? 0).toFixed(4)}`);
      send({ kind: 'aicall', fn: ev.agentName, model: ev.request?.requestedModel ?? null, usage: { input: u.input, output: u.output, costUsd: u.cost?.total ?? 0 }, conversationId: ev.conversationId, at: Date.now() });
    } else if (ev.type === 'tool') {
      console.log(`[tool] ${ev.agentName} ${ev.toolName ?? ''}${ev.isError ? ' ERROR' : ''}`);
    } else if (ev.type === 'task') {
      console.log(`[task] ${ev.agentName} → delegate done${ev.isError ? ' with error' : ''}`);
    } else if (ev.type === 'submission_settled') {
      console.log(`[settled] ${ev.agentName} ${ev.outcome ?? ''}`);
    }
  });

  function screenLineFrom(ctx) {
    const items = Array.isArray(ctx?.screen?.items) ? ctx.screen.items : [];
    const titles = items.slice(0, 20).map((i) => i.title).join(', ');
    return `view=${ctx?.view ?? 'unknown'} params=${JSON.stringify(ctx?.params ?? {})}\nvisible: ${titles || '(nothing reported)'}`;
  }

  // Tools publish a cue and await its ack via this — see agent/tools.ts.
  busRef.publishCue = (cue) =>
    new Promise((resolve) => {
      const msgId = genId();
      const timer = setTimeout(() => {
        pending.delete(msgId);
        resolve(null);
      }, 2000);
      pending.set(msgId, { resolve, timer });
      send({ kind: 'cue', cue, msgId });
    });
  busRef.getSnapshot = () => latestSnapshot;

  ws.on('message', async (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    switch (msg.kind) {
      case 'context':
        setScreenLine(screenLineFrom(msg.ctx));
        break;
      case 'snapshot':
        latestSnapshot = { graph: msg.graph, kernel: msg.kernel };
        setKernelDigest(msg.kernel ?? '(empty kernel digest)');
        break;
      case 'ack': {
        const p = pending.get(msg.msgId);
        if (p) {
          clearTimeout(p.timer);
          pending.delete(msg.msgId);
          p.resolve({ ctx: msg.ctx });
        }
        break;
      }
      case 'user':
        await handleUserTurn(msg.turn);
        break;
      case 'ai-request':
        aiService.handle(msg).catch((err) => console.error('[ai-service] handle failed:', err));
        break;
      default:
        break; // 'hello', 'cue', 'ai-response' from other agents (shouldn't happen) — ignore
    }
  });

  async function handleUserTurn(turn) {
    if ('control' in turn) return; // control turns (approve/discard/undo/tour nav) are handled on the main screen, never sent to the model
    let message;
    if ('text' in turn) message = `User: ${turn.text}`;
    else if ('choice' in turn) message = `User chose "${turn.choice}" for ask ${turn.forAsk}`;
    else if ('topic' in turn) message = `User selected topic: ${turn.topic}`;
    else return;

    try {
      const receipt = await talk.dispatch(message);
      let saidViaTool = false;
      const reply = await talk.read(receipt, {
        onEvent(chunk) {
          if (chunk.type === 'tool-input') {
            console.log('[tool-input]', chunk.toolName, JSON.stringify(chunk.input));
            if (chunk.toolName === 'say' || chunk.toolName === 'ask') saidViaTool = true;
          } else if (chunk.type === 'tool-output') {
            console.log('[tool-output]', chunk.toolCallId, JSON.stringify(chunk.output));
          } else if (chunk.type === 'tool-output-error') {
            console.log('[tool-output-error]', chunk.toolCallId, chunk.errorText);
          }
        },
      });
      // The model answered in plain text without ever calling say/ask — publish it as a `say` cue
      // so it still reaches the screen (fire-and-forget; no ack wait, unlike tool-driven cues).
      if (!saidViaTool && reply.text && reply.text.trim()) {
        send({ kind: 'cue', cue: { t: 'say', text: reply.text.trim() }, msgId: genId() });
      }
    } catch (err) {
      console.error('[agent] turn failed:', err);
    }
  }
}
