// POST /api/decide with a 6 s cut-off; any failure (no Worker under `vite`, 404, timeout, bad JSON)
// falls back to the fake, tagged `fake: true` so the GuessStrip shows `offline`.
import type { DecideRequest, DecideResponse } from '../types';
import { fakeDecide } from './fake';

export const S1_TIMEOUT_MS = 6000;
/** Network requests actually sent; repair must not move this (SPEC §6, "0 round trips"). */
export const s1Stats = { requests: 0, fake: 0 };

export async function decide(req: DecideRequest, timeoutMs = S1_TIMEOUT_MS): Promise<DecideResponse> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  s1Stats.requests++;
  try {
    const res = await fetch('/api/decide', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req), signal: ctl.signal,
    });
    if (!res.ok) throw new Error(`decide ${res.status}`);
    const body = (await res.json()) as DecideResponse;
    if (!body || typeof body !== 'object' || !body.answers) throw new Error('empty decide response');
    // a Worker answer may still be its own fake (no AI binding); keep its flag
    for (const k of Object.keys(req.questions)) if (!(k in body.answers)) throw new Error(`missing answer ${k}`);
    if (body.fake) s1Stats.fake++;
    return body;
  } catch (e) {
    s1Stats.fake++;
    return fakeDecide(req, e instanceof Error ? e.message : String(e));
  } finally {
    clearTimeout(timer);
  }
}
