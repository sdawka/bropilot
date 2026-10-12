import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startLocalSession } from '../scripts/local-session.mjs';
import { EXAMPLE_MESSAGES } from '../packages/ontology-lab/domain.mjs';

let session, directory, logs;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'bropilot-ontology-http-'));
  await mkdir('.test-artifacts', { recursive: true });
  logs = createWriteStream('.test-artifacts/ontology-http.log');
  await once(logs, 'open');
  session = await startLocalSession({ port: 8796, directory, output: logs, verifier: false });
});
after(async () => { await session?.stop(); logs?.end(); await rm(directory, { recursive: true, force: true }); });
function request(path, body, headers = {}) {
  return fetch(`${session.origin}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const run = { mode: 'example', messages: EXAMPLE_MESSAGES };

test('ontology model runner requires the local owner and same-origin requests', async () => {
  assert.equal((await request('/api/v1/ontology-lab/run', run)).status, 401);
  assert.equal((await request('/api/v1/ontology-lab/run', run, { authorization: `Bearer ${session.keys.implementer}` })).status, 403);
  assert.equal((await request('/api/v1/ontology-lab/run', run, { authorization: `Bearer ${session.keys.owner}`, origin: 'https://attacker.invalid' })).status, 403);
});

test('example trace maps only its draft, records actual Wasm criteria and remains reproducible', async () => {
  const response = await request('/api/v1/ontology-lab/run', run, { authorization: `Bearer ${session.keys.owner}` });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /ndjson/);
  const events = (await response.text()).trim().split('\n').map(line => JSON.parse(line));
  assert.ok(events.length > 8);
  assert.ok(events.some(event => event.actor === 'input' && event.targets.messageIds.length));
  assert.ok(events.some(event => event.actor === 'mapper' && event.targets.objectIds.length));
  const checked = events.find(event => event.actor === 'criteria' && event.evaluation);
  assert.ok(checked, JSON.stringify(events.at(-1)));
  const core = await request('/api/v1/query', { apiVersion: 1, snapshot: checked.snapshot, query: { kind: 'readiness' } });
  const result = await core.json();
  assert.equal(result.status, 'ok');
  assert.deepEqual(checked.evaluation, result.result.evaluation);
  assert.ok(checked.evaluation.findings.length > 0);
  assert.ok(events.some(event => event.actor === 'feedback' && event.questions.length));
  const worlds = await request('/api/v1/worlds', undefined, { authorization: `Bearer ${session.keys.owner}` });
  assert.deepEqual((await worlds.json()).worlds, []);
});

test('example extraction cannot be falsely applied to arbitrary chat', async () => {
  const response = await request('/api/v1/ontology-lab/run', { mode: 'example', messages: [{ id: 'm1', role: 'user', text: 'Something entirely different' }] }, { authorization: `Bearer ${session.keys.owner}` });
  assert.equal(response.status, 400);
});

test('local browser session can obtain capabilities without exposing runner credentials', async () => {
  const bootstrap = await request('/api/v1/local/session');
  const cookie = bootstrap.headers.get('set-cookie').split(';')[0];
  const response = await request('/api/v1/ontology-lab/capabilities', undefined, { cookie });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(typeof body.available, 'boolean');
  assert.equal(body.provider, 'codex');
  assert.ok(!JSON.stringify(body).includes(session.keys.owner));
});
