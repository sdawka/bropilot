import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, createWriteStream } from 'node:fs';
import { once } from 'node:events';

const origin = 'http://127.0.0.1:8792';
let server;
let logs;
before(async () => {
  mkdirSync('.test-artifacts', { recursive: true });
  logs = createWriteStream('.test-artifacts/worker.log');
  server = spawn(process.execPath, ['node_modules/wrangler/bin/wrangler.js', 'dev', '--config', 'apps/worker/wrangler.jsonc', '--ip', '127.0.0.1', '--port', '8792', '--local'], { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  server.stdout.pipe(logs); server.stderr.pipe(logs);
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`Worker exited (${server.exitCode}); see .test-artifacts/worker.log`);
    try { await fetch(`${origin}/api/v1/examples`); return; } catch { await new Promise(resolve => setTimeout(resolve, 250)); }
  }
  throw new Error('Worker startup timeout; see .test-artifacts/worker.log');
});
after(async () => {
  if (server && server.exitCode === null) { server.kill('SIGTERM'); await once(server, 'exit'); }
  logs?.end();
});

function native(input) {
  return JSON.parse(execFileSync('target/debug/bropilot-query', { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 }));
}
async function query(input) {
  const response = await fetch(`${origin}/api/v1/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: input });
  return { response, data: await response.json() };
}

test('catalog lists four explicit example revisions', async () => {
  const response = await fetch(`${origin}/api/v1/examples`);
  assert.equal(response.status, 200);
  const catalog = await response.json();
  assert.equal(catalog.length, 4);
  assert.ok(catalog.every(item => item.worldId && item.revisionId && item.scenario));
});

test('unknown pinned revisions stay unavailable', async () => {
  const response = await fetch(`${origin}/api/v1/worlds/assistant/revisions/not-a-revision`);
  assert.equal(response.status, 404);
  assert.equal((await response.json()).status, 'error');
});

test('query endpoint rejects unsupported methods', async () => {
  const response = await fetch(`${origin}/api/v1/query`);
  assert.equal(response.status, 405);
});

test('actual workerd Wasm agrees with native Rust for all fixtures and query modes', async () => {
  const catalog = JSON.parse(readFileSync('packages/contracts/fixtures/catalog.json', 'utf8')).fixtures;
  for (const item of catalog) {
    const snapshot = JSON.parse(readFileSync(`packages/contracts/fixtures/${item.id}.json`, 'utf8'));
    for (const requestQuery of [{ kind: 'workspace' }, { kind: 'readiness' }, { kind: 'children', parentId: snapshot.worldId }]) {
      const input = JSON.stringify({ apiVersion: 1, snapshot, query: requestQuery });
      const { response, data } = await query(input);
      assert.equal(response.status, 200);
      assert.deepEqual(data, native(input), `${item.id}:${requestQuery.kind}`);
    }
    const response = await fetch(`${origin}/api/v1/worlds/${snapshot.worldId}/revisions/${snapshot.revisionId}`);
    assert.deepEqual(await response.json(), native(JSON.stringify({ apiVersion: 1, snapshot, query: { kind: 'workspace' } })));
  }
});

test('malformed and version errors retain native Rust semantics', async () => {
  for (const input of ['{', '{}', JSON.stringify({ apiVersion: 9 })]) {
    const { response, data } = await query(input);
    assert.equal(response.status, 400);
    assert.deepEqual(data, native(input));
  }
});

test('oversize HTTP bodies are bounded before entering Wasm', async () => {
  const { response, data } = await query(' '.repeat(1024 * 1024 + 1));
  assert.equal(response.status, 413);
  assert.equal(data.status, 'error');
});

test('requests do not contaminate subsequent snapshot results', async () => {
  const catalog = JSON.parse(readFileSync('packages/contracts/fixtures/catalog.json', 'utf8')).fixtures;
  const snapshot = JSON.parse(readFileSync(`packages/contracts/fixtures/${catalog[0].id}.json`, 'utf8'));
  const input = JSON.stringify({ apiVersion: 1, snapshot, query: { kind: 'readiness' } });
  const first = (await query(input)).data;
  await query('{');
  assert.deepEqual((await query(input)).data, first);
});


test('untrusted template rule counts are rejected before inference in native and workerd', async () => {
  const snapshot = JSON.parse(readFileSync('packages/contracts/fixtures/assistant-valid.json', 'utf8'));
  const rule = snapshot.template.forbiddenCycles[0];
  snapshot.template.forbiddenCycles = Array.from({ length: 33 }, (_, index) => ({ ...rule, ruleId: `excess-rule-${index}` }));
  const input = JSON.stringify({ apiVersion: 1, snapshot, query: { kind: 'readiness' } });
  const expected = native(input);
  assert.equal(expected.status, 'error');
  assert.equal(expected.code, 'resource_limit');
  const { response, data } = await query(input);
  assert.equal(response.status, 413);
  assert.deepEqual(data, expected);
});

test('query media types and unknown API paths stay explicit', async () => {
  const media = await fetch(`${origin}/api/v1/query`, { method: 'POST', body: '{}' });
  assert.equal(media.status, 415);
  assert.equal((await media.json()).code, 'unsupported_media_type');
  const missing = await fetch(`${origin}/api/v1/not-an-endpoint`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).code, 'route_not_found');
});


test('input digests distinguish facts under the same revision label', async () => {
  const snapshot = JSON.parse(readFileSync('packages/contracts/fixtures/assistant-valid.json', 'utf8'));
  const base = JSON.stringify({ apiVersion: 1, snapshot, query: { kind: 'readiness' } });
  snapshot.objects[0].title += ' revised';
  const changed = JSON.stringify({ apiVersion: 1, snapshot, query: { kind: 'readiness' } });
  const first = (await query(base)).data;
  const second = (await query(changed)).data;
  assert.equal(first.status, 'ok'); assert.equal(second.status, 'ok');
  assert.notEqual(first.result.evaluation.snapshotHash, second.result.evaluation.snapshotHash);
  assert.equal(first.result.evaluation.templateHash, second.result.evaluation.templateHash);
  assert.deepEqual(second, native(changed));
});

test('unsupported pack pins and wrong typed references cannot become ready', async () => {
  for (const edit of [
    snapshot => { snapshot.rulePacks = [{ id: 'does-not-exist', version: '999' }]; },
    snapshot => { snapshot.purpose.beneficiaryIds = ['outcome-1']; },
  ]) {
    const snapshot = JSON.parse(readFileSync('packages/contracts/fixtures/assistant-valid.json', 'utf8'));
    edit(snapshot);
    const input = JSON.stringify({ apiVersion: 1, snapshot, query: { kind: 'readiness' } });
    const { data } = await query(input);
    assert.equal(data.status, 'ok');
    assert.notEqual(data.result.evaluation.status, 'ready');
    assert.deepEqual(data, native(input));
  }
});
