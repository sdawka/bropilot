import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startLocalSession } from '../scripts/local-session.mjs';
import { getRunnerHash, verifyJob } from '../packages/local-verifier/src/index.mjs';

let session, directory, logs, kit;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'bropilot-realization-'));
  await mkdir('.test-artifacts', { recursive: true });
  logs = createWriteStream('.test-artifacts/realization.log');
  await once(logs, 'open');
  session = await startLocalSession({ port: 8793, directory, output: logs, verifier: false });
  kit = (await api('/api/v1/local-kit')).data;
});
after(async () => { await session?.stop(); logs?.end(); await rm(directory, { recursive: true, force: true }); });
async function api(path, body, role = 'owner', extraHeaders = {}) {
  const response = await fetch(`${session.origin}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { authorization: `Bearer ${session.keys[role]}`, 'content-type': 'application/json', ...extraHeaders },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json(), headers: response.headers };
}
async function create() {
  const worldId = `http-${randomUUID()}`;
  const body = { worldId, title: 'HTTP integration', requestId: randomUUID() };
  const first = await api('/api/v1/worlds', body);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  const retry = await api('/api/v1/worlds', body);
  assert.deepEqual(retry.data.result, first.data.result);
  return { worldId, state: first.data.state, moveId: first.data.result.moveId };
}
async function command(worldId, command, role) {
  return api(`/api/v1/worlds/${worldId}/commands`, { requestId: randomUUID(), ...command }, role);
}
async function candidate(world, source) {
  const candidateId = `candidate-${randomUUID()}`;
  const submitted = await command(world.worldId, { kind: 'submitCandidate', candidateId, moveId: world.moveId, source }, 'implementer');
  assert.equal(submitted.status, 200, JSON.stringify(submitted.data));
  const started = await command(world.worldId, { kind: 'startVerification', candidateId });
  assert.equal(started.status, 200, JSON.stringify(started.data));
  return { candidateId, runId: started.data.result.runId };
}
async function verify(worldId, runId) {
  const runnerHash = await getRunnerHash();
  const base = `/api/v1/worlds/${worldId}/runs/${runId}`;
  const headers = { 'x-bropilot-runner-hash': runnerHash };
  const claimed = await api(`${base}/claim`, { runnerHash }, 'verifier', headers);
  assert.equal(claimed.status, 200, JSON.stringify(claimed.data));
  const output = await verifyJob(claimed.data.job);
  const complete = await api(`${base}/complete`, output, 'verifier', headers);
  assert.equal(complete.status, 200, JSON.stringify(complete.data));
  const replay = await api(`${base}/complete`, output, 'verifier', headers);
  assert.equal(replay.status, 200, JSON.stringify(replay.data));
  assert.deepEqual(replay.data.result, complete.data.result);
  return complete;
}

test('actual durable Worker accepts protected verifier evidence and promotes with CAS', async () => {
  const world = await create();
  const first = await candidate(world, kit.sources.working);
  const second = await candidate(world, kit.sources.working);
  const denied = await command(world.worldId, { kind: 'promote', candidateId: first.candidateId, expectedHeadRevisionId: world.state.headRevisionId });
  assert.equal(denied.status, 422);
  for (const item of [first, second]) {
    const complete = await verify(world.worldId, item.runId);
    assert.equal(complete.data.result.aggregate, 'ready');
    const evaluation = complete.data.state.runs.find(run => run.runId === item.runId).evaluations[0];
    assert.equal(evaluation.observations.length, 4);
    assert.ok(evaluation.observations.every(observation => observation.result === 'pass'));
    assert.match(evaluation.buildDigest, /^[a-f0-9]{64}$/);
  }
  const wrongRole = await command(world.worldId, { kind: 'promote', candidateId: first.candidateId, expectedHeadRevisionId: world.state.headRevisionId }, 'implementer');
  assert.equal(wrongRole.status, 403);
  const promoted = await command(world.worldId, { kind: 'promote', candidateId: first.candidateId, expectedHeadRevisionId: world.state.headRevisionId });
  assert.equal(promoted.status, 200, JSON.stringify(promoted.data));
  const stale = await command(world.worldId, { kind: 'promote', candidateId: second.candidateId, expectedHeadRevisionId: world.state.headRevisionId });
  assert.equal(stale.status, 409);
  const pinned = await api(`/api/v1/worlds/${world.worldId}/revisions/${promoted.data.result.revisionId}`);
  assert.equal(pinned.status, 200);
  assert.equal(pinned.data.status, 'ok');
  const head = promoted.data.result.revisionId;
  await session.stop();
  session = await startLocalSession({ port: 8793, directory, output: logs, verifier: false });
  const restored = await api(`/api/v1/worlds/${world.worldId}`);
  assert.equal(restored.data.state.headRevisionId, head);
  assert.equal(restored.data.state.runs[0].evaluations.length, 1);
  const catalog = await api('/api/v1/worlds');
  assert.ok(catalog.data.worlds.some(item => item.worldId === world.worldId));
});

test('failed health stays blocked and cannot become canonical', async () => {
  const world = await create();
  const item = await candidate(world, kit.sources.brokenHealth);
  const completed = await verify(world.worldId, item.runId);
  assert.equal(completed.data.result.aggregate, 'blocked');
  const denied = await command(world.worldId, { kind: 'promote', candidateId: item.candidateId, expectedHeadRevisionId: world.state.headRevisionId });
  assert.equal(denied.status, 422);
  assert.equal((await api(`/api/v1/worlds/${world.worldId}`)).data.state.headRevisionId, world.state.headRevisionId);
});

test('role, runner and browser origin boundaries reject forged local authority', async () => {
  const reserved = await api('/api/v1/worlds', { worldId: 'assistant-world', title: 'Collision', requestId: randomUUID() });
  assert.equal(reserved.status, 409);
  const world = await create();
  const item = await candidate(world, kit.sources.working);
  const forged = await command(world.worldId, { kind: 'completeRun', runId: item.runId, actor: 'verifier', state: world.state });
  assert.equal(forged.status, 403);
  const claim = await api(`/api/v1/worlds/${world.worldId}/runs/${item.runId}/claim`, { runnerHash: '0'.repeat(64) }, 'verifier', { 'x-bropilot-runner-hash': '0'.repeat(64) });
  assert.equal(claim.status, 403);
  const hostile = await api('/api/v1/worlds', { worldId: 'hostile', title: 'Hostile', requestId: randomUUID() }, 'owner', { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' });
  assert.equal(hostile.status, 403);
  const unauthenticated = await fetch(`${session.origin}/api/v1/worlds`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(unauthenticated.status, 401);
});

test('concurrent claims are exclusive and mismatched evidence does not complete a run', async () => {
  const world = await create();
  const item = await candidate(world, kit.sources.working);
  const runnerHash = await getRunnerHash();
  const base = `/api/v1/worlds/${world.worldId}/runs/${item.runId}`;
  const headers = { 'x-bropilot-runner-hash': runnerHash };
  const claims = await Promise.all([api(`${base}/claim`, { runnerHash }, 'verifier', headers), api(`${base}/claim`, { runnerHash }, 'verifier', headers)]);
  assert.deepEqual(claims.map(item => item.status).sort(), [200, 409]);
  const job = claims.find(item => item.status === 200).data.job;
  const output = await verifyJob(job);
  const mismatched = await api(`${base}/complete`, { ...output, sourceDigest: '0'.repeat(64) }, 'verifier', headers);
  assert.equal(mismatched.status, 409);
  const stored = await api(`/api/v1/worlds/${world.worldId}`);
  assert.equal(stored.data.state.runs[0].status, 'running');
  const valid = await api(`${base}/complete`, output, 'verifier', headers);
  assert.equal(valid.status, 200, JSON.stringify(valid.data));
});
