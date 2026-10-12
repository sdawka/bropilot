import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadOAuth() {
  let source = await readFile(new URL('../apps/worker/src/cloudflare/oauth.ts', import.meta.url), 'utf8');
  const stub = `data:text/javascript,${encodeURIComponent(`export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }`)}`;
  source = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace('cloudflare:workers', stub);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

class MemoryStorage {
  map = new Map();
  async get(key) { return this.map.get(key); }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async delete(key) { return this.map.delete(key); }
  async transaction(callback) { return callback(this); }
}
const key = Buffer.alloc(32, 7).toString('base64url');

function setupFetch(provider = { subject: 'cf-user' }) {
  const calls = [];
  const fetcher = { async fetch(input, init = {}) {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith('/oauth2/token')) return Response.json({ access_token: 'access-secret', refresh_token: 'refresh-secret', token_type: 'Bearer', expires_in: 3600 });
    if (url.endsWith('/oauth2/userinfo')) return Response.json({ sub: provider.subject });
    if (url.includes('/workers/subdomain')) return Response.json({ success: true, result: { subdomain: 'example' } });
    if (url.endsWith('/oauth2/revoke')) return new Response(null, { status: 200 });
    throw new Error(`unexpected ${url}`);
  } };
  return { calls, fetcher };
}

test('OAuth callback is exact-origin, expiring, and single use', async () => {
  const { CloudflareConnectionStore } = await loadOAuth();
  const { calls, fetcher } = setupFetch();
  const store = new CloudflareConnectionStore({ storage: new MemoryStorage() }, {
    CF_OAUTH_CLIENT_ID: 'client', CF_OAUTH_CLIENT_SECRET: 'secret',
    CF_OAUTH_REDIRECT_URI: 'https://app.example/oauth/callback', CF_OAUTH_SCOPES: 'openid workers.write',
    CONNECTION_ENCRYPTION_KEY: key, CLOUDFLARE_FETCH: fetcher,
  });
  const started = await store.startConnection('person-1', 'https://app.example', 1_000);
  const callback = `https://app.example/oauth/callback?code=code-1&state=${encodeURIComponent(started.state)}`;
  await assert.rejects(() => store.completeConnection('person-1', 'https://evil.example', callback, 2_000), /origin/i);
  await store.completeConnection('person-1', 'https://app.example', callback, 2_000);
  await assert.rejects(() => store.completeConnection('person-1', 'https://app.example', callback, 2_001), /state/i);
  assert.equal(calls.filter((call) => call.url.endsWith('/oauth2/token')).length, 1);
});

test('account confirmation validates the exact account and metadata never exposes tokens', async () => {
  const { CloudflareConnectionStore } = await loadOAuth();
  const { fetcher, calls } = setupFetch();
  const store = new CloudflareConnectionStore({ storage: new MemoryStorage() }, {
    CF_OAUTH_CLIENT_ID: 'public-client', CF_OAUTH_REDIRECT_URI: 'https://app.example/oauth/callback',
    CF_OAUTH_SCOPES: 'openid workers.write', CONNECTION_ENCRYPTION_KEY: key, CLOUDFLARE_FETCH: fetcher,
  });
  const started = await store.startConnection('person-1', 'https://app.example', 1_000);
  await store.completeConnection('person-1', 'https://app.example', `https://app.example/oauth/callback?code=c&state=${started.state}`, 2_000);
  await assert.rejects(() => store.confirmAccount('person-1', 'not-an-account'), /32-character/i);
  const metadata = await store.confirmAccount('person-1', 'a'.repeat(32));
  assert.equal(metadata.accountId, 'a'.repeat(32));
  assert.equal(JSON.stringify(await store.listMetadata('person-1')).includes('secret'), false);
  await store.getAccessToken('person-1', metadata.connectionId);
  assert.equal(calls.filter((call) => call.url.endsWith('/oauth2/token')).length, 2);
});

test('OAuth callbacks reject malformed, stale, and explicitly revoked state', async () => {
  const { CloudflareConnectionStore } = await loadOAuth();
  const { fetcher } = setupFetch();
  const store = new CloudflareConnectionStore({ storage: new MemoryStorage() }, {
    CF_OAUTH_CLIENT_ID: 'public-client', CF_OAUTH_REDIRECT_URI: 'https://app.example/oauth/callback',
    CF_OAUTH_SCOPES: 'openid workers.write', CONNECTION_ENCRYPTION_KEY: key, CLOUDFLARE_FETCH: fetcher,
  });
  const stale = await store.startConnection('person-1', 'https://app.example', 1_000);
  await assert.rejects(() => store.completeConnection('person-1', 'https://app.example',
    `https://app.example/oauth/callback?code=c&state=${stale.state}`, 601_001), /expired/i);
  const malformed = await store.startConnection('person-1', 'https://app.example', 700_000);
  await assert.rejects(() => store.completeConnection('person-1', 'https://app.example',
    `https://app.example/oauth/callback?code=c&state=${malformed.state}&principal=attacker`, 700_001), /unexpected/i);
  const revoked = await store.startConnection('person-1', 'https://app.example', 800_000);
  assert.equal(await store.revokePendingAuthorization('person-1', revoked.state), true);
  await assert.rejects(() => store.completeConnection('person-1', 'https://app.example',
    `https://app.example/oauth/callback?code=c&state=${revoked.state}`, 800_001), /state/i);
});

test('disconnect and same-subject reauthorization preserve connection identity but require account reconfirmation', async () => {
  const { CloudflareConnectionStore } = await loadOAuth();
  const { fetcher } = setupFetch();
  const store = new CloudflareConnectionStore({ storage: new MemoryStorage() }, {
    CF_OAUTH_CLIENT_ID: 'client', CF_OAUTH_CLIENT_SECRET: 'secret',
    CF_OAUTH_REDIRECT_URI: 'https://app.example/oauth/callback', CF_OAUTH_SCOPES: 'openid workers.write',
    CONNECTION_ENCRYPTION_KEY: key, CLOUDFLARE_FETCH: fetcher,
  });
  const firstStart = await store.startConnection('person-1', 'https://app.example', 1_000);
  const first = await store.completeConnection('person-1', 'https://app.example',
    `https://app.example/oauth/callback?code=first&state=${firstStart.state}`, 2_000);
  const confirmed = await store.confirmAccount('person-1', 'a'.repeat(32));
  assert.equal(confirmed.accountConfirmationRequired, false);
  await store.disconnect('person-1', first.connectionId);
  assert.deepEqual(await store.listMetadata('person-1'), []);

  const secondStart = await store.startConnection('person-1', 'https://app.example', 3_000);
  const reauthorized = await store.completeConnection('person-1', 'https://app.example',
    `https://app.example/oauth/callback?code=second&state=${secondStart.state}`, 4_000);
  assert.equal(reauthorized.connectionId, first.connectionId);
  assert.equal(reauthorized.accountId, undefined);
  assert.equal(reauthorized.accountConfirmationRequired, true);
  await assert.rejects(() => store.getAccessToken('person-1', first.connectionId), /account confirmation/i);
  await assert.rejects(() => store.confirmAccount('person-1', 'b'.repeat(32)), /bound account/i);
  const reconfirmed = await store.confirmAccount('person-1', 'a'.repeat(32));
  assert.equal(reconfirmed.connectionId, first.connectionId);
  assert.equal(reconfirmed.accountConfirmationRequired, false);
});

test('reauthorization refuses a different Cloudflare subject for a bound connection ID', async () => {
  const { CloudflareConnectionStore } = await loadOAuth();
  const provider = { subject: 'cf-user-1' };
  const { fetcher } = setupFetch(provider);
  const store = new CloudflareConnectionStore({ storage: new MemoryStorage() }, {
    CF_OAUTH_CLIENT_ID: 'public-client', CF_OAUTH_REDIRECT_URI: 'https://app.example/oauth/callback',
    CF_OAUTH_SCOPES: 'openid workers.write', CONNECTION_ENCRYPTION_KEY: key, CLOUDFLARE_FETCH: fetcher,
  });
  const firstStart = await store.startConnection('person-1', 'https://app.example', 1_000);
  const first = await store.completeConnection('person-1', 'https://app.example',
    `https://app.example/oauth/callback?code=first&state=${firstStart.state}`, 2_000);
  await store.disconnect('person-1', first.connectionId);
  provider.subject = 'cf-user-2';
  const secondStart = await store.startConnection('person-1', 'https://app.example', 3_000);
  await assert.rejects(() => store.completeConnection('person-1', 'https://app.example',
    `https://app.example/oauth/callback?code=second&state=${secondStart.state}`, 4_000), /subject|identity/i);
  assert.deepEqual(await store.listMetadata('person-1'), []);
});

test('a refresh completing after disconnect cannot restore the revoked connection', async () => {
  const { CloudflareConnectionStore } = await loadOAuth();
  let tokenCalls = 0;
  let releaseRefresh;
  const refreshResponse = new Promise((resolve) => { releaseRefresh = resolve; });
  const fetcher = { async fetch(input) {
    const url = String(input);
    if (url.endsWith('/oauth2/token')) {
      tokenCalls += 1;
      if (tokenCalls === 1) return Response.json({ access_token: 'old-access', refresh_token: 'old-refresh', expires_in: 3600 });
      return refreshResponse;
    }
    if (url.endsWith('/oauth2/userinfo')) return Response.json({ sub: 'cf-user' });
    if (url.includes('/workers/subdomain')) return Response.json({ success: true, result: { subdomain: 'example' } });
    if (url.endsWith('/oauth2/revoke')) return new Response(null, { status: 200 });
    throw new Error(url);
  } };
  const store = new CloudflareConnectionStore({ storage: new MemoryStorage() }, {
    CF_OAUTH_CLIENT_ID: 'client', CF_OAUTH_REDIRECT_URI: 'https://app.example/oauth/callback',
    CF_OAUTH_SCOPES: 'openid workers.write', CONNECTION_ENCRYPTION_KEY: key, CLOUDFLARE_FETCH: fetcher,
  });
  const now = Date.now();
  const started = await store.startConnection('person-1', 'https://app.example', now);
  const connection = await store.completeConnection('person-1', 'https://app.example',
    `https://app.example/oauth/callback?code=first&state=${started.state}`, now + 1);
  await store.confirmAccount('person-1', 'a'.repeat(32));
  const refreshing = store.getAccessToken('person-1', connection.connectionId, now + 7_200_000);
  await Promise.resolve();
  await store.disconnect('person-1', connection.connectionId);
  releaseRefresh(Response.json({ access_token: 'new-access', refresh_token: 'new-refresh', expires_in: 3600 }));
  await assert.rejects(refreshing, /changed while.*refreshing/i);
  assert.deepEqual(await store.listMetadata('person-1'), []);
});
