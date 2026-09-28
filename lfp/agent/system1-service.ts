// Answers `system1-request` bus messages with `system1-response` (v4.3, AGENT-RUNTIME.md §9).
// The mirror of agent/ai-service.ts for typed decisions. Unlike ai-service nothing non-serialisable
// crosses a closure here, so requests could run concurrently; they are serialised for symmetry
// and because Jev's rate limits are still moving ("without notice while GPU capacity lands").
import { askSystem1 } from './system1.ts';

interface S1Request { kind: 'system1-request'; id: string; fn: string; state: unknown; questions: Record<string, unknown>; from?: string }
interface S1Response { kind: 'system1-response'; id: string; answers?: Record<string, unknown>; error?: string; model?: string; ms?: number; usage?: { input: number; output: number; costUsd: number } }

let queue: Promise<void> = Promise.resolve();

export function createSystem1Service({ send }: { send: (msg: S1Response) => void }) {
  function handle(msg: S1Request) {
    if (msg.kind !== 'system1-request') return Promise.resolve();
    const next = queue.then(() => processOne(msg, send));
    queue = next.catch((err) => console.error('[system1-service] request failed:', err));
    return next;
  }
  return { handle };
}

async function processOne(msg: S1Request, send: (msg: S1Response) => void) {
  const n = Object.keys(msg.questions ?? {}).length;
  if (!n) { send({ kind: 'system1-response', id: msg.id, error: 'no questions' }); return; }
  try {
    const r = await askSystem1(msg.state, msg.questions);
    console.log(`[system1] ${msg.fn} ${n} question${n === 1 ? '' : 's'} ${r.ms}ms ${r.model}`);
    send({ kind: 'system1-response', id: msg.id, answers: r.answers, model: r.model, ms: r.ms, usage: r.usage });
  } catch (err) {
    console.error(`[system1] ${msg.fn} failed:`, (err as Error).message ?? String(err));
    send({ kind: 'system1-response', id: msg.id, error: (err as Error).message ?? String(err) });
  }
}
