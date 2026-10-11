import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RUNNER_HASH = 'a'.repeat(64);
const BUILD_DIGEST = 'b'.repeat(64);
let child;
let directory;
let origin;
let logs;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'bropilot-hosted-authority-'));
  const entrypoint = join(directory, 'entrypoint.ts');
  const authorityPath = resolve(root, 'apps/worker/src/authority.ts');
  await writeFile(entrypoint, `
    import { WorldAuthority } from ${JSON.stringify(authorityPath)};
    export { WorldAuthority };
    export default {
      async fetch(request, env) {
        if (request.method === 'GET') return Response.json({ ready: true });
        try {
          const { worldId, method, args = [] } = await request.json();
          const authority = env.WORLD_AUTHORITY.getByName(worldId);
          const value = await authority[method](...args);
          return Response.json({ ok: true, value });
        } catch (error) {
          return Response.json({ ok: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
        }
      }
    };
  `);
  const configPath = join(directory, 'wrangler.json');
  await writeFile(configPath, JSON.stringify({
    name: 'bropilot-hosted-authority-test',
    main: entrypoint,
    compatibility_date: '2026-10-08',
    compatibility_flags: ['nodejs_compat'],
    durable_objects: { bindings: [{ name: 'WORLD_AUTHORITY', class_name: 'WorldAuthority' }] },
    migrations: [{ tag: 'v1', new_sqlite_classes: ['WorldAuthority'] }],
    rules: [{ type: 'CompiledWasm', globs: ['**/*.wasm'], fallthrough: true }],
  }));
  const port = 8797;
  origin = `http://127.0.0.1:${port}`;
  logs = createWriteStream(join(directory, 'workerd.log'));
  await once(logs, 'open');
  child = spawn(process.execPath, [
    resolve(root, 'node_modules/wrangler/bin/wrangler.js'), 'dev', '--local',
    '--config', configPath, '--ip', '127.0.0.1', '--port', String(port),
    '--persist-to', join(directory, 'state'),
  ], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false' } });
  child.stdout.pipe(logs, { end: false });
  child.stderr.pipe(logs, { end: false });
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`hosted authority workerd exited (${child.exitCode})`);
    try {
      if ((await fetch(origin)).ok) return;
    } catch { /* workerd is still starting */ }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 200));
  }
  throw new Error('hosted authority workerd startup timeout');
});

after(async () => {
  if (child && child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill('SIGTERM');
    await Promise.race([exited, new Promise(resolvePromise => setTimeout(resolvePromise, 5_000))]);
    if (child.exitCode === null) child.kill('SIGKILL');
  }
  logs?.end();
  await rm(directory, { recursive: true, force: true });
});

async function rpc(worldId, method, ...args) {
  const response = await fetch(origin, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ worldId, method, args }),
  });
  const body = await response.json();
  if (!response.ok || !body.ok) throw new Error(body.error ?? `RPC ${method} failed`);
  return body.value;
}

function principal(worldId, role, principalId, operation, moveId) {
  return {
    principalId, role, worldId, operations: [operation], expiresAtMs: Date.now() + 600_000,
    ...(moveId ? { moveId } : {}),
  };
}

async function execute(worldId, actor, principalId, command, role = actor, moveId) {
  return rpc(
    worldId,
    'executeWithPrincipal',
    actor,
    principal(worldId, role, principalId, command.kind, moveId),
    Date.now(),
    command,
  );
}

const observations = [
  ['artifact.exists', 'required files resolved'],
  ['artifact.build-start', 'built and started'],
  ['app.health', 'health contract matched'],
  ['app.surfaces', 'frontend and API matched'],
].map(([assayId, summary]) => ({ assayId, executionStatus: 'completed', result: 'pass', summary }));

async function createHostedWorld(worldId, ownerId) {
  assert.equal(await rpc(worldId, 'reserveHostedOwner', ownerId), true);
  const response = await execute(worldId, 'owner', ownerId, {
    kind: 'createHostedWorld', worldId, title: 'Hosted authority integration', runnerHash: RUNNER_HASH,
    sourceRepository: { namespace: 'bropilot-worlds', repoId: `repo-${worldId}`, repoName: worldId },
    deploymentTargets: [{
      targetId: 'production', thingId: 'web-app', connectionId: `connection-${worldId}`,
      accountId: 'account-1', workerName: `worker-${worldId}`, ownerPrincipalId: ownerId,
    }],
    requestId: `create-${worldId}`,
  });
  assert.equal(response.status, 'ok', JSON.stringify(response));
  return response;
}

async function promoteCandidate(worldId, ownerId, moveId, candidateId) {
  const sourceRef = {
    namespace: 'bropilot-worlds', repoId: `repo-${worldId}`, repoName: worldId,
    commitSha: '1'.repeat(40), treeSha: '2'.repeat(40), contentDigest: '3'.repeat(64),
  };
  let response = await execute(worldId, 'implementer', ownerId, {
    kind: 'submitHostedCandidate', moveId, candidateId,
    source: { files: { 'worker.ts': `export default { fetch() { return new Response(${JSON.stringify(candidateId)}) } }` } },
    sourceRef, requestId: `submit-${candidateId}`,
  }, 'owner', moveId);
  assert.equal(response.status, 'ok', JSON.stringify(response));
  response = await execute(worldId, 'owner', ownerId, {
    kind: 'startVerification', candidateId, requestId: `start-${candidateId}`,
  });
  const runId = response.result.runId;
  response = await execute(worldId, 'verifier', 'verifier-1', {
    kind: 'claimRun', runId, leaseId: `lease-${candidateId}`, verifierId: 'verifier-1',
    runnerHash: RUNNER_HASH, requestId: `claim-${candidateId}`,
  });
  assert.equal(response.status, 'ok', JSON.stringify(response));
  const state = await rpc(worldId, 'getState');
  const run = state.runs.find(item => item.runId === runId);
  const packageRef = {
    key: `packages/${candidateId}.tar`, packageDigest: '4'.repeat(64), buildDigest: BUILD_DIGEST,
    sourceDigest: run.sourceDigest, sourceRef, contractHash: run.contractHash, planHash: run.planHash,
    runnerHash: RUNNER_HASH, runId,
  };
  response = await execute(worldId, 'verifier', 'verifier-1', {
    kind: 'completeHostedRun', runId, leaseId: `lease-${candidateId}`,
    sourceDigest: run.sourceDigest, contractHash: run.contractHash, planHash: run.planHash,
    packageRef, observations, requestId: `complete-${candidateId}`,
  });
  assert.equal(response.status, 'ok', JSON.stringify(response));
  const beforePromotion = await rpc(worldId, 'getState');
  response = await execute(worldId, 'owner', ownerId, {
    kind: 'promote', candidateId, expectedHeadRevisionId: beforePromotion.headRevisionId,
    requestId: `promote-${candidateId}`,
  });
  assert.equal(response.status, 'ok', JSON.stringify(response));
  return { response, packageRef };
}

async function createPromotedWorld(worldId = `authority-${crypto.randomUUID()}`) {
  const ownerId = 'owner-1';
  const created = await createHostedWorld(worldId, ownerId);
  const promoted = await promoteCandidate(worldId, ownerId, created.result.moveId, 'candidate-1');
  return { worldId, ownerId, promoted };
}

test('actual workerd caches monotonic deployment callbacks and reconciles uncertain success after head advances', async () => {
  const { worldId, ownerId, promoted } = await createPromotedWorld();
  const deployedRevision = promoted.response.result.revisionId;
  assert.deepEqual(await rpc(worldId, 'getSourceReconciliation'), {
    revisionId: deployedRevision,
    status: 'pending',
  });
  await rpc(worldId, 'markSourceReconciled', deployedRevision);
  assert.deepEqual(await rpc(worldId, 'getSourceReconciliation'), {
    revisionId: deployedRevision,
    status: 'current',
  });
  let response = await execute(worldId, 'owner', ownerId, {
    kind: 'requestDeployment', deploymentId: 'deploy-1', targetId: 'production',
    revisionId: deployedRevision, expectedHeadRevisionId: deployedRevision, requestId: 'request-deploy-1',
  });
  assert.equal(response.status, 'ok', JSON.stringify(response));

  const authorized = await rpc(worldId, 'applyDeploymentProgress', 'deploy-1', {
    progressSeq: 1, phase: 'authorizePublication',
  });
  assert.deepEqual(authorized, { accepted: true, publicationAuthorized: true });
  assert.deepEqual(await rpc(worldId, 'applyDeploymentProgress', 'deploy-1', {
    progressSeq: 99, phase: 'authorizePublication',
  }), authorized, 'cached phase replays its original command');
  assert.equal((await rpc(worldId, 'getState')).deployments[0].progressSeq, 1);

  assert.equal((await rpc(worldId, 'applyDeploymentProgress', 'deploy-1', {
    progressSeq: 1, phase: 'providerVersionCreated', providerVersionId: 'provider-v1',
  })).accepted, true);
  assert.equal((await rpc(worldId, 'applyDeploymentProgress', 'deploy-1', {
    progressSeq: 2, phase: 'uncertain', failure: 'provider result timed out',
  })).accepted, true);
  let state = await rpc(worldId, 'getState');
  assert.equal(state.deployments[0].progressSeq, 3);
  assert.equal(state.deployments[0].providerVersionId, 'provider-v1');

  response = await execute(worldId, 'owner', ownerId, {
    kind: 'createMove', moveId: 'move-2', title: 'Advance canonical head', requestId: 'create-move-2',
  });
  assert.equal(response.status, 'ok', JSON.stringify(response));
  const second = await promoteCandidate(worldId, ownerId, 'move-2', 'candidate-2');
  const advancedHead = second.response.result.revisionId;
  assert.notEqual(advancedHead, deployedRevision);
  assert.deepEqual(await rpc(worldId, 'getSourceReconciliation'), {
    revisionId: advancedHead,
    status: 'pending',
  });
  await rpc(worldId, 'markSourceReconciled', deployedRevision);
  assert.deepEqual(await rpc(worldId, 'getSourceReconciliation'), {
    revisionId: advancedHead,
    status: 'pending',
  }, 'a stale reconciliation callback cannot mark the new head current');
  await rpc(worldId, 'markSourceReconciled', advancedHead);
  assert.deepEqual(await rpc(worldId, 'getSourceReconciliation'), {
    revisionId: advancedHead,
    status: 'current',
  });

  assert.equal((await rpc(worldId, 'applyDeploymentProgress', 'deploy-1', {
    progressSeq: 4, phase: 'deployed', providerVersionId: 'provider-v1', url: 'https://world.example',
  })).accepted, true);
  state = await rpc(worldId, 'getState');
  assert.equal(state.headRevisionId, advancedHead);
  assert.equal(state.deployments[0].revisionId, deployedRevision);
  assert.equal(state.deployments[0].status, 'succeeded');
  assert.equal(state.deployments[0].progressSeq, 4);
  assert.equal((await rpc(worldId, 'applyDeploymentProgress', 'deploy-1', {
    progressSeq: 500, phase: 'deployed', providerVersionId: 'provider-v1', url: 'https://world.example',
  })).accepted, true);
  assert.equal((await rpc(worldId, 'applyDeploymentProgress', 'deploy-1', {
    progressSeq: 501, phase: 'deployed', providerVersionId: 'forged-version', url: 'https://world.example',
  })).accepted, false);
  assert.equal((await rpc(worldId, 'getState')).deployments[0].progressSeq, 4);
  response = await execute(worldId, 'owner', ownerId, {
    kind: 'requestDeployment', deploymentId: 'deploy-2', targetId: 'production',
    revisionId: advancedHead, expectedHeadRevisionId: advancedHead, requestId: 'request-deploy-2',
  });
  assert.equal(response.status, 'ok', JSON.stringify(response));
  assert.equal(
    (await rpc(worldId, 'getState')).deployments[1].expectedActiveProviderVersionId,
    'provider-v1',
  );
});

test('actual SQLite authority fails stale queued jobs closed and releases the target for the current head', async () => {
  const { worldId, ownerId, promoted } = await createPromotedWorld();
  const oldHead = promoted.response.result.revisionId;
  let response = await execute(worldId, 'owner', ownerId, {
    kind: 'requestDeployment', deploymentId: 'stale-job', targetId: 'production',
    revisionId: oldHead, expectedHeadRevisionId: oldHead, requestId: 'request-stale-job',
  });
  assert.equal(response.status, 'ok', JSON.stringify(response));
  response = await execute(worldId, 'owner', ownerId, {
    kind: 'createMove', moveId: 'move-new', title: 'New head', requestId: 'create-new-move',
  });
  assert.equal(response.status, 'ok', JSON.stringify(response));
  const next = await promoteCandidate(worldId, ownerId, 'move-new', 'candidate-new');
  const currentHead = next.response.result.revisionId;
  assert.equal((await rpc(worldId, 'applyDeploymentProgress', 'stale-job', {
    progressSeq: 1, phase: 'authorizePublication',
  })).accepted, false);
  assert.equal((await rpc(worldId, 'applyDeploymentProgress', 'stale-job', {
    progressSeq: 2, phase: 'failed', failure: 'canonical head changed before publication',
  })).accepted, true);
  response = await execute(worldId, 'owner', ownerId, {
    kind: 'requestDeployment', deploymentId: 'current-job', targetId: 'production',
    revisionId: currentHead, expectedHeadRevisionId: currentHead, requestId: 'request-current-job',
  });
  assert.equal(response.status, 'ok', JSON.stringify(response));
  const state = await rpc(worldId, 'getState');
  assert.equal(state.headRevisionId, currentHead);
  assert.equal(state.deployments.find(item => item.deploymentId === 'stale-job').status, 'failed');
  assert.equal(state.deployments.find(item => item.deploymentId === 'current-job').status, 'queued');
  assert.equal(state.deployments.find(item => item.deploymentId === 'current-job').expectedActiveProviderVersionId, undefined);
});

test('actual SQLite authority isolates owner/source metadata and rejects expired package receipts', async () => {
  const first = await createPromotedWorld();
  const second = await createHostedWorld(`isolated-${crypto.randomUUID()}`, 'owner-2');
  assert.equal(await rpc(first.worldId, 'getOwnerPrincipalId'), first.ownerId);
  assert.equal(await rpc(second.state.worldId, 'getOwnerPrincipalId'), 'owner-2');
  assert.equal(await rpc(first.worldId, 'reserveHostedOwner', 'attacker'), false);

  const repository = {
    namespace: 'bropilot-worlds', repoId: `repo-${first.worldId}`, repoName: first.worldId,
    worldId: first.worldId, mainCommitSha: '8'.repeat(40),
  };
  await rpc(first.worldId, 'saveSourceRepository', repository);
  assert.deepEqual(await rpc(first.worldId, 'getSourceRepository'), repository);
  assert.equal(await rpc(second.state.worldId, 'getSourceRepository'), null);
  await assert.rejects(
    rpc(first.worldId, 'saveSourceRepository', { ...repository, repoId: 'replacement' }),
    /identity cannot change/,
  );

  let response = await execute(first.worldId, 'owner', first.ownerId, {
    kind: 'createMove', moveId: 'receipt-move', title: 'Receipt expiry', requestId: 'receipt-move',
  });
  const moveId = response.result.moveId;
  const sourceRef = {
    namespace: 'bropilot-worlds', repoId: `repo-${first.worldId}`, repoName: first.worldId,
    commitSha: '5'.repeat(40), treeSha: '6'.repeat(40), contentDigest: '7'.repeat(64),
  };
  response = await execute(first.worldId, 'implementer', first.ownerId, {
    kind: 'submitHostedCandidate', moveId, candidateId: 'receipt-candidate',
    source: { files: { 'worker.ts': 'export default {}' } }, sourceRef, requestId: 'receipt-submit',
  }, 'owner', moveId);
  response = await execute(first.worldId, 'owner', first.ownerId, {
    kind: 'startVerification', candidateId: 'receipt-candidate', requestId: 'receipt-start',
  });
  const runId = response.result.runId;
  response = await execute(first.worldId, 'verifier', 'verifier-1', {
    kind: 'claimRun', runId, leaseId: 'receipt-lease', verifierId: 'verifier-1',
    runnerHash: RUNNER_HASH, requestId: 'receipt-claim',
  });
  assert.equal(response.status, 'ok', JSON.stringify(response));
  const state = await rpc(first.worldId, 'getState');
  const run = state.runs.find(item => item.runId === runId);
  const packageRef = {
    key: 'packages/receipt.tar', packageDigest: '9'.repeat(64), buildDigest: BUILD_DIGEST,
    sourceDigest: run.sourceDigest, sourceRef, contractHash: run.contractHash, planHash: run.planHash,
    runnerHash: RUNNER_HASH, runId,
  };
  const uploadDigest = 'd'.repeat(64);
  const reservationNow = Date.now();
  assert.equal(await rpc(
    first.worldId,
    'reservePackageUpload',
    runId,
    'receipt-lease',
    'verifier-1',
    uploadDigest,
    reservationNow,
  ), true);
  assert.equal(await rpc(
    first.worldId,
    'reservePackageUpload',
    runId,
    'receipt-lease',
    'verifier-1',
    uploadDigest,
    reservationNow + 1,
  ), true, 'the same upload digest replays durably');
  assert.equal(await rpc(
    first.worldId,
    'reservePackageUpload',
    runId,
    'receipt-lease',
    'verifier-1',
    'e'.repeat(64),
    reservationNow + 2,
  ), false, 'a lease cannot reserve different upload bytes');
  assert.equal(await rpc(
    first.worldId,
    'reservePackageUpload',
    runId,
    'receipt-lease',
    'other-verifier',
    uploadDigest,
    reservationNow + 3,
  ), false, 'the upload reservation is verifier-bound');
  assert.equal(await rpc(
    first.worldId,
    'reservePackageUpload',
    runId,
    'receipt-lease',
    'verifier-1',
    uploadDigest,
    reservationNow + 121_000,
  ), false, 'expired leases cannot reserve package uploads');
  await rpc(first.worldId, 'savePackageReceipt', runId, 'receipt-lease', 'verifier-1', packageRef, Date.now());
  assert.deepEqual(await rpc(first.worldId, 'getPackageReceipt', runId, 'receipt-lease', 'verifier-1'), packageRef);
  assert.equal(await rpc(first.worldId, 'getPackageReceipt', runId, 'receipt-lease', 'other-verifier'), null);
  await assert.rejects(
    rpc(first.worldId, 'savePackageReceipt', runId, 'receipt-lease', 'verifier-1', packageRef, Date.now() + 121_000),
    /lease is no longer active/,
  );
});
