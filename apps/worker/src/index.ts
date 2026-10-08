import type { Actor, CoreResponse, SourceBundle, WorldCommand, WorldCommandResponse, WorldState } from '@bropilot/contracts';
import catalog from '@bropilot/contracts/fixtures/catalog.json';
import valid from '@bropilot/contracts/fixtures/assistant-valid.json';
import missing from '@bropilot/contracts/fixtures/assistant-missing.json';
import conflict from '@bropilot/contracts/fixtures/assistant-conflict.json';
import unknown from '@bropilot/contracts/fixtures/assistant-unknown.json';
import { query } from '../../../packages/core-wasm/bropilot_core_wasm.js';
import { RUNNER_HASH, RUNNER_REF } from './runner-manifest.js';
import { LocalWorldDirectory, WorldAuthority, type LocalEnv, type WorldSummary } from './authority.js';

export { LocalWorldDirectory, WorldAuthority };

const snapshots: Record<string, { worldId: string; revisionId: string }> = {
  'assistant-valid': valid, 'assistant-missing': missing,
  'assistant-conflict': conflict, 'assistant-unknown': unknown,
};
const MAX_HTTP_BODY_BYTES = 1024 * 1024;
const OWNER_COOKIE = 'bropilot_local_owner';
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
type Role = 'owner' | 'implementer' | 'verifier';
type Principal = { role: Role; via: 'bearer' | 'cookie' };

const WORKING_SOURCE: SourceBundle = { files: {
  'worker.ts': `export default { async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/health') return Response.json({ status: 'ok' });
    if (path === '/api/message') return Response.json({ message: 'Hello from the verified Worker' });
    return env.ASSETS.fetch(request);
  } };`,
  'public/index.html': '<!doctype html><html><body><main>Verified Worker app</main></body></html>',
} };
const BROKEN_HEALTH_SOURCE: SourceBundle = { files: {
  ...WORKING_SOURCE.files,
  'worker.ts': `export default { async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === '/health') return Response.json({ status: 'broken' });
    if (path === '/api/message') return Response.json({ message: 'The surfaces still respond' });
    return env.ASSETS.fetch(request);
  } };`,
} };

function json(value: unknown, status = 200, headers?: HeadersInit): Response {
  const result = new Headers(headers);
  result.set('content-type', 'application/json; charset=utf-8');
  result.set('cache-control', 'no-store');
  result.set('x-content-type-options', 'nosniff');
  return new Response(JSON.stringify(value), { status, headers: result });
}
function error(code: string, message: string, status: number, headers?: HeadersInit): Response {
  return json({ status: 'error', apiVersion: 1, code, message }, status, headers);
}
function run(input: string): Response {
  const result: CoreResponse = JSON.parse(query(input));
  return json(result, result.status === 'ok' ? 200 : result.code === 'resource_limit' ? 413 : 400);
}
async function boundedBody(request: Request): Promise<string | undefined> {
  if (!request.body) return '';
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      length += chunk.value.byteLength;
      if (length > MAX_HTTP_BODY_BYTES) { await reader.cancel(); return undefined; }
      chunks.push(chunk.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
async function jsonBody(request: Request): Promise<unknown | Response> {
  if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return error('unsupported_media_type', 'Provide an application/json request.', 415);
  }
  const body = await boundedBody(request);
  if (body === undefined) return error('resource_limit', 'HTTP request exceeds 1048576 bytes.', 413);
  try { return JSON.parse(body) as unknown; } catch { return error('malformed_request', 'Provide a valid JSON request body.', 400); }
}
function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function localEnabled(env: LocalEnv) { return env.LOCAL_WORKSPACE === 'enabled'; }
function sameOriginRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (!LOOPBACK_HOSTS.has(url.hostname)) return false;
  const origin = request.headers.get('origin'); if (origin && origin !== url.origin) return false;
  const site = request.headers.get('sec-fetch-site');
  return site !== 'cross-site' && site !== 'same-site';
}
async function digest(value: string) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); }
async function secretEqual(provided: string, expected?: string): Promise<boolean> {
  const [left, right] = await Promise.all([digest(provided), digest(expected ?? '')]);
  return crypto.subtle.timingSafeEqual(left, right) && Boolean(expected);
}
function cookieValue(request: Request, name: string): string | undefined {
  for (const pair of request.headers.get('cookie')?.split(';') ?? []) {
    const separator = pair.indexOf('=');
    if (separator > 0 && pair.slice(0, separator).trim() === name) return pair.slice(separator + 1).trim();
  }
  return undefined;
}
async function ownerSessionValue(env: LocalEnv): Promise<string> {
  const bytes = new Uint8Array(await digest(`bropilot-local-owner-v1:${env.LOCAL_OWNER_TOKEN ?? ''}`));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
async function authenticate(request: Request, env: LocalEnv): Promise<Principal | undefined> {
  const authorization = request.headers.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    const token = authorization.slice(7);
    if (await secretEqual(token, env.LOCAL_OWNER_TOKEN)) return { role: 'owner', via: 'bearer' };
    if (await secretEqual(token, env.LOCAL_IMPLEMENTER_TOKEN)) return { role: 'implementer', via: 'bearer' };
    if (await secretEqual(token, env.LOCAL_VERIFIER_TOKEN)) return { role: 'verifier', via: 'bearer' };
    return undefined;
  }
  const cookie = cookieValue(request, OWNER_COOKIE);
  if (cookie && await secretEqual(cookie, await ownerSessionValue(env))) return { role: 'owner', via: 'cookie' };
  return undefined;
}
async function requireRole(request: Request, env: LocalEnv, roles: readonly Role[]): Promise<Principal | Response> {
  if (!localEnabled(env)) return error('local_workspace_disabled', 'Local workspace APIs are disabled.', 404);
  if (!sameOriginRequest(request)) return error('local_only', 'Local workspace APIs require a loopback same-origin request.', 403);
  const principal = await authenticate(request, env);
  if (!principal) return error('unauthorized', 'A valid local role credential is required.', 401);
  return roles.includes(principal.role) ? principal : error('forbidden', 'This local role cannot perform the operation.', 403);
}
function authority(env: LocalEnv, worldId: string) { return env.WORLD_AUTHORITY.getByName(worldId); }
function directory(env: LocalEnv) { return env.LOCAL_WORLD_DIRECTORY.getByName('local-world-directory-v1'); }
function validWorldId(value: string) { return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value); }
function domainStatus(response: Extract<WorldCommandResponse, { status: 'error' }>): number {
  if (response.code === 'resource_limit') return 413;
  if (response.code === 'forbidden') return 403;
  if (response.code === 'not_found') return 404;
  if (response.code === 'promotion_blocked') return 422;
  if (response.code === 'invalid_state' || response.code === 'serialization_error') return 500;
  return ['duplicate_id', 'world_already_exists', 'idempotency_conflict', 'stale_head', 'stale_move', 'move_closed', 'run_not_claimable', 'run_not_running', 'lease_mismatch', 'lease_expired', 'binding_mismatch'].includes(response.code) ? 409 : 400;
}
async function syncDirectory(env: LocalEnv, state: WorldState): Promise<void> {
  const world: WorldSummary = { worldId: state.worldId, title: state.title, headRevisionId: state.headRevisionId, desiredRevisionId: state.desired.revisionId };
  await directory(env).upsert(world);
}
async function execute(env: LocalEnv, worldId: string, actor: Actor, command: WorldCommand): Promise<Response> {
  const response = await authority(env, worldId).execute(actor, Date.now(), command);
  if (response.status === 'error') return json(response, domainStatus(response));
  await syncDirectory(env, response.state); return json(response);
}
function actorForCommand(principal: Principal, command: WorldCommand): Actor | undefined {
  if (command.kind === 'submitCandidate') return principal.role === 'owner' || principal.role === 'implementer' ? 'implementer' : undefined;
  if (command.kind === 'startVerification') return principal.role === 'owner' || principal.role === 'implementer' ? 'owner' : undefined;
  if (command.kind === 'createMove' || command.kind === 'promote') return principal.role === 'owner' ? 'owner' : undefined;
  return undefined;
}

async function localRoute(request: Request, env: LocalEnv, path: string): Promise<Response | undefined> {
  if (path === '/api/v1/local/session') {
    if (request.method !== 'GET') return error('method_not_allowed', 'Use GET for a local session.', 405, { Allow: 'GET' });
    if (!localEnabled(env)) return json({ enabled: false });
    if (!sameOriginRequest(request)) return error('local_only', 'Local sessions require a loopback same-origin request.', 403);
    if (!env.LOCAL_OWNER_TOKEN) return error('local_configuration_error', 'The local owner credential is unavailable.', 503);
    return json({ enabled: true }, 200, { 'set-cookie': `${OWNER_COOKIE}=${await ownerSessionValue(env)}; Path=/; HttpOnly; SameSite=Strict` });
  }
  if (path === '/api/v1/worlds') {
    const principal = await requireRole(request, env, ['owner']); if (principal instanceof Response) return principal;
    if (request.method === 'GET') return json({ worlds: await directory(env).list() });
    if (request.method !== 'POST') return error('method_not_allowed', 'Use GET or POST for local Worlds.', 405, { Allow: 'GET, POST' });
    const parsed = await jsonBody(request); if (parsed instanceof Response) return parsed; const body = record(parsed);
    if (!body || typeof body.worldId !== 'string' || typeof body.title !== 'string' || typeof body.requestId !== 'string' || !validWorldId(body.worldId)) return error('invalid_input', 'worldId, title and requestId are required.', 400);
    if (Object.values(snapshots).some(item => item.worldId === body.worldId)) return error('reserved_identity', 'This World id belongs to a read-only example.', 409);
    return execute(env, body.worldId, 'owner', { kind: 'createWorld', worldId: body.worldId, title: body.title, runnerHash: RUNNER_HASH, requestId: body.requestId });
  }
  if (path === '/api/v1/local-kit') {
    const principal = await requireRole(request, env, ['owner', 'implementer']); if (principal instanceof Response) return principal;
    if (request.method !== 'GET') return error('method_not_allowed', 'Use GET for the local Kit.', 405, { Allow: 'GET' });
    return json({ sources: { working: WORKING_SOURCE, brokenHealth: BROKEN_HEALTH_SOURCE }, runnerHash: RUNNER_HASH, runnerRef: RUNNER_REF });
  }
  if (path === '/api/v1/local-verifier/jobs') {
    const principal = await requireRole(request, env, ['verifier']); if (principal instanceof Response) return principal;
    if (request.method !== 'GET') return error('method_not_allowed', 'Use GET for verifier jobs.', 405, { Allow: 'GET' });
    if (!await secretEqual(request.headers.get('x-bropilot-runner-hash') ?? '', RUNNER_HASH)) return error('runner_mismatch', 'Verifier runner hash is not registered.', 403);
    const worlds = await directory(env).list();
    const jobs = (await Promise.all(worlds.map((world) => authority(env, world.worldId).getRunnableJobs(Date.now())))).flat();
    return json({ jobs: jobs.slice(0, 64) });
  }
  const runMatch = /^\/api\/v1\/worlds\/([^/]+)\/runs\/([^/]+)\/(claim|complete)$/.exec(path);
  if (runMatch) {
    const principal = await requireRole(request, env, ['verifier']); if (principal instanceof Response) return principal;
    if (request.method !== 'POST') return error('method_not_allowed', 'Use POST for verifier run updates.', 405, { Allow: 'POST' });
    if (!await secretEqual(request.headers.get('x-bropilot-runner-hash') ?? '', RUNNER_HASH)) return error('runner_mismatch', 'Verifier runner hash is not registered.', 403);
    const worldId = decodeURIComponent(runMatch[1]); const runId = decodeURIComponent(runMatch[2]);
    if (!validWorldId(worldId)) return error('invalid_identity', 'Invalid World identity.', 400);
    const stub = authority(env, worldId); const state = await stub.getState(); const run = state?.runs.find((item) => item.runId === runId);
    if (!state || !run) return error('not_found', 'Verification run not found.', 404);
    if (runMatch[3] === 'claim') {
      if (run.attempt >= 4) return error('attempt_limit', 'Verification requires manual intervention after four attempts.', 409);
      const parsed = await jsonBody(request); if (parsed instanceof Response) return parsed; const body = record(parsed);
      if (!body || typeof body.runnerHash !== 'string') return error('invalid_input', 'runnerHash is required.', 400);
      if (!await secretEqual(body.runnerHash, RUNNER_HASH)) return error('runner_mismatch', 'Verifier runner hash is not registered.', 403);
      const leaseId = crypto.randomUUID();
      const response = await stub.execute('verifier', Date.now(), { kind: 'claimRun', runId, leaseId, verifierId: `local-verifier:${RUNNER_REF}`, runnerHash: RUNNER_HASH, requestId: crypto.randomUUID() });
      if (response.status === 'error') return json(response, domainStatus(response));
      await syncDirectory(env, response.state); const job = await stub.getClaimedJob(runId, leaseId);
      return job ? json({ job }) : error('authority_error', 'Claimed job could not be projected.', 500);
    }
    const parsed = await jsonBody(request); if (parsed instanceof Response) return parsed; const body = record(parsed);
    if (!body || body.runId !== runId || typeof body.leaseId !== 'string'
      || typeof body.sourceDigest !== 'string' || typeof body.contractHash !== 'string'
      || typeof body.planHash !== 'string' || !Array.isArray(body.observations)
      || !(body.buildDigest === null || typeof body.buildDigest === 'string')) {
      return error('invalid_input', 'Matching runId, leaseId, sourceDigest, contractHash, planHash, buildDigest and observations are required.', 400);
    }
    return execute(env, worldId, 'verifier', { kind: 'completeRun', runId, leaseId: body.leaseId, sourceDigest: body.sourceDigest, contractHash: body.contractHash, planHash: body.planHash, buildDigest: body.buildDigest, observations: body.observations as Extract<WorldCommand, { kind: 'completeRun' }>['observations'], requestId: `complete:${runId}:${body.leaseId}` });
  }
  const commandMatch = /^\/api\/v1\/worlds\/([^/]+)\/commands$/.exec(path);
  if (commandMatch) {
    const principal = await requireRole(request, env, ['owner', 'implementer']); if (principal instanceof Response) return principal;
    if (request.method !== 'POST') return error('method_not_allowed', 'Use POST for World commands.', 405, { Allow: 'POST' });
    const parsed = await jsonBody(request); if (parsed instanceof Response) return parsed; const body = record(parsed);
    if (!body || typeof body.kind !== 'string') return error('invalid_input', 'Provide one World command.', 400);
    const command = body as WorldCommand; const actor = actorForCommand(principal, command);
    if (!actor) return error('forbidden', 'This credential cannot execute the command kind.', 403);
    if ('state' in body || 'actor' in body || 'nowMs' in body || 'runnerHash' in body) return error('invalid_input', 'Provide one command without state, actor, time or runner fields.', 400);
    const worldId = decodeURIComponent(commandMatch[1]); if (!validWorldId(worldId)) return error('invalid_identity', 'Invalid World identity.', 400);
    return execute(env, worldId, actor, command);
  }
  const worldMatch = /^\/api\/v1\/worlds\/([^/]+)$/.exec(path);
  if (worldMatch) {
    const principal = await requireRole(request, env, ['owner']); if (principal instanceof Response) return principal;
    if (request.method !== 'GET') return error('method_not_allowed', 'Use GET for local World state.', 405, { Allow: 'GET' });
    const worldId = decodeURIComponent(worldMatch[1]); if (!validWorldId(worldId)) return error('invalid_identity', 'Invalid World identity.', 400);
    const state = await authority(env, worldId).getState(); if (!state) return error('not_found', 'Local World not found.', 404);
    await syncDirectory(env, state); return json({ state });
  }
  return undefined;
}

export default {
  async fetch(request, env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (!path.startsWith('/api/')) return env.ASSETS.fetch(request);
    try {
      if (path === '/api/v1/examples') {
        if (request.method !== 'GET') return error('method_not_allowed', 'Use GET for example revisions.', 405, { Allow: 'GET' });
        return json(catalog.fixtures.map((fixture) => ({ worldId: snapshots[fixture.id].worldId, revisionId: snapshots[fixture.id].revisionId, title: fixture.title, scenario: fixture.description })));
      }
      if (path === '/api/v1/query') {
        if (request.method !== 'POST') return error('method_not_allowed', 'Use POST for domain queries.', 405, { Allow: 'POST' });
        if (request.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return error('unsupported_media_type', 'Provide an application/json request.', 415);
        const body = await boundedBody(request);
        return body === undefined ? error('resource_limit', 'HTTP request exceeds 1048576 bytes.', 413) : run(body);
      }
      const revision = /^\/api\/v1\/worlds\/([^/]+)\/revisions\/([^/]+)$/.exec(path);
      if (revision) {
        if (request.method !== 'GET') return error('method_not_allowed', 'Pinned example revisions are read-only.', 405, { Allow: 'GET' });
        const worldId = decodeURIComponent(revision[1]); const revisionId = decodeURIComponent(revision[2]);
        const fixture = Object.hasOwn(snapshots, revisionId) ? snapshots[revisionId] : undefined;
        if (fixture?.worldId === worldId) return run(JSON.stringify({ apiVersion: 1, snapshot: fixture, query: { kind: 'workspace' } }));
        if (Object.values(snapshots).some((item) => item.worldId === worldId)) return error('revision_not_found', 'This pinned example revision is unavailable.', 404);
        const principal = await requireRole(request, env, ['owner']); if (principal instanceof Response) return principal;
        if (!validWorldId(worldId)) return error('invalid_identity', 'Invalid World identity.', 400);
        const local = await authority(env, worldId).getRevision(revisionId);
        return local ? run(JSON.stringify({ apiVersion: 1, snapshot: local, query: { kind: 'workspace' } })) : error('revision_not_found', 'This pinned revision is unavailable.', 404);
      }
      return await localRoute(request, env, path) ?? error('route_not_found', 'This API route is unavailable.', 404);
    } catch (cause) {
      if (cause instanceof URIError) return error('invalid_identity', 'Malformed World or revision identity.', 400);
      console.error(JSON.stringify({ event: 'worker_request_failed', error: cause instanceof Error ? cause.name : 'UnknownError' }));
      return error('core_unavailable', 'The World service could not complete this request.', 500);
    }
  },
} satisfies ExportedHandler<LocalEnv>;
