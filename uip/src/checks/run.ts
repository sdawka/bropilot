// CHECKS-SPEC §3.3: code results, reviewed pins, cache hits, then batched Clef calls (fake fallback per
// unit), escalate on clef, the sol-retype second pass folded into its parent, cache write, worst first.
import type { DecideRequest, DecideResponse, S1Answer } from '../types';
import { decide as s1Decide } from '../s1/client';
import type { CheckModel, CheckProgress, CheckResult, CheckUnit, PlanCtx, Verdict } from './types';
import { batch, requestChars } from './batch';
import { hashUnit, readCache, reviewed, writeCache } from './cache';
import { PRICE_PER_MTOK, wireModel } from './cost';
import { fakeAnswers } from './fake';
import { planRetype } from './plan';
import { resolveCheck, type Resolved } from './resolve';

export const CHECK_TIMEOUT_MS = 8000;
type Wire = 'clef-flash' | 'clef';
type Hashes = Record<Wire | 'code', string>;
export interface RunOpts {
  model: CheckModel; concurrency?: number; onProgress?: (p: CheckProgress) => void; signal?: AbortSignal;
  decide?: (req: DecideRequest, timeoutMs?: number) => Promise<DecideResponse>; ctx: PlanCtx; useCache?: boolean;
  /** lazy ensure: pack small homogeneous groups into mixed requests (batch `mixSmall`). */
  mixSmall?: boolean;
}

const RANK: Record<Verdict, number> = { broken: 0, weak: 1, unknown: 2, solid: 3 };
export const sortResults = (rs: CheckResult[]) => [...rs].sort((a, b) =>
  RANK[a.verdict] - RANK[b.verdict] || a.confidence - b.confidence || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

async function hashesOf(u: CheckUnit): Promise<Hashes> {
  const [f, c, k] = await Promise.all([hashUnit(u, 'clef-flash'), hashUnit(u, 'clef'), hashUnit(u, 'code')]);
  return { 'clef-flash': f, clef: c, code: k };
}
const stamp = (r: Resolved, model: string, fake: boolean, hash: string): CheckResult => {
  // a fake never raises an alarm it cannot justify: only code-backed gaps (cmp-need) stay broken offline
  const verdict = fake && r.verdict === 'broken' && r.checkId !== 'cmp-need' ? 'weak' : r.verdict;
  return { ...r, verdict, at: new Date().toISOString(), model, fake, hash };
};

/** Step 1-2: what is already known without asking (code units, reviewed pins, cache hits) and what is left. */
export async function fromCache(units: CheckUnit[], ctx: PlanCtx, model: CheckModel, useCache = true):
  Promise<{ known: Map<string, CheckResult>; todo: CheckUnit[]; hashes: Map<string, Hashes> }> {
  const cache = useCache ? readCache(ctx.project) : {};
  const rev = reviewed.read(ctx.project);
  const known = new Map<string, CheckResult>(), hashes = new Map<string, Hashes>(), todo: CheckUnit[] = [];
  const wire = wireModel(model);
  for (const u of units) {
    const h = await hashesOf(u);
    hashes.set(u.key, h);
    const pin = rev[u.key];
    if (pin && Object.values(h).includes(pin)) {
      const base = cache[pin] ?? (u.code ? stamp({ id: u.key, checkId: u.checkId, family: u.family, subjects: u.subjects, ...u.code, confidence: 1, band: 'act', answers: {} }, 'code', false, h.code) : null);
      known.set(u.key, { ...(base ?? { id: u.key, checkId: u.checkId, family: u.family, subjects: u.subjects, confidence: 1, band: 'act', answers: {},
        evidence: 'marked right by hand', at: new Date().toISOString(), model: 'reviewed', fake: false, hash: pin }), verdict: 'solid', finding: 'reviewed', repairs: [] });
      continue;
    }
    if (u.code) {
      known.set(u.key, stamp({ id: u.key, checkId: u.checkId, family: u.family, subjects: u.subjects, ...u.code, confidence: 1, band: 'act', answers: {} }, 'code', false, h.code));
      continue;
    }
    const hit = (model === 'escalate' ? [h.clef, h['clef-flash']] : [h[wire]]).map((x) => cache[x]).find(Boolean);
    if (hit) { known.set(u.key, hit); continue; }
    todo.push(u);
  }
  return { known, todo, hashes };
}

async function pool<T>(items: T[], n: number, fn: (x: T) => Promise<void>, signal?: AbortSignal) {
  let i = 0;
  const worker = async () => { while (i < items.length && !signal?.aborted) await fn(items[i++]); };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
}

export async function runChecks(units: CheckUnit[], opts: RunOpts): Promise<CheckResult[]> {
  const { model, ctx, signal } = opts;
  const send = opts.decide ?? ((r: DecideRequest) => s1Decide(r, CHECK_TIMEOUT_MS));
  const wire = wireModel(model);
  const { known, todo, hashes } = await fromCache(units, ctx, model, opts.useCache ?? true);
  const prog: CheckProgress = { done: known.size, total: units.length, questions: 0, requests: 0, usd: 0 };
  opts.onProgress?.({ ...prog });

  /** Steps 3-5: batch, send, fake per unit when the answer is missing or the response is a fake. */
  async function ask(list: CheckUnit[], w: Wire): Promise<Map<string, CheckResult>> {
    const res = new Map<string, CheckResult>();
    await pool(batch(list, w, { mixSmall: opts.mixSmall }), opts.concurrency ?? 4, async ({ request, units: us }) => {
      let resp: DecideResponse;
      try { resp = await send(request); } catch (e) { resp = { answers: {}, model: 'fake', ms: 0, fake: true, error: String(e) }; }
      prog.requests++;
      prog.questions += Object.keys(request.questions).length;
      prog.usd += (Math.ceil(requestChars(request.questions) / 4) * PRICE_PER_MTOK[w]) / 1e6;
      for (const u of us) {
        const keys = Object.keys(u.questions);
        const fake = !!resp.fake || keys.some((k) => !(k in (resp.answers ?? {})));
        const answers: Record<string, S1Answer> = fake ? fakeAnswers(u, ctx) : resp.answers;
        const h = hashes.get(u.key) ?? (await hashesOf(u));
        res.set(u.key, stamp(resolveCheck(u, answers, ctx), fake ? 'fake' : resp.model || w, fake, h[w]));
      }
      prog.done += us.length;
      opts.onProgress?.({ ...prog });
    }, signal);
    return res;
  }

  const fresh = await ask(todo, wire);
  // step 6: escalate consistency + offer-band units to clef; a non-fake clef answer replaces flash
  if (model === 'escalate' && !signal?.aborted) {
    const up = todo.filter((u) => { const r = fresh.get(u.key); return r && (u.family === 'consistency' || r.band === 'offer'); });
    prog.total += up.length;
    for (const [k, r] of await ask(up, 'clef')) if (!r.fake) fresh.set(k, r);
  }
  // step 7: sol-retype second pass, folded into its parent
  if (!signal?.aborted) {
    const rt = planRetype([...fresh.values()], ctx);
    prog.total += rt.length;
    for (const u of rt) hashes.set(u.key, await hashesOf(u));
    for (const [, r] of await ask(rt, wire)) {
      const parentKey = rt.find((u) => u.key === r.id)?.meta.parent as string | undefined;
      const parent = parentKey ? fresh.get(parentKey) : undefined;
      if (!parent || r.fake) continue;
      fresh.set(parent.id, foldRetype(parent, r));
    }
  }
  // step 8
  writeCache(ctx.project, [...fresh.values()].filter((r) => !r.fake));
  return sortResults([...known.values(), ...fresh.values()]);
}

/** Retype folds into its parent: answers merged, repairs replaced (unless the retype is in the ask band), evidence suffixed. */
export function foldRetype(parent: CheckResult, rt: CheckResult): CheckResult {
  const answers = { ...parent.answers, ...rt.answers };
  if (rt.band === 'ask') return { ...parent, answers };
  return { ...parent, answers, repairs: rt.repairs, evidence: parent.evidence + rt.evidence };
}
