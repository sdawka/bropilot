import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadSource(path, replacements = {}) {
  let source = await readFile(new URL(path, import.meta.url), 'utf8');
  const workerStub = `data:text/javascript,${encodeURIComponent(`export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }`)}`;
  const joseStub = `data:text/javascript,${encodeURIComponent(`export const createRemoteJWKSet = (url) => url; export const jwtVerify = (...args) => globalThis.__jwtVerify(...args);`)}`;
  source = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace('cloudflare:workers', workerStub)
    .replace('jose', joseStub);
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

class MemoryStorage {
  map = new Map();
  async get(key) { return this.map.get(key); }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
  async delete(key) { return this.map.delete(key); }
}

test('hosted auth trusts a verified Access sub and ignores spoofed identity headers', async () => {
  const { authenticateHosted } = await loadSource('../apps/worker/src/identity.ts');
  globalThis.__jwtVerify = async (token, _jwks, options) => {
    assert.equal(token, 'signed-access-token');
    assert.equal(options.issuer, 'https://team.cloudflareaccess.com');
    assert.equal(options.audience, 'aud-1');
    return { payload: { sub: 'access-subject', exp: 2_000_000_000 } };
  };
  const request = new Request('https://app.example/api', { headers: {
    'cf-access-jwt-assertion': 'signed-access-token',
    'x-bropilot-principal': 'attacker',
    'x-bropilot-role': 'owner',
  } });
  const principal = await authenticateHosted(request, {
    AUTH_MODE: 'hosted', ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com', ACCESS_AUD: 'aud-1',
  });
  assert.deepEqual(principal, { principalId: 'access-subject', kind: 'human', expiresAtMs: 2_000_000_000_000 });
  delete globalThis.__jwtVerify;
});

test('identity store returns a service token once, hashes it, and rejects it after revoke', async () => {
  const { IdentityStore } = await loadSource('../apps/worker/src/identity.ts');
  const storage = new MemoryStorage();
  const store = new IdentityStore({ storage }, {});
  const issued = await store.issue({
    principalId: 'agent:one', role: 'verifier', worldId: 'world-1', moveId: 'move-1',
    operations: ['claimRun', 'completeHostedRun'], runnerHash: 'sha256:runner', expiresAtMs: Date.now() + 60_000,
  });
  assert.match(issued.token, /^bpst_v1_[A-Za-z0-9_-]+_[A-Za-z0-9_-]+$/);
  assert.equal(JSON.stringify([...storage.map.values()]).includes(issued.token), false);
  assert.equal((await store.authenticate(issued.token))?.role, 'verifier');
  const revoked = await store.revoke(issued.tokenId, issued.version);
  assert.equal(revoked?.version, issued.version + 1);
  assert.equal(await store.authenticate(issued.token), null);
});

test('identity store rejects unbounded, malformed, and expired service grants', async () => {
  const { IdentityStore } = await loadSource('../apps/worker/src/identity.ts');
  const store = new IdentityStore({ storage: new MemoryStorage() }, {});
  await assert.rejects(() => store.issue({ principalId: 'x', role: 'owner', operations: [], expiresAtMs: Date.now() + 60_000 }), /scope/i);
  await assert.rejects(() => store.issue({ principalId: 'x', role: 'verifier', worldId: 'w', operations: ['claimRun'], runnerHash: 'r', expiresAtMs: Date.now() - 1 }), /future/i);
  await assert.rejects(() => store.issue({ principalId: 'x', role: 'verifier', worldId: 'w', operations: ['submitHostedCandidate'], runnerHash: 'r', expiresAtMs: Date.now() + 60_000 }), /outside/i);
});
