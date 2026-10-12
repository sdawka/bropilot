import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { startLocalSession } from '../scripts/local-session.mjs';

let session, directory, logs;
const worldId = 'assistant-world';
const baselineRevisionId = 'assistant-impact-baseline';
const targetRevisionId = 'assistant-impact-calendar-adapter';
const impactPath = world => `/api/v1/worlds/${world}/analysis/change-impact`;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'bropilot-change-impact-'));
  await mkdir('.test-artifacts', { recursive: true });
  logs = createWriteStream('.test-artifacts/change-impact.log');
  await once(logs, 'open');
  session = await startLocalSession({ port: 8827, directory, output: logs, verifier: false, ontologyLab: false });
});
after(async () => { await session?.stop(); logs?.end(); await rm(directory, { recursive: true, force: true }); });

async function api(path, body, role, headers = {}) {
  const response = await fetch(`${session.origin}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(role ? { authorization: `Bearer ${session.keys[role]}` } : {}), 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: await response.json() };
}
const saved = () => ({ baselineRevisionId, target: { kind: 'saved', revisionId: targetRevisionId } });
const hypothetical = operations => ({ baselineRevisionId, target: { kind: 'hypothetical', patch: { operations } } });

test('saved comparison uses exact server snapshots and synthetic advisory evidence', async () => {
  const result = await api(impactPath(worldId), saved());
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.report.origin, 'saved');
  assert.equal(result.data.report.baseline.revisionId, baselineRevisionId);
  assert.equal(result.data.report.target.revisionId, targetRevisionId);
  assert.match(result.data.report.baseline.snapshotHash, /^[a-f0-9]{64}$/);
  assert.ok(result.data.report.changes.length > 0);
  assert.ok(result.data.report.evidence.length > 0);
  assert.ok(result.data.report.evidence.every(item => item.provenance === 'synthetic'));
  assert.ok(result.data.report.evidence.some(item => item.applicability === 'needsRecheck'));
  const baseline = JSON.parse(await readFile(`packages/contracts/fixtures/${baselineRevisionId}.json`, 'utf8'));
  assert.deepEqual(result.data.baselineSnapshot, baseline);
  const target = JSON.parse(await readFile(`packages/contracts/fixtures/${targetRevisionId}.json`, 'utf8'));
  assert.deepEqual(result.data.targetSnapshot, target);
});

test('hypothetical Wasm patch has a distinct unpersisted identity and leaves baseline immutable', async () => {
  const pinnedPath = `/api/v1/worlds/${worldId}/revisions/${baselineRevisionId}`;
  const before = await api(pinnedPath);
  assert.equal(before.status, 200);
  const baseline = before.data.result.snapshot;
  const thing = baseline.things[0];
  const body = hypothetical([{ kind: 'setThingRevision', thingId: thing.id, revisionId: 'what-if-revision' }]);
  const first = await api(impactPath(worldId), body);
  const second = await api(impactPath(worldId), body);
  assert.equal(first.status, 200, JSON.stringify(first.data));
  assert.equal(second.status, 200, JSON.stringify(second.data));
  assert.equal(first.data.report.origin, 'hypothetical');
  assert.match(first.data.targetSnapshot.revisionId, /^draft:/);
  assert.notEqual(first.data.targetSnapshot.revisionId, baseline.revisionId);
  assert.notEqual(first.data.targetSnapshot.revisionId, second.data.targetSnapshot.revisionId);
  assert.notEqual(first.data.report.baseline.snapshotHash, first.data.report.target.snapshotHash);
  assert.deepEqual(first.data.baselineSnapshot, baseline);
  assert.deepEqual((await api(pinnedPath)).data, before.data);
  assert.equal((await api(`/api/v1/worlds/${worldId}/revisions/${first.data.targetSnapshot.revisionId}`)).status, 404);
});

test('analysis cannot accept forged server origin, evidence, snapshots, or malformed patches', async () => {
  for (const body of [
    { ...saved(), origin: 'saved' },
    { ...saved(), context: { evidenceBindings: [], origin: 'saved' } },
    { ...saved(), baselineSnapshot: {} },
    { baselineRevisionId, target: { kind: 'saved', revisionId: targetRevisionId, origin: 'saved' } },
    { baselineRevisionId, target: { kind: 'hypothetical', patch: { operations: [], authority: 'serverResolved' } } },
    hypothetical([{ kind: 'promote', candidateId: 'forged' }]),
    hypothetical([{ kind: 'setThingRevision', thingId: 'missing', revisionId: 'fake' }]),
    hypothetical([{ kind: 'setProperty', objectId: 'missing', property: 'status', value: 'done' }]),
    hypothetical([{ kind: 'setThingRevision', thingId: 'x', revisionId: 'y', source: 'forged' }]),
  ]) {
    const response = await api(impactPath(worldId), body);
    assert.equal(response.status, 400, JSON.stringify(response.data));
    assert.equal(response.data.status, 'error');
  }
});

test('missing and cross-world revisions cannot be compared', async () => {
  for (const body of [
    { ...saved(), baselineRevisionId: 'missing-revision' },
    { baselineRevisionId, target: { kind: 'saved', revisionId: 'missing-revision' } },
  ]) assert.equal((await api(impactPath(worldId), body)).status, 404);
  const cross = await api(impactPath('wrong-world'), saved(), 'owner');
  assert.equal(cross.status, 404);
});

test('legacy examples explicitly report the impact pack is not configured', async () => {
  const response = await api(impactPath(worldId), { baselineRevisionId: 'assistant-valid', target: { kind: 'saved', revisionId: 'assistant-missing' } });
  assert.equal(response.status, 400, JSON.stringify(response.data));
  assert.equal(response.data.code, 'not_configured');
});

test('HTTP limits and method/media checks run before analysis', async () => {
  assert.equal((await api(impactPath(worldId))).status, 405);
  const media = await fetch(`${session.origin}${impactPath(worldId)}`, { method: 'POST', body: '{}' });
  assert.equal(media.status, 415);
  const oversized = await fetch(`${session.origin}${impactPath(worldId)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: ' '.repeat(1024 * 1024 + 1) });
  assert.equal(oversized.status, 413);
  const malformed = await fetch(`${session.origin}${impactPath(worldId)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400);
});

test('local authorization matches pinned revision reads and analysis never mutates authority state', async () => {
  const localWorld = `impact-local-${randomUUID()}`;
  const created = await api('/api/v1/worlds', { worldId: localWorld, title: 'Read-only analysis', requestId: randomUUID() }, 'owner');
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const revisionId = created.data.state.headRevisionId;
  const localBody = { baselineRevisionId: revisionId, target: { kind: 'saved', revisionId } };
  const path = impactPath(localWorld);
  assert.equal((await api(path, localBody)).status, 401);
  assert.equal((await api(path, localBody, 'implementer')).status, 403);
  assert.equal((await api(path, localBody, 'verifier')).status, 403);
  assert.equal((await api(path, localBody, 'owner', { origin: 'https://attacker.example', 'sec-fetch-site': 'cross-site' })).status, 403);
  const before = await api(`/api/v1/worlds/${localWorld}`, undefined, 'owner');
  const analyzed = await api(path, localBody, 'owner');
  assert.equal(analyzed.status, 400, JSON.stringify(analyzed.data));
  assert.equal(analyzed.data.code, 'not_configured');
  const missing = await api(path, { baselineRevisionId: revisionId, target: { kind: 'saved', revisionId: 'missing' } }, 'owner');
  assert.equal(missing.status, 404);
  const after = await api(`/api/v1/worlds/${localWorld}`, undefined, 'owner');
  assert.deepEqual(after.data.state, before.data.state);
  assert.equal(after.data.state.moves.length, 1);
  assert.equal(after.data.state.candidates.length, 0);
  assert.equal(after.data.state.runs.length, 0);
  assert.deepEqual(after.data.state.revisions, created.data.state.revisions);
});
