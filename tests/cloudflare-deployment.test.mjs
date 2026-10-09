import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function loadDeployment() {
  let source = await readFile(new URL('../apps/worker/src/cloudflare/deployment.ts', import.meta.url), 'utf8');
  const stub = `data:text/javascript,${encodeURIComponent(`export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } } export class WorkflowEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }`)}`;
  source = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace('cloudflare:workers', stub)
    .replace(/import \{ loadVerifiedPackage \} from '[^']+';/, 'const loadVerifiedPackage = (...args) => globalThis.__loadVerifiedPackage(...args);');
  return import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
}

class MemoryStorage {
  map = new Map();
  async get(key) { return this.map.get(key); }
  async put(key, value) { this.map.set(key, structuredClone(value)); }
}

test('target authority fences stale jobs and uncertainty freezes handoff', async () => {
  const { TargetDeploymentAuthority } = await loadDeployment();
  const authority = new TargetDeploymentAuthority({ storage: new MemoryStorage() }, {});
  const first = await authority.acquire('job-1', 'version-1');
  await assert.rejects(() => authority.acquire('job-2', 'version-1'), /active/i);
  await authority.freeze(first.jobId, first.fence, 'provider outcome unknown');
  await assert.rejects(() => authority.acquire('job-2', 'version-1'), /frozen/i);
  await assert.rejects(() => authority.checkFence('job-1', first.fence - 1), /stale/i);
  assert.equal((await authority.acquire('job-1', 'version-1')).fence, first.fence);
  await assert.rejects(() => authority.checkFence('job-1', first.fence), /stale|inactive/i);
  await authority.recover('job-1', first.fence, 'version-reconciled');
  await authority.checkFence('job-1', first.fence);
  await authority.fail('job-1', first.fence, 'known provider rejection');
  await authority.fail('job-1', first.fence, 'known provider rejection');
  await assert.rejects(() => authority.fail('job-1', first.fence, 'different rejection'), /does not match/i);
  assert.equal((await authority.acquire('job-2', 'version-1')).fence, first.fence + 1);

  const completionAuthority = new TargetDeploymentAuthority({ storage: new MemoryStorage() }, {});
  const completion = await completionAuthority.acquire('job-complete', 'version-1');
  await completionAuthority.complete('job-complete', completion.fence, 'version-2', 'deployment-2');
  await completionAuthority.complete('job-complete', completion.fence, 'version-2', 'deployment-2');
  await assert.rejects(
    () => completionAuthority.complete('job-complete', completion.fence, 'version-other', 'deployment-2'),
    /does not match/i,
  );
  const next = await completionAuthority.acquire('job-next', 'version-2');
  await assert.rejects(
    () => completionAuthority.complete('job-complete', completion.fence, 'version-2', 'deployment-2'),
    /stale|inactive/i,
  );
  assert.equal(next.fence, completion.fence + 1);

  const preparationAuthority = new TargetDeploymentAuthority({ storage: new MemoryStorage() }, {});
  const preparation = await preparationAuthority.acquire('job-prepare');
  await preparationAuthority.freeze('job-prepare', preparation.fence, 'asset upload timeout', 'prepare');
  assert.equal((await preparationAuthority.acquire('job-prepare')).uncertaintyStage, 'prepare');
  await preparationAuthority.recoverPreparation('job-prepare', preparation.fence, undefined);
  await preparationAuthority.checkFence('job-prepare', preparation.fence);
  await preparationAuthority.freeze('job-prepare', preparation.fence, 'version upload timeout', 'publish');
  await assert.rejects(
    () => preparationAuthority.recoverPreparation('job-prepare', preparation.fence, undefined),
    /publication reconciliation/i,
  );
});

test('provider deploy checks the fence immediately before every write and emits tagged version then 100 percent deployment', async () => {
  const { deployPackageToCloudflare } = await loadDeployment();
  const events = [];
  let uploadedAsset;
  let assetUploadAuthorization;
  let versionAuthorization;
  let versionPayload;
  const fetcher = async (input, init = {}) => {
    const url = String(input); events.push(`write:${init.method}:${new URL(url).pathname}`);
    if (url.endsWith('/workers/subdomain')) return Response.json({ success: true, result: { subdomain: 'acct' } });
    if (url.endsWith('/workers/workers/world-thing-abc123')) return Response.json({ success: false, errors: [{ message: 'not found' }] }, { status: 404 });
    if (url.endsWith('/workers/workers')) return Response.json({ success: true, result: { id: 'worker-1', name: 'world-thing-abc123', tags: ['bropilot-managed'] } });
    if (url.endsWith('/versions') && init.method === 'GET') return Response.json({ success: true, result: [] });
    if (url.endsWith('/deployments') && init.method === 'GET') return Response.json({ success: true, result: { deployments: [] } });
    if (url.endsWith('/subdomain') && init.method === 'GET') return Response.json({ success: true, result: { enabled: false, previews_enabled: false } });
    if (url.endsWith('/subdomain') && init.method === 'POST') return Response.json({ success: true, result: { enabled: true, previews_enabled: false } });
    if (url.endsWith('/assets-upload-session')) return Response.json({ success: true, result: { buckets: [['5deeda9d2277e0ed541bfc03adafb3cf']], jwt: 'asset-jwt' } });
    if (url.includes('/workers/assets/upload')) {
      uploadedAsset = await init.body.get('5deeda9d2277e0ed541bfc03adafb3cf').text();
      assetUploadAuthorization = new Headers(init.headers).get('authorization');
      return Response.json({ success: true, result: { jwt: 'completion-jwt' } }, { status: 201 });
    }
    if (url.endsWith('/versions')) {
      versionAuthorization = new Headers(init.headers).get('authorization');
      versionPayload = JSON.parse(init.body);
      return Response.json({ success: true, result: { id: 'version-2' } });
    }
    if (url.endsWith('/deployments')) return Response.json({ success: true, result: { id: 'deployment-2' } });
    throw new Error(url);
  };
  const result = await deployPackageToCloudflare({
    accountId: 'a'.repeat(32), workerName: 'world-thing-abc123', accessToken: 'token',
    deploymentId: 'dep-1', packageDigest: 'f'.repeat(64), expectedActiveVersionId: null,
  }, { manifest: { packageDigest: 'f'.repeat(64), module: { path: 'worker.mjs', sha256: 'b'.repeat(64), bytes: 55 },
    assets: [{ path: 'public/index.html', sha256: 'a'.repeat(64), bytes: 5 }], deployableConfig: {}, },
    compiledWorker: new TextEncoder().encode("export default {fetch(){return new Response('ok')}}"),
    assets: { 'public/index.html': new TextEncoder().encode('hello') } }, {
    fetch: fetcher,
    checkFence: async () => { events.push('fence'); return 'fresh-oauth-token'; },
  });
  assert.deepEqual(events, [
    'write:GET:/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/workers/subdomain',
    'write:GET:/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/workers/workers/world-thing-abc123',
    'write:GET:/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/workers/scripts/world-thing-abc123/deployments',
    'fence', 'write:POST:/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/workers/workers',
    'fence', 'write:POST:/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/workers/scripts/world-thing-abc123/assets-upload-session',
    'fence', 'write:POST:/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/workers/assets/upload',
    'fence', 'write:POST:/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/workers/workers/worker-1/versions',
    'fence', 'write:POST:/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/workers/scripts/world-thing-abc123/deployments',
    'write:GET:/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/workers/scripts/world-thing-abc123/subdomain',
    'fence', 'write:POST:/client/v4/accounts/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/workers/scripts/world-thing-abc123/subdomain',
  ]);
  assert.equal(result.versionId, 'version-2');
  assert.equal(result.deploymentId, 'deployment-2');
  assert.equal(result.url, 'https://world-thing-abc123.acct.workers.dev');
  assert.equal(uploadedAsset, 'aGVsbG8=');
  assert.equal(assetUploadAuthorization, 'Bearer asset-jwt');
  assert.equal(versionAuthorization, 'Bearer fresh-oauth-token');
  assert.equal(versionPayload.annotations['workers/tag'], `bp:dep-1:${'f'.repeat(16)}`);
  assert.equal(versionPayload.modules[0].content_base64, Buffer.from("export default {fetch(){return new Response('ok')}}").toString('base64'));
});

test('provider reconciliation accepts the tagged active version before drift checks and performs no writes', async () => {
  const { deployPackageToCloudflare } = await loadDeployment();
  const writes = [];
  const digest = 'f'.repeat(64);
  const result = await deployPackageToCloudflare({
    accountId: 'a'.repeat(32), workerName: 'world-thing-abc123', accessToken: 'token',
    deploymentId: 'dep-1', packageDigest: digest, expectedActiveVersionId: 'version-old',
  }, {
    manifest: { packageDigest: digest, module: { path: 'worker.mjs', sha256: 'b'.repeat(64), bytes: 1 }, assets: [], deployableConfig: {} },
    compiledWorker: new Uint8Array([120]), assets: {},
  }, {
    async checkFence() { writes.push('fence'); },
    async recoverFrozen(versionId) { assert.equal(versionId, 'version-new'); },
    async fetch(input, init = {}) {
      const url = String(input);
      if (init.method !== 'GET') writes.push(`${init.method}:${new URL(url).pathname}`);
      if (url.endsWith('/workers/subdomain')) return Response.json({ success: true, result: { subdomain: 'acct' } });
      if (url.endsWith('/workers/workers/world-thing-abc123')) return Response.json({ success: true, result: { id: 'worker-1', name: 'world-thing-abc123', tags: ['bropilot-managed'] } });
      if (url.endsWith('/versions')) return Response.json({ success: true, result: [{ id: 'version-new', annotations: { 'workers/tag': `bp:dep-1:${digest.slice(0, 16)}` } }] });
      if (url.endsWith('/deployments')) return Response.json({ success: true, result: { deployments: [{ id: 'deployment-new', versions: [{ version_id: 'version-new', percentage: 100 }] }] } });
      if (url.endsWith('/subdomain')) return Response.json({ success: true, result: { enabled: true, previews_enabled: false } });
      throw new Error(url);
    },
  });
  assert.equal(result.reconciled, true);
  assert.equal(result.versionId, 'version-new');
  assert.deepEqual(writes, []);
});

test('accepted version and deployment writes with missing IDs remain publication-uncertain', async (t) => {
  const { deployPackageToCloudflare } = await loadDeployment();
  for (const malformedWrite of ['version', 'deployment']) {
    await t.test(malformedWrite, async () => {
      await assert.rejects(() => deployPackageToCloudflare({
        accountId: 'a'.repeat(32), workerName: 'world-thing-abc123', accessToken: 'token',
        deploymentId: 'dep-1', packageDigest: 'f'.repeat(64), expectedActiveVersionId: null,
      }, {
        manifest: { packageDigest: 'f'.repeat(64), module: { path: 'worker.mjs', sha256: 'b'.repeat(64), bytes: 1 }, assets: [], deployableConfig: {} },
        compiledWorker: new Uint8Array([120]), assets: {},
      }, {
        async checkFence() {},
        async fetch(input, init = {}) {
          const url = String(input);
          if (url.endsWith('/workers/subdomain')) return Response.json({ success: true, result: { subdomain: 'acct' } });
          if (url.endsWith('/workers/workers/world-thing-abc123')) return Response.json({ success: true, result: { id: 'worker-1', name: 'world-thing-abc123', tags: ['bropilot-managed'] } });
          if (url.endsWith('/versions') && init.method === 'GET') return Response.json({ success: true, result: [] });
          if (url.endsWith('/deployments') && init.method === 'GET') return Response.json({ success: true, result: { deployments: [] } });
          if (url.endsWith('/assets-upload-session')) return Response.json({ success: true, result: { buckets: [], jwt: 'completion-jwt' } });
          if (url.endsWith('/versions')) return Response.json({ success: true, result: malformedWrite === 'version' ? {} : { id: 'version-2' } });
          if (url.endsWith('/deployments')) return Response.json({ success: true, result: {} });
          throw new Error(url);
        },
      }), (error) => {
        assert.equal(error.uncertaintyStage, 'publish');
        assert.match(error.message, new RegExp(malformedWrite));
        return true;
      });
    });
  }
});

test('rollback reconciliation accepts the requested prior version before drift checks and performs no writes', async () => {
  const { rollbackCloudflareDeployment } = await loadDeployment();
  const events = [];
  const result = await rollbackCloudflareDeployment({
    accountId: 'a'.repeat(32), workerName: 'world-thing-abc123', accessToken: 'token',
    expectedActiveVersionId: 'version-new', priorVersionId: 'version-old',
  }, {
    async checkFence() { events.push('write'); },
    async recoverFrozen(versionId) { events.push(`recover:${versionId}`); },
    async recordVersion(versionId) { events.push(`record:${versionId}`); },
    async fetch(input, init = {}) {
      const url = String(input);
      if (init.method !== 'GET') events.push('write');
      if (url.endsWith('/workers/subdomain')) return Response.json({ success: true, result: { subdomain: 'acct' } });
      return Response.json({ success: true, result: { deployments: [{ id: 'rollback-deployment', versions: [{ version_id: 'version-old', percentage: 100 }] }] } });
    },
  });
  assert.deepEqual(result, {
    deploymentId: 'rollback-deployment', url: 'https://world-thing-abc123.acct.workers.dev', reconciled: true,
  });
  assert.deepEqual(events, ['recover:version-old', 'record:version-old']);
});

test('provider rejects an existing Worker without the platform ownership tag', async () => {
  const { deployPackageToCloudflare } = await loadDeployment();
  await assert.rejects(() => deployPackageToCloudflare({
    accountId: 'a'.repeat(32), workerName: 'world-thing-abc123', accessToken: 'token',
    deploymentId: 'dep-1', packageDigest: 'f'.repeat(64), expectedActiveVersionId: null,
  }, {
    manifest: { packageDigest: 'f'.repeat(64), module: { path: 'worker.mjs', sha256: 'b'.repeat(64), bytes: 1 }, assets: [], deployableConfig: {} },
    compiledWorker: new Uint8Array([120]), assets: {},
  }, {
    async checkFence() { throw new Error('unexpected write'); },
    async fetch(input) {
      const url = String(input);
      if (url.endsWith('/workers/subdomain')) return Response.json({ success: true, result: { subdomain: 'acct' } });
      return Response.json({ success: true, result: { id: 'foreign', name: 'world-thing-abc123', tags: [] } });
    },
  }), /unmanaged Worker/i);
});

test('workflow keeps grants out of durable step results and rechecks a revoked connection before provider writes', async () => {
  const { DeploymentWorkflow } = await loadDeployment();
  const deployable = {
    manifest: { packageDigest: 'f'.repeat(64), module: { path: 'worker.mjs', sha256: 'b'.repeat(64), bytes: 1 }, assets: [], deployableConfig: {} },
    compiledWorker: new Uint8Array([120]), assets: {},
  };
  globalThis.__loadVerifiedPackage = async () => deployable;
  const context = {
    worldId: 'world-1', deploymentId: 'deployment-1', jobId: 'job-1', targetId: 'target-1', thingId: 'web-app', revisionId: 'rev-1',
    packageRef: { key: 'k', packageDigest: 'f'.repeat(64), buildDigest: 'b'.repeat(64), sourceDigest: 's'.repeat(64),
      sourceRef: {}, contractHash: 'c'.repeat(64), planHash: 'p'.repeat(64), runnerHash: 'r'.repeat(64), runId: 'run-1' },
    requesterPrincipalId: 'person-1', connectionPrincipalId: 'person-1', connectionId: 'connection-1', accountId: 'a'.repeat(32),
  };
  const progress = [];
  const world = {
    async getDeploymentContext() { return structuredClone(context); },
    async applyDeploymentProgress(_id, update) { progress.push(update); return { accepted: true, publicationAuthorized: true }; },
    async recordDeploymentObservation() {},
  };
  const target = {
    async acquire() { return { jobId: 'job-1', fence: 1, status: 'active' }; },
    async checkFence() {}, async recover() {}, async complete() {}, async freeze() {}, async fail() {},
  };
  let grantReads = 0;
  const connection = { async getAccessToken() {
    grantReads += 1;
    if (grantReads > 1) throw new Error('Cloudflare connection not found');
    return 'plaintext-secret';
  } };
  const stepResults = [];
  const step = { async do(_name, callback) { const value = await callback({}); stepResults.push(value); return value; } };
  const workflow = new DeploymentWorkflow({}, {
    BUILD_PACKAGES: {},
    WORLD_AUTHORITY: { getByName: () => world },
    CLOUDFLARE_CONNECTIONS: { getByName: () => connection },
    DEPLOYMENT_TARGETS: { getByName: () => target },
  });
  const originalFetch = globalThis.fetch;
  let providerWrites = 0;
  globalThis.fetch = async (_input, init = {}) => {
    if (init.method !== 'GET') providerWrites += 1;
    const url = String(_input);
    if (url.endsWith('/workers/subdomain')) return Response.json({ success: true, result: { subdomain: 'acct' } });
    if (url.endsWith('/versions')) return Response.json({ success: true, result: [] });
    if (url.includes('/workers/workers/')) return Response.json({ success: true, result: { id: 'worker-1', name: new URL(url).pathname.split('/').at(-1), tags: ['bropilot-managed'] } });
    return Response.json({ success: true, result: { deployments: [] } });
  };
  try {
    await assert.rejects(() => workflow.run({ payload: { worldId: 'world-1', deploymentId: 'deployment-1' } }, step), /connection not found/i);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__loadVerifiedPackage;
  }
  assert.equal(providerWrites, 0);
  assert.equal(JSON.stringify(stepResults).includes('plaintext-secret'), false);
  assert.equal(progress.at(-1).phase, 'failed');
  assert.equal(progress.at(-1).progressSeq, 5);
});

test('workflow records early authorization, package, and target-acquire failures without touching a fence', async (t) => {
  const { DeploymentWorkflow } = await loadDeployment();
  const context = {
    worldId: 'world-1', deploymentId: 'deployment-1', jobId: 'job-1', targetId: 'target-1', thingId: 'web-app', revisionId: 'rev-1',
    packageRef: { key: 'k', packageDigest: 'f'.repeat(64), buildDigest: 'b'.repeat(64), sourceDigest: 's'.repeat(64),
      sourceRef: {}, contractHash: 'c'.repeat(64), planHash: 'p'.repeat(64), runnerHash: 'r'.repeat(64), runId: 'run-1' },
    requesterPrincipalId: 'person-1', connectionPrincipalId: 'person-1', connectionId: 'connection-1', accountId: 'a'.repeat(32),
  };
  const makeWorkflow = (world, target) => new DeploymentWorkflow({}, {
    BUILD_PACKAGES: {}, WORLD_AUTHORITY: { getByName: () => world },
    CLOUDFLARE_CONNECTIONS: { getByName: () => ({ getAccessToken: async () => 'token' }) },
    DEPLOYMENT_TARGETS: { getByName: () => target },
  });
  const directStep = { async do(_name, callback) { return callback({}); } };

  await t.test('authorization rejection transitions the queued deployment to failed', async () => {
    const phases = [];
    let acquireCalls = 0;
    const world = {
      async getDeploymentContext() { return structuredClone(context); },
      async applyDeploymentProgress(_id, update) {
        phases.push(update.phase);
        return update.phase === 'authorizePublication' ? { accepted: false } : { accepted: true };
      },
    };
    const target = { async acquire() { acquireCalls += 1; }, async freeze() {}, async fail() {} };
    await assert.rejects(() => makeWorkflow(world, target).run({ payload: { worldId: 'world-1', deploymentId: 'deployment-1' } }, directStep), /not authorized/i);
    assert.deepEqual(phases, ['authorizePublication', 'failed']);
    assert.equal(acquireCalls, 0);
  });

  await t.test('package failure bookkeeping is idempotent across workflow replay', async () => {
    const phases = [];
    let acquireCalls = 0;
    globalThis.__loadVerifiedPackage = async () => { throw new Error('retained package corrupt'); };
    const world = {
      async getDeploymentContext() { return structuredClone(context); },
      async applyDeploymentProgress(_id, update) { phases.push(update.phase); return { accepted: true, publicationAuthorized: true }; },
    };
    const target = { async acquire() { acquireCalls += 1; }, async freeze() {}, async fail() {} };
    const cache = new Map();
    const replayStep = { async do(name, callback) {
      if (cache.has(name)) return structuredClone(cache.get(name));
      const value = await callback({});
      cache.set(name, structuredClone(value));
      return value;
    } };
    try {
      const workflow = makeWorkflow(world, target);
      await assert.rejects(() => workflow.run({ payload: { worldId: 'world-1', deploymentId: 'deployment-1' } }, replayStep), /package corrupt/i);
      await assert.rejects(() => workflow.run({ payload: { worldId: 'world-1', deploymentId: 'deployment-1' } }, replayStep), /package corrupt/i);
    } finally {
      delete globalThis.__loadVerifiedPackage;
    }
    assert.deepEqual(phases, ['authorizePublication', 'failed']);
    assert.equal(acquireCalls, 0);
  });

  await t.test('target acquisition failure does not fail or freeze another job fence', async () => {
    const phases = [];
    let fenceMutations = 0;
    globalThis.__loadVerifiedPackage = async () => ({ manifest: { packageDigest: context.packageRef.packageDigest } });
    const world = {
      async getDeploymentContext() { return structuredClone(context); },
      async applyDeploymentProgress(_id, update) { phases.push(update.phase); return { accepted: true, publicationAuthorized: true }; },
    };
    const target = {
      async acquire() { throw new Error('another deployment job is active for this target'); },
      async freeze() { fenceMutations += 1; }, async fail() { fenceMutations += 1; },
    };
    try {
      await assert.rejects(() => makeWorkflow(world, target).run({ payload: { worldId: 'world-1', deploymentId: 'deployment-1' } }, directStep), /another deployment job/i);
    } finally {
      delete globalThis.__loadVerifiedPackage;
    }
    assert.deepEqual(phases, ['authorizePublication', 'packageVerified', 'failed']);
    assert.equal(fenceMutations, 0);
  });
});

test('workflow freezes uncertain provider writes and records a distinct uncertain phase', async () => {
  const { DeploymentWorkflow } = await loadDeployment();
  globalThis.__loadVerifiedPackage = async () => ({
    manifest: { packageDigest: 'f'.repeat(64), module: { path: 'worker.mjs', sha256: 'b'.repeat(64), bytes: 1 }, assets: [], deployableConfig: {} },
    compiledWorker: new Uint8Array([120]), assets: {},
  });
  const context = {
    worldId: 'world-1', deploymentId: 'deployment-1', jobId: 'job-1', targetId: 'target-1', thingId: 'web-app', revisionId: 'rev-1',
    packageRef: { key: 'k', packageDigest: 'f'.repeat(64), buildDigest: 'b'.repeat(64), sourceDigest: 's'.repeat(64),
      sourceRef: {}, contractHash: 'c'.repeat(64), planHash: 'p'.repeat(64), runnerHash: 'r'.repeat(64), runId: 'run-1' },
    requesterPrincipalId: 'person-1', connectionPrincipalId: 'person-1', connectionId: 'connection-1', accountId: 'a'.repeat(32),
  };
  const progress = [];
  const world = {
    async getDeploymentContext() { return structuredClone(context); },
    async applyDeploymentProgress(_id, update) { progress.push(update); return { accepted: true, publicationAuthorized: true }; },
    async recordDeploymentObservation() {},
  };
  let frozen;
  const target = {
    async acquire() { return { jobId: 'job-1', fence: 1, status: 'active' }; }, async checkFence() {}, async recover() {},
    async complete() {}, async fail() {}, async freeze(jobId, fence, reason) { frozen = { jobId, fence, reason }; },
  };
  const workflow = new DeploymentWorkflow({}, {
    BUILD_PACKAGES: {}, WORLD_AUTHORITY: { getByName: () => world },
    CLOUDFLARE_CONNECTIONS: { getByName: () => ({ getAccessToken: async () => 'token' }) },
    DEPLOYMENT_TARGETS: { getByName: () => target },
  });
  const step = { async do(_name, callback) { return callback({}); } };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (init.method === 'POST') throw new Error('connection reset after send');
    if (url.endsWith('/workers/subdomain')) return Response.json({ success: true, result: { subdomain: 'acct' } });
    if (url.includes('/workers/workers/')) return Response.json({ success: false, errors: [{ message: 'not found' }] }, { status: 404 });
    if (url.endsWith('/versions')) return Response.json({ success: true, result: [] });
    return Response.json({ success: true, result: { deployments: [] } });
  };
  try {
    await assert.rejects(() => workflow.run({ payload: { worldId: 'world-1', deploymentId: 'deployment-1' } }, step), /connection reset/i);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__loadVerifiedPackage;
  }
  assert.deepEqual({ jobId: frozen.jobId, fence: frozen.fence }, { jobId: 'job-1', fence: 1 });
  assert.equal(progress.at(-1).phase, 'uncertain');
  assert.equal(progress.at(-1).progressSeq, 5);
});

test('workflow freezes HTTP 408 and 5xx writes but treats 4xx rejection as definitive', async (t) => {
  const { DeploymentWorkflow } = await loadDeployment();
  const context = {
    worldId: 'world-1', deploymentId: 'deployment-1', jobId: 'job-1', targetId: 'target-1', thingId: 'web-app', revisionId: 'rev-1',
    packageRef: { key: 'k', packageDigest: 'f'.repeat(64), buildDigest: 'b'.repeat(64), sourceDigest: 's'.repeat(64),
      sourceRef: {}, contractHash: 'c'.repeat(64), planHash: 'p'.repeat(64), runnerHash: 'r'.repeat(64), runId: 'run-1' },
    requesterPrincipalId: 'person-1', connectionPrincipalId: 'person-1', connectionId: 'connection-1', accountId: 'a'.repeat(32),
  };
  const runStatus = async (status) => {
    globalThis.__loadVerifiedPackage = async () => ({
      manifest: { packageDigest: 'f'.repeat(64), module: { path: 'worker.mjs', sha256: 'b'.repeat(64), bytes: 1 }, assets: [], deployableConfig: {} },
      compiledWorker: new Uint8Array([120]), assets: {},
    });
    const progress = [];
    const targetMutations = [];
    const world = {
      async getDeploymentContext() { return structuredClone(context); },
      async applyDeploymentProgress(_id, update) { progress.push(update); return { accepted: true, publicationAuthorized: true }; },
      async recordDeploymentObservation() {},
    };
    const target = {
      async acquire() { return { jobId: 'job-1', fence: 1, status: 'active' }; }, async checkFence() {}, async recover() {}, async complete() {},
      async freeze() { targetMutations.push('freeze'); }, async fail() { targetMutations.push('fail'); },
    };
    const workflow = new DeploymentWorkflow({}, {
      BUILD_PACKAGES: {}, WORLD_AUTHORITY: { getByName: () => world },
      CLOUDFLARE_CONNECTIONS: { getByName: () => ({ getAccessToken: async () => 'token' }) },
      DEPLOYMENT_TARGETS: { getByName: () => target },
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init = {}) => {
      const url = String(input);
      if (url.endsWith('/workers/subdomain')) return Response.json({ success: true, result: { subdomain: 'acct' } });
      if (url.includes('/workers/workers/') && init.method === 'GET') return Response.json({ success: false, errors: [{ message: 'not found' }] }, { status: 404 });
      if (url.endsWith('/deployments') && init.method === 'GET') return Response.json({ success: true, result: { deployments: [] } });
      return Response.json({ success: false, errors: [{ message: `provider ${status}` }] }, { status });
    };
    try {
      await assert.rejects(() => workflow.run({ payload: { worldId: 'world-1', deploymentId: 'deployment-1' } }, { async do(_name, callback) { return callback({}); } }), new RegExp(`${status}`));
    } finally {
      globalThis.fetch = originalFetch;
      delete globalThis.__loadVerifiedPackage;
    }
    return { progress, targetMutations };
  };

  for (const status of [408, 503]) {
    await t.test(`${status} is uncertain`, async () => {
      const result = await runStatus(status);
      assert.equal(result.progress.at(-1).phase, 'uncertain');
      assert.deepEqual(result.targetMutations, ['freeze']);
    });
  }
  await t.test('400 is definitive', async () => {
    const result = await runStatus(400);
    assert.equal(result.progress.at(-1).phase, 'failed');
    assert.deepEqual(result.targetMutations, ['fail']);
  });
});

test('same job safely resumes frozen preparation writes after read-only provider proof', async (t) => {
  const { DeploymentWorkflow, TargetDeploymentAuthority } = await loadDeployment();
  const digest = 'f'.repeat(64);
  const assetHash = '5deeda9d2277e0ed541bfc03adafb3cf';
  const deployable = {
    manifest: {
      packageDigest: digest, module: { path: 'worker.mjs', sha256: 'b'.repeat(64), bytes: 1 },
      assets: [{ path: 'public/index.html', sha256: 'a'.repeat(64), bytes: 5 }], deployableConfig: {},
    },
    compiledWorker: new Uint8Array([120]), assets: { 'public/index.html': new TextEncoder().encode('hello') },
  };
  const context = {
    worldId: 'world-1', deploymentId: 'deployment-1', jobId: 'job-1', targetId: 'target-1', thingId: 'web-app', revisionId: 'rev-1',
    packageRef: { key: 'k', packageDigest: digest, buildDigest: 'b'.repeat(64), sourceDigest: 's'.repeat(64),
      sourceRef: {}, contractHash: 'c'.repeat(64), planHash: 'p'.repeat(64), runnerHash: 'r'.repeat(64), runId: 'run-1' },
    requesterPrincipalId: 'person-1', connectionPrincipalId: 'person-1', connectionId: 'connection-1', accountId: 'a'.repeat(32),
    publicationAllowed: true,
  };

  for (const timeoutPoint of ['creation', 'session', 'asset']) {
    await t.test(`${timeoutPoint} timeout`, async () => {
      globalThis.__loadVerifiedPackage = async () => deployable;
      const progress = [];
      const world = {
        async getDeploymentContext() { return structuredClone(context); },
        async applyDeploymentProgress(_id, update) { progress.push(update); return { accepted: true, publicationAuthorized: true }; },
        async recordDeploymentObservation() {},
      };
      const authority = new TargetDeploymentAuthority({ storage: new MemoryStorage() }, {});
      const workflow = new DeploymentWorkflow({}, {
        BUILD_PACKAGES: {}, WORLD_AUTHORITY: { getByName: () => world },
        CLOUDFLARE_CONNECTIONS: { getByName: () => ({ getAccessToken: async () => 'token' }) },
        DEPLOYMENT_TARGETS: { getByName: () => authority },
      });
      let workerExists = timeoutPoint !== 'creation';
      let assetStored = false;
      let timeoutRaised = false;
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async (input, init = {}) => {
        const url = String(input);
        if (url.startsWith('https://bp-')) return new Response('ok');
        if (url.endsWith('/workers/subdomain')) return Response.json({ success: true, result: { subdomain: 'acct' } });
        if (url.includes('/workers/workers/') && init.method === 'GET' && !url.endsWith('/versions')) {
          return workerExists
            ? Response.json({ success: true, result: { id: 'worker-1', name: new URL(url).pathname.split('/').at(-1), tags: ['bropilot-managed'] } })
            : Response.json({ success: false, errors: [{ message: 'not found' }] }, { status: 404 });
        }
        if (url.endsWith('/versions') && init.method === 'GET') return Response.json({ success: true, result: [] });
        if (url.endsWith('/deployments') && init.method === 'GET') return Response.json({ success: true, result: { deployments: [] } });
        if (url.endsWith('/workers/workers')) {
          workerExists = true;
          if (timeoutPoint === 'creation' && !timeoutRaised) {
            timeoutRaised = true;
            throw new Error('creation response lost');
          }
          const body = JSON.parse(init.body);
          return Response.json({ success: true, result: { id: 'worker-1', name: body.name, tags: ['bropilot-managed'] } });
        }
        if (url.endsWith('/assets-upload-session')) {
          if (timeoutPoint === 'session' && !timeoutRaised) {
            timeoutRaised = true;
            throw new Error('session response lost');
          }
          return Response.json({ success: true, result: { buckets: assetStored ? [] : [[assetHash]], jwt: assetStored ? 'completion-jwt' : 'asset-jwt' } });
        }
        if (url.includes('/workers/assets/upload')) {
          assetStored = true;
          if (timeoutPoint === 'asset' && !timeoutRaised) {
            timeoutRaised = true;
            throw new Error('asset response lost');
          }
          return Response.json({ success: true, result: { jwt: 'completion-jwt' } }, { status: 201 });
        }
        if (url.endsWith('/versions')) return Response.json({ success: true, result: { id: 'version-2' } });
        if (url.endsWith('/deployments')) return Response.json({ success: true, result: { id: 'deployment-2' } });
        if (url.endsWith('/subdomain')) return Response.json({ success: true, result: { enabled: true, previews_enabled: false } });
        throw new Error(url);
      };
      const step = { async do(_name, callback) { return callback({}); } };
      try {
        await assert.rejects(
          () => workflow.run({ payload: { worldId: 'world-1', deploymentId: 'deployment-1' } }, step),
          /response lost/i,
        );
        const frozen = await authority.acquire('job-1');
        assert.equal(frozen.status, 'frozen');
        assert.equal(frozen.uncertaintyStage, 'prepare');
        const result = await workflow.run({ payload: { worldId: 'world-1', deploymentId: 'deployment-1' } }, step);
        assert.equal(result.versionId, 'version-2');
        assert.equal(result.deploymentId, 'deployment-2');
        assert.equal((await authority.acquire('job-next', 'version-2')).fence, frozen.fence + 1);
      } finally {
        globalThis.fetch = originalFetch;
        delete globalThis.__loadVerifiedPackage;
      }
      assert.equal(progress.some((update) => update.phase === 'uncertain'), true);
      assert.equal(progress.at(-1).phase, 'deployed');
    });
  }
});

test('workflow does not overwrite proved provider success when local completion must replay', async () => {
  const { DeploymentWorkflow } = await loadDeployment();
  const digest = 'f'.repeat(64);
  globalThis.__loadVerifiedPackage = async () => ({
    manifest: { packageDigest: digest, module: { path: 'worker.mjs' }, assets: [], deployableConfig: {} },
    compiledWorker: new Uint8Array([120]), assets: {},
  });
  const context = {
    worldId: 'world-1', deploymentId: 'deployment-1', jobId: 'job-1', targetId: 'target-1', thingId: 'web-app', revisionId: 'rev-1',
    packageRef: { key: 'k', packageDigest: digest, buildDigest: 'b'.repeat(64), sourceDigest: 's'.repeat(64),
      sourceRef: {}, contractHash: 'c'.repeat(64), planHash: 'p'.repeat(64), runnerHash: 'r'.repeat(64), runId: 'run-1' },
    requesterPrincipalId: 'person-1', connectionPrincipalId: 'person-1', connectionId: 'connection-1', accountId: 'a'.repeat(32),
    expectedActiveProviderVersionId: 'version-new', rollbackProviderVersionId: 'version-old',
  };
  const phases = [];
  const world = {
    async getDeploymentContext() { return structuredClone(context); },
    async applyDeploymentProgress(_id, update) { phases.push(update.phase); return { accepted: true, publicationAuthorized: true }; },
    async recordDeploymentObservation() {},
  };
  let fenceFailureMutations = 0;
  const target = {
    async acquire() { return { jobId: 'job-1', fence: 1, status: 'active' }; },
    async recover() {}, async checkFence() {},
    async complete() { throw new Error('local completion unavailable'); },
    async freeze() { fenceFailureMutations += 1; }, async fail() { fenceFailureMutations += 1; },
  };
  const workflow = new DeploymentWorkflow({}, {
    BUILD_PACKAGES: {}, WORLD_AUTHORITY: { getByName: () => world },
    CLOUDFLARE_CONNECTIONS: { getByName: () => ({ getAccessToken: async () => 'token' }) },
    DEPLOYMENT_TARGETS: { getByName: () => target },
  });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/workers/subdomain')) return Response.json({ success: true, result: { subdomain: 'acct' } });
    return Response.json({ success: true, result: { deployments: [{ id: 'rollback-deployment', versions: [{ version_id: 'version-old', percentage: 100 }] }] } });
  };
  try {
    await assert.rejects(() => workflow.run({ payload: { worldId: 'world-1', deploymentId: 'deployment-1' } }, { async do(_name, callback) { return callback({}); } }), /local completion unavailable/i);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__loadVerifiedPackage;
  }
  assert.deepEqual(phases, ['authorizePublication', 'packageVerified', 'providerVersionCreated']);
  assert.equal(fenceFailureMutations, 0);
});

test('workflow read-only reconciliation records a timed-out deployment after the canonical head advances', async () => {
  const { DeploymentWorkflow } = await loadDeployment();
  const digest = 'f'.repeat(64);
  globalThis.__loadVerifiedPackage = async () => ({
    manifest: { packageDigest: digest, module: { path: 'worker.mjs', sha256: 'b'.repeat(64), bytes: 1 }, assets: [], deployableConfig: {} },
    compiledWorker: new Uint8Array([120]), assets: {},
  });
  const context = {
    worldId: 'world-1', deploymentId: 'deployment-1', jobId: 'job-1', targetId: 'target-1', thingId: 'web-app', revisionId: 'rev-1',
    packageRef: { key: 'k', packageDigest: digest, buildDigest: 'b'.repeat(64), sourceDigest: 's'.repeat(64),
      sourceRef: {}, contractHash: 'c'.repeat(64), planHash: 'p'.repeat(64), runnerHash: 'r'.repeat(64), runId: 'run-1' },
    requesterPrincipalId: 'person-1', connectionPrincipalId: 'person-1', connectionId: 'connection-1', accountId: 'a'.repeat(32),
    expectedHeadRevisionId: 'rev-1', expectedActiveProviderVersionId: 'version-old', publicationAllowed: true,
  };
  const progress = [];
  const observations = [];
  let contextReads = 0;
  const world = {
    async getDeploymentContext() {
      contextReads += 1;
      return structuredClone(contextReads === 1 ? context : { ...context, expectedHeadRevisionId: 'rev-2', publicationAllowed: false });
    },
    async applyDeploymentProgress(_id, update) { progress.push(update); return { accepted: true, publicationAuthorized: true }; },
    async recordDeploymentObservation(_id, observation) { observations.push(observation); },
  };
  let recovered;
  const target = {
    async acquire() { return { jobId: 'job-1', fence: 1, status: 'frozen' }; },
    async recover(_jobId, _fence, versionId) { recovered = versionId; },
    async complete() {}, async checkFence() { throw new Error('provider write was attempted'); },
    async freeze() {}, async fail() {},
  };
  const workflow = new DeploymentWorkflow({}, {
    BUILD_PACKAGES: {}, WORLD_AUTHORITY: { getByName: () => world },
    CLOUDFLARE_CONNECTIONS: { getByName: () => ({ getAccessToken: async () => 'token' }) },
    DEPLOYMENT_TARGETS: { getByName: () => target },
  });
  const step = { async do(_name, callback) { return callback({}); } };
  const originalFetch = globalThis.fetch;
  let providerWrites = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    if (url.startsWith('https://bp-')) return new Response('ok');
    if (init.method !== 'GET') providerWrites += 1;
    if (url.endsWith('/workers/subdomain')) return Response.json({ success: true, result: { subdomain: 'acct' } });
    if (url.endsWith('/versions')) return Response.json({ success: true, result: [{ id: 'version-new', annotations: { 'workers/tag': `bp:deployment-1:${digest.slice(0, 16)}` } }] });
    if (url.includes('/workers/workers/')) return Response.json({ success: true, result: { id: 'worker-1', name: new URL(url).pathname.split('/').at(-1), tags: ['bropilot-managed'] } });
    if (url.endsWith('/deployments')) return Response.json({ success: true, result: { deployments: [{ id: 'deployment-new', versions: [{ version_id: 'version-new', percentage: 100 }] }] } });
    if (url.endsWith('/subdomain')) return Response.json({ success: true, result: { enabled: true, previews_enabled: false } });
    throw new Error(url);
  };
  try {
    const result = await workflow.run({ payload: { worldId: 'world-1', deploymentId: 'deployment-1' } }, step);
    assert.equal(result.reconciled, true);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__loadVerifiedPackage;
  }
  assert.equal(recovered, 'version-new');
  assert.equal(providerWrites, 0);
  assert.equal(progress.at(-1).phase, 'deployed');
  assert.equal(observations.length, 3);
});
