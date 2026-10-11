import type { Actor, PrincipalContext, SourceBundle, WorldCommand, WorldCommandResponse, WorldState } from '@bropilot/contracts';
import { authenticateHosted, type HostedIdentityEnv, type HostedPrincipal, type IdentityStore } from './identity.js';
import type { CloudflareConnectionStore, CloudflareConnectionMetadata } from './cloudflare/oauth.js';
import { deriveWorkerName } from './cloudflare/deployment.js';
import { CloudflareArtifactsProvider } from './artifacts/native.js';
import { IsomorphicGitWriter } from './artifacts/git-writer.js';
import { computeSourceBundleDigest, createWorldRepository, persistCandidateSource, readPinnedSource, reconcileCanonical, type WorldRepository, type SourceBundle as StoredSourceBundle } from './artifacts/source.js';
import { loadVerifiedPackage, retainBuildPackage, type BuildPackageUpload } from './artifacts/packages.js';
import type { LocalEnv } from './authority.js';
import { RUNNER_HASH, RUNNER_REF } from './runner-manifest.js';

export type HostedEnv = LocalEnv & HostedIdentityEnv & {
  ARTIFACTS?: Artifacts;
  ARTIFACTS_NAMESPACE?: string;
  BUILD_PACKAGES?: R2Bucket;
  CLOUDFLARE_CONNECTIONS?: DurableObjectNamespace<CloudflareConnectionStore>;
  DEPLOYMENT_WORKFLOW?: Workflow<{ worldId: string; deploymentId: string }>;
  TRUSTED_VERIFIER_SUBS?: string;
};

export function hostedEnabled(env: HostedEnv): boolean { return env.AUTH_MODE === 'hosted'; }
export function hostedJson(value: unknown, status = 200): Response {
  return Response.json(value, { status, headers: { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
function fail(code: string, message: string, status = 400): Response { return hostedJson({ apiVersion: 1, status: 'error', code, message }, status); }
function object(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
function validId(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value); }
function safeMutation(request: Request): boolean {
  const origin = request.headers.get('origin');
  return (!origin || origin === new URL(request.url).origin) && request.headers.get('sec-fetch-site') !== 'cross-site';
}
async function body(request: Request): Promise<Record<string, unknown> | Response> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') return fail('unsupported_media_type', 'Provide an application/json request.', 415);
  const reader = request.body?.getReader();
  if (!reader) return fail('invalid_input', 'Provide a JSON request.');
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1_048_576) { await reader.cancel(); return fail('resource_limit', 'Request exceeds 1048576 bytes.', 413); }
      chunks.push(chunk.value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const parsed = object(JSON.parse(new TextDecoder().decode(bytes)));
    return parsed ?? fail('invalid_input', 'Provide one JSON object.');
  } catch { return fail('malformed_request', 'Provide valid JSON.'); }
  finally { reader.releaseLock(); }
}
function statusFor(response: Extract<WorldCommandResponse, { status: 'error' }>): number {
  if (response.code === 'forbidden' || response.code === 'principal_expired') return 403;
  if (response.code === 'not_found') return 404;
  if (response.code === 'resource_limit') return 413;
  if (response.code === 'promotion_blocked' || response.code === 'deployment_blocked') return 422;
  return ['stale_head', 'stale_move', 'duplicate_id', 'idempotency_conflict', 'world_already_exists', 'deployment_active', 'target_binding_conflict', 'lease_expired', 'lease_mismatch'].includes(response.code) ? 409 : 400;
}
function commandResponse(response: WorldCommandResponse): Response { return hostedJson(response, response.status === 'ok' ? 200 : statusFor(response)); }
function context(principal: HostedPrincipal, worldId: string, actor: Actor, operation: string): PrincipalContext {
  return {
    principalId: principal.principalId, role: principal.kind === 'human' ? 'owner' : actor, worldId,
    ...(principal.moveId ? { moveId: principal.moveId } : {}),
    operations: principal.kind === 'human' ? [operation] : principal.operations ?? [],
    expiresAtMs: principal.expiresAtMs ?? Date.now() + 60_000,
  };
}
function world(env: HostedEnv, worldId: string) { return env.WORLD_AUTHORITY.getByName(worldId); }
function index(env: HostedEnv, principalId: string) { return env.LOCAL_WORLD_DIRECTORY.getByName(`hosted:${principalId}`); }
function identities(env: HostedEnv) { return env.IDENTITY_STORE?.getByName('service-identities-v1'); }
function connections(env: HostedEnv, principalId: string) { return env.CLOUDFLARE_CONNECTIONS?.getByName(principalId); }
function connectionDto(value: CloudflareConnectionMetadata) {
  return { ...value, status: value.reconnectRequired ? 'reconnect_required' : value.accountId ? 'connected' : 'account_required' };
}
async function permitted(env: HostedEnv, principal: HostedPrincipal, worldId: string): Promise<boolean> {
  if (principal.kind === 'service') return principal.worldId === worldId;
  return await world(env, worldId).getOwnerPrincipalId() === principal.principalId;
}
async function syncIndex(env: HostedEnv, state: WorldState): Promise<void> {
  const owner = await world(env, state.worldId).getOwnerPrincipalId();
  if (owner) await index(env, owner).upsert({ worldId: state.worldId, title: state.title, headRevisionId: state.headRevisionId, desiredRevisionId: state.desired.revisionId });
}
async function execute(env: HostedEnv, principal: HostedPrincipal, worldId: string, actor: Actor, command: WorldCommand): Promise<WorldCommandResponse> {
  const response = await world(env, worldId).executeWithPrincipal(actor, context(principal, worldId, actor, command.kind), Date.now(), command);
  if (response.status === 'ok') await syncIndex(env, response.state);
  return response;
}
async function sha(value: string): Promise<string> {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
function storage(env: HostedEnv) {
  if (!env.ARTIFACTS || !env.ARTIFACTS_NAMESPACE || !env.BUILD_PACKAGES) throw new Error('Hosted source/build storage is unavailable');
  return { provider: new CloudflareArtifactsProvider(env.ARTIFACTS), writer: new IsomorphicGitWriter() };
}
async function reconcile(env: HostedEnv, state: WorldState): Promise<void> {
  const stub = world(env, state.worldId);
  const repository = await stub.getSourceRepository();
  const revision = state.revisions.find(item => item.revisionId === state.headRevisionId);
  const candidate = state.candidates.find(item => item.candidateId === revision?.candidateId);
  if (!repository || !candidate?.sourceRef) return;
  const { provider, writer } = storage(env);
  const result = await reconcileCanonical(provider, writer, {
    repository, sourceRef: candidate.sourceRef, expectedMainCommitSha: repository.mainCommitSha,
    requestId: `head:${state.headRevisionId}`, nowMs: Date.now(),
  });
  await stub.saveSourceRepository({ ...repository, mainCommitSha: result.mainCommitSha });
  await stub.markSourceReconciled(state.headRevisionId);
}
async function dispatch(env: HostedEnv, worldId: string, deploymentId: string): Promise<void> {
  if (!env.DEPLOYMENT_WORKFLOW) throw new Error('Deployment workflow is unavailable');
  const id = `deployment-${await sha(`${worldId}/${deploymentId}`)}`;
  try { await env.DEPLOYMENT_WORKFLOW.create({ id, params: { worldId, deploymentId } }); }
  catch (cause) {
    const instance = await env.DEPLOYMENT_WORKFLOW.get(id);
    const status = await instance.status();
    if (status.status === 'errored') await instance.restart();
    else if (status.status === 'terminated') throw cause;
  }
}
export async function hostedRevisionAllowed(request: Request, env: HostedEnv, worldId: string): Promise<Response | undefined> {
  const principal = await authenticateHosted(request, env);
  if (!principal) return fail('unauthorized', 'Sign in to open this World.', 401);
  return await permitted(env, principal, worldId) ? undefined : fail('forbidden', 'This identity cannot open this World.', 403);
}

export async function hostedRoute(request: Request, env: HostedEnv, path: string, kit: unknown, reservedWorldIds: readonly string[] = []): Promise<Response | undefined> {
  if (!hostedEnabled(env)) return undefined;
  if (!['GET', 'HEAD'].includes(request.method) && !safeMutation(request)) return fail('forbidden_origin', 'Use a same-origin request.', 403);
  const principal = await authenticateHosted(request, env);
  if (!principal) return fail('unauthorized', 'A verified identity is required.', 401);
  if (path === '/api/v1/session') return hostedJson({ enabled: true, mode: 'hosted', principalId: principal.principalId });
  if (path === '/api/v1/kit' || path === '/api/v1/local-kit') return request.method === 'GET' ? hostedJson(kit) : fail('method_not_allowed', 'Use GET.', 405);
  if (path.startsWith('/api/v1/cloudflare/connections')) {
    if (principal.kind !== 'human') return fail('forbidden', 'A human owner must connect Cloudflare.', 403);
    const store = connections(env, principal.principalId);
    if (!store) return fail('configuration_missing', 'Cloudflare connection storage is unavailable.', 503);
    const current = (await store.listMetadata(principal.principalId))[0];
    if (path === '/api/v1/cloudflare/connections' && request.method === 'GET') return hostedJson({ ...(current ? { connection: connectionDto(current) } : {}) });
    if (path === '/api/v1/cloudflare/connections' && request.method === 'DELETE') {
      if (current) await store.disconnect(principal.principalId, current.connectionId);
      return hostedJson({ disconnected: true });
    }
    if (path === '/api/v1/cloudflare/connections/start' && request.method === 'POST') {
      const parsed = await body(request); if (parsed instanceof Response) return parsed;
      const returnTo = typeof parsed.returnTo === 'string' && parsed.returnTo.startsWith('/') && !parsed.returnTo.startsWith('//')
        && !parsed.returnTo.includes('\\') ? parsed.returnTo : '/';
      const destination = new URL(returnTo, new URL(request.url).origin);
      if (destination.origin !== new URL(request.url).origin) return fail('invalid_return_path', 'Return to this application.');
      const started = await store.startConnection(principal.principalId, new URL(request.url).origin);
      await index(env, principal.principalId).saveOAuthReturnPath(started.state, `${destination.pathname}${destination.search}${destination.hash}`);
      return hostedJson({ authorizationUrl: started.authorizationUrl });
    }
    if (path === '/api/v1/cloudflare/connections/callback' && request.method === 'GET') {
      await store.completeConnection(principal.principalId, new URL(request.url).origin, request.url);
      const state = new URL(request.url).searchParams.get('state') ?? '';
      const destination = await index(env, principal.principalId).consumeOAuthReturnPath(state) ?? '/';
      return new Response(null, { status: 303, headers: { location: destination, 'cache-control': 'no-store' } });
    }
    if (path === '/api/v1/cloudflare/connections/account' && request.method === 'POST') {
      const parsed = await body(request); if (parsed instanceof Response) return parsed;
      if (typeof parsed.accountId !== 'string' || !/^[a-f0-9]{32}$/i.test(parsed.accountId)) return fail('invalid_account', 'Enter the 32-character Cloudflare account ID.');
      return hostedJson({ connection: connectionDto(await store.confirmAccount(principal.principalId, parsed.accountId)) });
    }
    return fail('method_not_allowed', 'This connection operation is unavailable.', 405);
  }
  if (path === '/api/v1/worlds') {
    if (principal.kind !== 'human') return fail('forbidden', 'A human owner must create or list Worlds.', 403);
    if (request.method === 'GET') return hostedJson({ worlds: await index(env, principal.principalId).list() });
    if (request.method !== 'POST') return fail('method_not_allowed', 'Use GET or POST.', 405);
    const parsed = await body(request); if (parsed instanceof Response) return parsed;
    if (!validId(parsed.worldId) || !validId(parsed.requestId) || typeof parsed.title !== 'string' || !parsed.title.trim() || new TextEncoder().encode(parsed.title).length > 256) return fail('invalid_input', 'worldId, title and requestId are required; title must contain 1–256 UTF-8 bytes.');
    if (reservedWorldIds.includes(parsed.worldId)) return fail('reserved_identity', 'This World id belongs to a read-only example.', 409);
    const stub = world(env, parsed.worldId);
    if (!await stub.reserveHostedOwner(principal.principalId)) return fail('forbidden', 'This World identity is already owned.', 403);
    let repository: WorldRepository | null = await stub.getSourceRepository();
    if (!repository) {
      const { provider, writer } = storage(env);
      repository = await createWorldRepository(provider, writer, {
        namespace: env.ARTIFACTS_NAMESPACE!, worldId: parsed.worldId, title: parsed.title,
        repoName: `world-${(await sha(parsed.worldId)).slice(0, 40)}`, requestId: parsed.requestId, nowMs: Date.now(),
      });
      await stub.saveSourceRepository(repository);
    }
    return commandResponse(await execute(env, principal, parsed.worldId, 'owner', {
      kind: 'createHostedWorld', worldId: parsed.worldId, title: parsed.title, runnerHash: RUNNER_HASH,
      sourceRepository: { namespace: repository.namespace, repoId: repository.repoId, repoName: repository.repoName }, deploymentTargets: [], requestId: parsed.requestId,
    }));
  }
  if (path === '/api/v1/verifier/jobs') {
    if (request.method !== 'GET' || principal.kind !== 'service' || principal.role !== 'verifier'
      || !principal.worldId || !principal.operations?.includes('claimRun') || principal.runnerHash !== RUNNER_HASH || request.headers.get('x-bropilot-runner-hash') !== RUNNER_HASH) return fail('forbidden', 'Use a registered scoped verifier.', 403);
    return hostedJson({ jobs: await world(env, principal.worldId).getRunnableJobs(Date.now()) });
  }
  const match = /^\/api\/v1\/worlds\/([^/]+)(?:\/(commands|deployment-target|source-reconciliation|service-credentials(?:\/([^/]+))?|deployments\/([^/]+)\/resume|runs\/([^/]+)\/(claim|package|complete)))?$/.exec(path);
  if (!match) return undefined;
  const worldId = decodeURIComponent(match[1]);
  if (!validId(worldId)) return fail('invalid_identity', 'Invalid World identity.');
  if (!await permitted(env, principal, worldId)) return fail('forbidden', 'This identity cannot access this World.', 403);
  const stub = world(env, worldId);
  const state = await stub.getState();
  if (!state?.hosted) return fail('not_found', 'Hosted World not found.', 404);
  if (!match[2]) return request.method === 'GET' ? hostedJson({ state, sourceReconciliation: await stub.getSourceReconciliation() }) : fail('method_not_allowed', 'Use GET.', 405);
  if (match[2] === 'source-reconciliation') {
    if (principal.kind !== 'human') return fail('forbidden', 'Only the owner may reconcile canonical source.', 403);
    if (request.method === 'GET') return hostedJson({ sourceReconciliation: await stub.getSourceReconciliation() });
    if (request.method !== 'POST') return fail('method_not_allowed', 'Use GET or POST.', 405);
    try { await reconcile(env, state); }
    catch { return fail('source_reconciliation_pending', 'Canonical source storage is pending. Retry reconciliation before deployment.', 503); }
    return hostedJson({ state: await stub.getState(), sourceReconciliation: await stub.getSourceReconciliation() });
  }
  if (match[3]) {
    if (principal.kind !== 'human' || request.method !== 'DELETE') return fail('forbidden', 'Only the owner may revoke a service credential.', 403);
    const store = identities(env); if (!store) return fail('configuration_missing', 'Service identity storage is unavailable.', 503);
    const tokenId = decodeURIComponent(match[3]); const metadata = await store.read(tokenId);
    if (!metadata || metadata.worldId !== worldId) return fail('not_found', 'Service credential not found in this World.', 404);
    return hostedJson({ credential: await store.revoke(tokenId, metadata.version) });
  }
  if (request.method !== 'POST') return fail('method_not_allowed', 'Use POST.', 405);
  const parsed = await body(request); if (parsed instanceof Response) return parsed;
  if (match[2] === 'service-credentials') {
    if (principal.kind !== 'human') return fail('forbidden', 'Only an owner may issue service credentials.', 403);
    if (parsed.role !== 'implementer' && parsed.role !== 'verifier') return fail('invalid_input', 'Choose implementer or verifier.');
    if (parsed.role === 'verifier' && !env.TRUSTED_VERIFIER_SUBS?.split(',').map(value => value.trim()).includes(principal.principalId)) return fail('verifier_registration_required', 'A trusted verifier administrator must register this runner.', 403);
    const store = identities(env); if (!store) return fail('configuration_missing', 'Service identity storage is unavailable.', 503);
    const issued = await store.issue({ principalId: `${parsed.role}:${crypto.randomUUID()}`, role: parsed.role, worldId,
      operations: parsed.role === 'verifier' ? ['claimRun', 'completeHostedRun'] : ['submitHostedCandidate'],
      expiresAtMs: typeof parsed.expiresAtMs === 'number' ? parsed.expiresAtMs : Date.now() + 3_600_000,
      ...(parsed.role === 'verifier' ? { runnerHash: RUNNER_HASH } : {}),
      ...(validId(parsed.moveId) ? { moveId: parsed.moveId } : {}),
    });
    return hostedJson({ credential: issued });
  }
  if (match[2] === 'deployment-target') {
    if (principal.kind !== 'human') return fail('forbidden', 'An owner must configure deployment.', 403);
    const connection = (await connections(env, principal.principalId)?.listMetadata(principal.principalId))?.[0];
    if (!connection?.accountId || connection.reconnectRequired) return fail('connection_required', 'Connect and confirm a Cloudflare account before deployment.', 409);
    const target = { targetId: 'web-app', thingId: 'web-app', connectionId: connection.connectionId, accountId: connection.accountId,
      workerName: await deriveWorkerName(worldId, 'web-app'), ownerPrincipalId: principal.principalId };
    const response = await execute(env, principal, worldId, 'owner', { kind: 'registerDeploymentTarget', target, requestId: `target:${target.connectionId}` });
    return response.status === 'ok' ? hostedJson({ target }) : commandResponse(response);
  }
  if (match[4]) {
    if (principal.kind !== 'human') return fail('forbidden', 'Only the owner may resume publication.', 403);
    const job = state.deployments.find(item => item.deploymentId === decodeURIComponent(match[4]));
    if (!job || job.status === 'failed' || job.status === 'succeeded') return fail('invalid_state', 'This deployment cannot be resumed.', 409);
    if (!job.rollbackOfDeploymentId) {
      try { await reconcile(env, state); }
      catch { return fail('source_reconciliation_pending', 'Reconcile canonical source before resuming deployment.', 503); }
    }
    await dispatch(env, worldId, job.deploymentId); return hostedJson({ resumed: true });
  }
  if (match[5]) {
    const runId = decodeURIComponent(match[5]); const operation = match[6];
    if (principal.kind !== 'service' || principal.role !== 'verifier' || principal.runnerHash !== RUNNER_HASH
      || request.headers.get('x-bropilot-runner-hash') !== RUNNER_HASH) return fail('forbidden', 'Use a registered scoped verifier.', 403);
    const run = state.runs.find(item => item.runId === runId);
    if (!run) return fail('not_found', 'Verification run not found.', 404);
    if (operation === 'claim') {
      if (run.attempt >= 4 || parsed.runnerHash !== RUNNER_HASH || !principal.operations?.includes('claimRun')) return fail('runner_mismatch', 'The runner or retry policy does not allow this claim.', 403);
      const leaseId = crypto.randomUUID();
      const response = await execute(env, principal, worldId, 'verifier', { kind: 'claimRun', runId, leaseId,
        verifierId: principal.principalId, runnerHash: RUNNER_HASH, requestId: crypto.randomUUID() });
      if (response.status === 'error') return commandResponse(response);
      const job = await stub.getClaimedJob(runId, leaseId);
      if (!job?.sourceRef) return fail('binding_mismatch', 'The claimed source has no immutable reference.', 409);
      const { provider } = storage(env);
      const source = await readPinnedSource(provider, job.sourceRef);
      return hostedJson({ job: { ...job, source } });
    }
    if (typeof parsed.leaseId !== 'string' || !principal.operations?.includes('completeHostedRun')) return fail('forbidden', 'A completion lease is required.', 403);
    if (operation === 'package') {
      const job = await stub.getClaimedJob(runId, parsed.leaseId);
      if (!job?.sourceRef || run.status !== 'running' || run.activeLease?.verifierId !== principal.principalId
        || run.activeLease.expiresAtMs <= Date.now()) return fail('lease_expired', 'The package upload lease is not active.', 409);
      if (typeof parsed.requestId !== 'string' || !object(parsed.upload) || !env.BUILD_PACKAGES) return fail('invalid_input', 'Provide the lease-bound build package.');
      if (!await stub.reservePackageUpload(runId, parsed.leaseId, principal.principalId, await sha(JSON.stringify(parsed.upload)), Date.now())) return fail('package_upload_conflict', 'This lease already reserved a different package or has expired.', 409);
      const retained = await stub.getPackageReceipt(runId, parsed.leaseId, principal.principalId);
      if (retained) return hostedJson({ packageRef: retained });
      const packageRef = await retainBuildPackage(env.BUILD_PACKAGES, parsed.upload as BuildPackageUpload, { ...job, sourceRef: job.sourceRef });
      await stub.savePackageReceipt(runId, parsed.leaseId, principal.principalId, packageRef, Date.now());
      return hostedJson({ packageRef });
    }
    if (parsed.runId !== runId || parsed.sourceDigest !== run.sourceDigest || parsed.contractHash !== run.contractHash
      || parsed.planHash !== run.planHash || !Array.isArray(parsed.observations) || !validId(parsed.requestId)) return fail('binding_mismatch', 'Complete the exact run and its pinned inputs.', 409);
    const receipt = await stub.getPackageReceipt(runId, parsed.leaseId, principal.principalId);
    if (parsed.packageRef !== undefined) {
      if (!receipt || object(parsed.packageRef)?.packageDigest !== receipt.packageDigest) return fail('package_receipt_required', 'Use the retained package receipt issued to this lease.', 409);
      await loadVerifiedPackage(env.BUILD_PACKAGES!, receipt);
    }
    return commandResponse(await execute(env, principal, worldId, 'verifier', {
      kind: 'completeHostedRun', runId, leaseId: parsed.leaseId, sourceDigest: run.sourceDigest, contractHash: run.contractHash,
      planHash: run.planHash, ...(parsed.packageRef !== undefined && receipt ? { packageRef: receipt } : {}),
      observations: parsed.observations as Extract<WorldCommand, { kind: 'completeHostedRun' }>['observations'], requestId: parsed.requestId,
    }));
  }
  if (['actor', 'principal', 'state', 'nowMs', 'runnerHash', 'sourceRef', 'packageRef'].some(key => Object.hasOwn(parsed, key))) return fail('invalid_input', 'Submit a command without authority or evidence fields.');
  if (!validId(parsed.requestId)) return fail('invalid_input', 'requestId is required.');
  let command: WorldCommand; let actor: Actor = 'owner';
  if (parsed.kind === 'submitCandidate') {
    if (principal.kind === 'service' && principal.role !== 'implementer') return fail('forbidden', 'Use implementation authority.', 403);
    if (!validId(parsed.moveId) || !validId(parsed.candidateId) || !object(parsed.source)) return fail('invalid_input', 'Provide a candidate, Move and source bundle.');
    actor = 'implementer';
    const source = parsed.source as StoredSourceBundle;
    const digest = await computeSourceBundleDigest(source);
    const repository = await stub.getSourceRepository();
    if (!repository) return fail('storage_unavailable', 'World source storage is unavailable.', 503);
    const existing = state.candidates.find(item => item.candidateId === parsed.candidateId);
    command = { kind: 'submitHostedCandidate', candidateId: parsed.candidateId, moveId: parsed.moveId, source,
      sourceRef: existing?.sourceRef ?? { namespace: repository.namespace, repoId: repository.repoId, repoName: repository.repoName,
        commitSha: '0'.repeat(40), treeSha: '0'.repeat(40), contentDigest: digest }, requestId: parsed.requestId };
    const preview = await stub.previewWithPrincipal(actor, context(principal, worldId, actor, command.kind), Date.now(), command);
    if (preview.status === 'error') return commandResponse(preview);
    if (!existing) {
      await reconcile(env, state);
      const latestRepository = await stub.getSourceRepository();
      const { provider, writer } = storage(env);
      command.sourceRef = await persistCandidateSource(provider, writer, { repository: latestRepository!, candidateId: command.candidateId,
        requestId: command.requestId, expectedBaseCommitSha: latestRepository!.mainCommitSha, source, nowMs: Date.now() });
    }
  } else {
    if (principal.kind !== 'human') return fail('forbidden', 'A human owner must request this action.', 403);
    if (!['createMove', 'startVerification', 'promote', 'requestDeployment', 'requestRollback'].includes(String(parsed.kind))) return fail('forbidden', 'This command is not a public owner action.', 403);
    command = parsed as WorldCommand;
    if (command.kind === 'requestDeployment' || command.kind === 'requestRollback') {
      const targetId = command.targetId;
      const target = state.hosted.deploymentTargets.find(item => item.targetId === targetId);
      const connection = (await connections(env, principal.principalId)?.listMetadata(principal.principalId))?.[0];
      if (!target || !connection || connection.connectionId !== target.connectionId || connection.accountId !== target.accountId
        || connection.reconnectRequired) return fail('connection_required', 'Reconnect and confirm the target account.', 409);
      if (!env.DEPLOYMENT_WORKFLOW || !env.BUILD_PACKAGES) return fail('configuration_missing', 'Deployment services are unavailable.', 503);
      if (command.kind === 'requestDeployment') {
        try { await reconcile(env, state); }
        catch { return fail('source_reconciliation_pending', 'Canonical source storage is pending. Retry reconciliation before deployment.', 503); }
      }
    }
  }
  const response = await execute(env, principal, worldId, actor, command);
  if (response.status === 'ok') {
    if (command.kind === 'promote') {
      try { await reconcile(env, response.state); }
      catch { return hostedJson({ ...response, storageReconciliation: 'pending' }); }
    }
    if (command.kind === 'requestDeployment' || command.kind === 'requestRollback') {
      try { await dispatch(env, worldId, command.deploymentId); }
      catch { return hostedJson({ ...response, dispatch: 'pending' }); }
    }
  }
  return commandResponse(response);
}
