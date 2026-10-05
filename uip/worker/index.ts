// uip Worker (SPEC §7): System One decisions on Workers AI (Clef), project data from Cloudflare
// Artifacts when bound, static assets for everything else. No secrets are read here in v1.
import type { DecideRequest, DecideResponse, S1Answer } from '../src/types';
import { fakeDecide } from '../src/s1/fake';

/** The Artifacts binding, typed loosely from research/cloudflare-artifacts.md (open beta). */
interface ArtifactsRepo {
  readFile(opts: { ref: string; path: string }): Promise<Blob | null>;
  info?(): Promise<unknown>;
}
interface ArtifactsNamespace {
  list(opts?: { limit?: number; cursor?: string }): Promise<{ repos?: { name: string }[]; items?: { name: string }[]; cursor?: string } | { name: string }[]>;
  get(name: string): Promise<ArtifactsRepo | null> | ArtifactsRepo | null;
}
interface AiLike { run(model: string, inputs: unknown, opts?: unknown): Promise<unknown> }

export interface Env {
  ASSETS: Fetcher;
  AI?: AiLike;
  ARTIFACTS?: ArtifactsNamespace;
  S1_MODEL?: string;
}

const ATTEMPT_MS = 2500;
const DEFAULT_MODEL = '@cf/cloudflare/clef-flash';
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store' } });

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/** The binding returns Jev-shaped answers unwrapped; tolerate a REST-style `result` envelope too. */
function answersOf(out: unknown): Record<string, S1Answer> | null {
  const o = out as any;
  const a = o?.answers ?? o?.result?.answers ?? null;
  return a && typeof a === 'object' ? a : null;
}

async function decide(req: DecideRequest, env: Env): Promise<DecideResponse> {
  if (!req || typeof req !== 'object' || !req.questions || typeof req.questions !== 'object') {
    return { answers: {}, model: 'none', ms: 0, fake: true, error: 'bad request: questions missing' };
  }
  if (!env.AI) return fakeDecide(req, 'no AI binding');
  const modelId = req.model === 'clef' ? '@cf/cloudflare/clef' : env.S1_MODEL || DEFAULT_MODEL;
  const model = modelId.split('/').pop()!;
  const t0 = Date.now();
  let lastErr = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const out = await withTimeout(env.AI.run(modelId, { model, state: req.state, questions: req.questions }), ATTEMPT_MS);
      const answers = answersOf(out);
      if (!answers) throw new Error('no answers in model output');
      const missing = Object.keys(req.questions).filter((k) => !(k in answers));
      if (missing.length) throw new Error(`missing answers: ${missing.slice(0, 5).join(', ')}`);
      return { answers, model, ms: Date.now() - t0, fake: false };
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }
  }
  return { ...fakeDecide(req, `${model}: ${lastErr}`), ms: Date.now() - t0 };
}

// ── projects: Artifacts when bound (store=artifacts), else the bundled static JSON ──────────────
async function repoNames(ns: ArtifactsNamespace): Promise<string[]> {
  const res: any = await ns.list({ limit: 100 });
  const rows: { name: string }[] = Array.isArray(res) ? res : res?.repos ?? res?.items ?? [];
  return rows.map((r) => r.name).filter((n) => n.startsWith('proj-'));
}
async function readJson(ns: ArtifactsNamespace, repo: string, path: string): Promise<unknown | null> {
  const r = await ns.get(repo);
  if (!r) return null;
  const blob = await r.readFile({ ref: 'main', path });
  return blob ? JSON.parse(await blob.text()) : null;
}
function fromAssets(req: Request, env: Env, path: string): Promise<Response> {
  return env.ASSETS.fetch(new Request(new URL(path, req.url), { method: 'GET', headers: req.headers }));
}

async function projects(req: Request, env: Env, url: URL): Promise<Response> {
  const m = url.pathname.match(/^\/api\/projects(?:\/([a-z0-9._-]+)\/(graph|timeline))?\/?$/i);
  if (!m) return json({ error: 'not found' }, 404);
  const [, id, what] = m;
  if (env.ARTIFACTS) {
    try {
      if (!id) {
        const names = await repoNames(env.ARTIFACTS);
        const list = (await Promise.all(names.map((n) => readJson(env.ARTIFACTS!, n, 'project.json')))).filter(Boolean);
        if (list.length) return json(list);
      } else {
        const body = await readJson(env.ARTIFACTS, `proj-${id}`, `${what}.json`);
        if (body) return json(body);
      }
    } catch (e) {
      console.warn('[artifacts] falling back to assets:', e instanceof Error ? e.message : e);
    }
  }
  return fromAssets(req, env, id ? `/projects/${id}.${what}.json` : '/projects/index.json');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/api/decide') {
      if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
      let body: DecideRequest;
      try { body = await req.json(); } catch { return json({ error: 'invalid JSON' }, 400); }
      return json(await decide(body, env));
    }
    if (url.pathname.startsWith('/api/projects')) return projects(req, env, url);
    if (url.pathname === '/api/answer') return json({ error: 'reserved: /api/answer is not implemented in v1' }, 501);
    if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return env.ASSETS.fetch(req);
  },
} satisfies ExportedHandler<Env>;
