import { DurableObject, WorkflowEntrypoint } from 'cloudflare:workers';
import type { WorkflowEvent, WorkflowStep } from 'cloudflare:workers';
import { loadVerifiedPackage } from '../artifacts/packages.js';
import type { RetainedPackageRef as ArtifactRetainedPackageRef } from '../artifacts/packages.js';
import type { CloudflareConnectionStore } from './oauth.js';

const API_BASE = 'https://api.cloudflare.com/client/v4';

export type RetainedPackageRef = ArtifactRetainedPackageRef;

export type DeploymentContext = {
  worldId: string;
  deploymentId: string;
  jobId: string;
  targetId: string;
  thingId: string;
  revisionId: string;
  packageRef: RetainedPackageRef;
  requesterPrincipalId: string;
  connectionPrincipalId: string;
  connectionId: string;
  accountId: string;
  expectedHeadRevisionId?: string;
  expectedActiveProviderVersionId?: string;
  rollbackProviderVersionId?: string;
  publicationAllowed?: boolean;
};

export type DeploymentProgressUpdate = {
  progressSeq: number;
  phase: 'authorizePublication' | 'packageVerified' | 'providerVersionCreated' | 'deployed' | 'failed' | 'uncertain';
  providerVersionId?: string;
  url?: string;
  failure?: string;
};

export type DeploymentProgressResponse = { accepted: boolean; publicationAuthorized?: boolean };

export type DeploymentObservation = {
  surface: 'health' | 'page' | 'api';
  observedAtMs: number;
  healthy: boolean;
  status?: number;
  summary: string;
};

export interface WorldDeploymentAuthorityPort {
  getDeploymentContext(deploymentId: string): Promise<DeploymentContext | null>;
  applyDeploymentProgress(deploymentId: string, update: DeploymentProgressUpdate): Promise<DeploymentProgressResponse>;
  recordDeploymentObservation(deploymentId: string, observation: DeploymentObservation): Promise<unknown>;
}
export interface ProviderFetchPort {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
  checkFence(): Promise<string | void>;
  recoverFrozen?(providerVersionId: string): Promise<void>;
  recoverPreparation?(observedActiveVersionId?: string): Promise<void>;
  recordVersion?(providerVersionId: string): Promise<void>;
}

type TargetLease = {
  jobId: string;
  fence: number;
  expectedActiveVersionId?: string;
  status: 'active' | 'complete' | 'failed' | 'frozen';
  reason?: string;
  uncertaintyStage?: 'prepare' | 'publish';
  providerVersionId?: string;
  providerDeploymentId?: string;
};

type TargetState = { lastFence: number; lease?: TargetLease };

export type DeploymentEnv = {
  BUILD_PACKAGES: R2Bucket;
  WORLD_AUTHORITY: DurableObjectNamespace<DurableObject<Record<string, unknown>> & WorldDeploymentAuthorityPort>;
  CLOUDFLARE_CONNECTIONS: DurableObjectNamespace<CloudflareConnectionStore>;
  DEPLOYMENT_TARGETS: DurableObjectNamespace<TargetDeploymentAuthority>;
};

export class TargetDeploymentAuthority extends DurableObject<Record<string, never>> {
  private async state(): Promise<TargetState> {
    return await this.ctx.storage.get<TargetState>('target') ?? { lastFence: 0 };
  }

  async acquire(jobId: string, expectedActiveVersionId?: string): Promise<TargetLease> {
    if (!jobId) throw new Error('deployment job ID is required');
    const state = await this.state();
    if (state.lease?.status === 'frozen') {
      if (state.lease.jobId === jobId) return structuredClone(state.lease);
      throw new Error(`deployment target is frozen: ${state.lease.reason ?? 'provider outcome unknown'}`);
    }
    if (state.lease?.status === 'active') {
      if (state.lease.jobId === jobId) return structuredClone(state.lease);
      throw new Error('another deployment job is active for this target');
    }
    const lease: TargetLease = { jobId, fence: state.lastFence + 1, expectedActiveVersionId, status: 'active' };
    await this.ctx.storage.put('target', { lastFence: lease.fence, lease } satisfies TargetState);
    return structuredClone(lease);
  }

  async checkFence(jobId: string, fence: number): Promise<void> {
    const state = await this.state();
    if (!state.lease || state.lease.jobId !== jobId || state.lease.fence !== fence || state.lease.status !== 'active') {
      throw new Error('deployment fence is stale or inactive');
    }
  }

  async freeze(jobId: string, fence: number, reason: string, uncertaintyStage: 'prepare' | 'publish' = 'publish'): Promise<void> {
    const state = await this.state();
    if (!state.lease || state.lease.jobId !== jobId || state.lease.fence !== fence
      || (state.lease.status !== 'active' && state.lease.status !== 'frozen')) throw new Error('deployment fence is stale or inactive');
    const priorStage = state.lease.status === 'frozen' ? state.lease.uncertaintyStage ?? 'publish' : uncertaintyStage;
    state.lease = {
      ...state.lease, status: 'frozen', reason: reason.slice(0, 500),
      uncertaintyStage: priorStage === 'publish' || uncertaintyStage === 'publish' ? 'publish' : 'prepare',
    };
    await this.ctx.storage.put('target', state);
  }

  async recoverPreparation(jobId: string, fence: number, observedActiveVersionId?: string): Promise<void> {
    const state = await this.state();
    if (!state.lease || state.lease.jobId !== jobId || state.lease.fence !== fence) throw new Error('deployment fence is stale or inactive');
    if (state.lease.status !== 'frozen' || state.lease.uncertaintyStage !== 'prepare') {
      throw new Error('frozen deployment requires exact publication reconciliation evidence');
    }
    if (state.lease.expectedActiveVersionId !== observedActiveVersionId) {
      throw new Error('active Worker version drifted during preparation reconciliation');
    }
    state.lease = { ...state.lease, status: 'active', reason: undefined, uncertaintyStage: undefined };
    await this.ctx.storage.put('target', state);
  }

  async recover(jobId: string, fence: number, reconciledProviderVersionId: string): Promise<void> {
    const state = await this.state();
    if (!state.lease || state.lease.jobId !== jobId || state.lease.fence !== fence) throw new Error('deployment fence is stale or inactive');
    if (state.lease.status === 'active') return;
    if (state.lease.status !== 'frozen' || !reconciledProviderVersionId) throw new Error('frozen deployment requires provider reconciliation evidence');
    state.lease = {
      ...state.lease, status: 'active', reason: undefined, uncertaintyStage: undefined,
      providerVersionId: reconciledProviderVersionId,
    };
    await this.ctx.storage.put('target', state);
  }

  async complete(jobId: string, fence: number, providerVersionId: string, providerDeploymentId?: string): Promise<void> {
    const state = await this.state();
    if (!state.lease || state.lease.jobId !== jobId || state.lease.fence !== fence) {
      throw new Error('deployment fence is stale or inactive');
    }
    if (state.lease.status === 'complete') {
      if (state.lease.providerVersionId === providerVersionId && state.lease.providerDeploymentId === providerDeploymentId) return;
      throw new Error('completed deployment evidence does not match the replayed result');
    }
    if (state.lease.status !== 'active') throw new Error('deployment fence is stale or inactive');
    state.lease = { ...state.lease, status: 'complete', providerVersionId, providerDeploymentId };
    await this.ctx.storage.put('target', state);
  }

  async fail(jobId: string, fence: number, reason: string): Promise<void> {
    const state = await this.state();
    if (!state.lease || state.lease.jobId !== jobId || state.lease.fence !== fence) {
      throw new Error('deployment fence is stale or inactive');
    }
    const boundedReason = reason.slice(0, 500);
    if (state.lease.status === 'failed') {
      if (state.lease.reason === boundedReason) return;
      throw new Error('failed deployment reason does not match the replayed result');
    }
    if (state.lease.status !== 'active') throw new Error('deployment fence is stale or inactive');
    state.lease = { ...state.lease, status: 'failed', reason: boundedReason };
    await this.ctx.storage.put('target', state);
  }
}

function hex(bytes: Uint8Array): string {
  return [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export async function deriveWorkerName(worldId: string, thingId: string): Promise<string> {
  const source = `${worldId}:${thingId}`;
  const slug = `${worldId}-${thingId}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 43) || 'world-thing';
  const suffix = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source)))).slice(0, 16);
  return `bp-${slug}-${suffix}`;
}

class ProviderOutcomeUncertainError extends Error {
  constructor(message: string, readonly uncertaintyStage: 'prepare' | 'publish' = 'publish') {
    super(message);
  }
}

type ApiEnvelope<T> = { success: boolean; result?: T; errors?: Array<{ message?: string }> };

async function providerRequest<T>(
  port: ProviderFetchPort,
  url: string,
  init: RequestInit,
  mutating = false,
  preserveAuthorization = false,
  uncertaintyStage: 'prepare' | 'publish' = 'publish',
): Promise<T> {
  if (mutating) {
    const currentAccessToken = await port.checkFence();
    if (currentAccessToken && !preserveAuthorization) {
      const headers = new Headers(init.headers);
      headers.set('authorization', `Bearer ${currentAccessToken}`);
      init = { ...init, headers };
    }
  }
  let response: Response;
  try {
    response = await port.fetch(url, init);
  } catch (error) {
    if (mutating) throw new ProviderOutcomeUncertainError(
      error instanceof Error ? error.message : 'provider write outcome is unknown', uncertaintyStage,
    );
    throw error;
  }
  const body = await response.json().catch(() => null) as ApiEnvelope<T> | null;
  if (mutating && (response.status === 408 || response.status >= 500)) {
    const message = body?.errors?.[0]?.message || `Cloudflare write outcome is unknown (status ${response.status})`;
    throw new ProviderOutcomeUncertainError(message, uncertaintyStage);
  }
  if (mutating && response.ok && (!body?.success || body.result === undefined)) {
    throw new ProviderOutcomeUncertainError('provider accepted a write but returned an unusable response', uncertaintyStage);
  }
  if (!response.ok || !body?.success || body.result === undefined) {
    const message = body?.errors?.[0]?.message || 'Cloudflare API request failed';
    throw new Error(`${message} (status ${response.status})`);
  }
  return body.result;
}

function authorization(accessToken: string, extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  headers.set('authorization', `Bearer ${accessToken}`);
  return headers;
}

function base64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function providerAssetHash(path: string, bytes: Uint8Array): Promise<string> {
  const filename = path.split('/').at(-1) ?? '';
  const separator = filename.lastIndexOf('.');
  const extension = separator >= 0 ? filename.slice(separator + 1) : '';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${base64(bytes)}${extension}`));
  return hex(new Uint8Array(digest)).slice(0, 32);
}

function deploymentTag(deploymentId: string, packageDigest: string): string {
  const tag = `bp:${deploymentId}:${packageDigest.slice(0, 16)}`;
  if (new TextEncoder().encode(tag).byteLength > 100) throw new Error('deployment identifier is too long for the provider reconciliation tag');
  return tag;
}

type DeployablePackage = Awaited<ReturnType<typeof loadVerifiedPackage>>;

function validateProviderInput(input: ProviderDeploymentInput, deployable: DeployablePackage): void {
  if (!/^[0-9a-f]{32}$/i.test(input.accountId)) throw new Error('invalid Cloudflare account ID');
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(input.workerName)) throw new Error('invalid dedicated Worker name');
  if (!/^[0-9a-f]{64}$/i.test(input.packageDigest) || deployable.manifest.packageDigest !== input.packageDigest) {
    throw new Error('deployment package digest does not match the retained manifest');
  }
  if (deployable.manifest.module.path !== 'worker.mjs') throw new Error('deployable Worker module must be worker.mjs');
}

function safeDeployableConfig(config: Record<string, unknown>): {
  compatibility_date?: string;
  compatibility_flags?: string[];
  assets?: Record<string, unknown>;
} {
  const allowed = new Set(['compatibilityDate', 'compatibilityFlags', 'assets']);
  if (Object.keys(config).some((key) => !allowed.has(key))) throw new Error('deployable config contains unsupported provider authority');
  if (config.compatibilityDate !== undefined
    && (typeof config.compatibilityDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(config.compatibilityDate))) {
    throw new Error('deployable compatibility date is invalid');
  }
  if (config.compatibilityFlags !== undefined
    && (!Array.isArray(config.compatibilityFlags) || config.compatibilityFlags.some((flag) => typeof flag !== 'string'))) {
    throw new Error('deployable compatibility flags are invalid');
  }
  if (config.assets !== undefined && (!config.assets || typeof config.assets !== 'object' || Array.isArray(config.assets))) {
    throw new Error('deployable assets config is invalid');
  }
  return {
    compatibility_date: config.compatibilityDate as string | undefined,
    compatibility_flags: config.compatibilityFlags as string[] | undefined,
    assets: config.assets as Record<string, unknown> | undefined,
  };
}

export type ProviderDeploymentInput = {
  accountId: string;
  workerName: string;
  accessToken: string;
  deploymentId: string;
  packageDigest: string;
  expectedActiveVersionId?: string | null;
};

export type ProviderDeploymentResult = { versionId: string; deploymentId: string; url: string; reconciled: boolean };

type VersionSummary = { id?: string; annotations?: Record<string, string> };
type DeploymentSummary = { id: string; versions?: Array<{ version_id: string; percentage: number }> };
type WorkerSummary = { id: string; name: string; tags?: string[] };

const MANAGED_WORKER_TAG = 'bropilot-managed';

async function ensureWorkerVisible(
  port: ProviderFetchPort,
  scripts: string,
  headers: Headers,
): Promise<void> {
  let visibility: { enabled: boolean };
  try {
    visibility = await providerRequest<{ enabled: boolean }>(port, `${scripts}/subdomain`, { method: 'GET', headers });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('status 404')) throw error;
    visibility = { enabled: false };
  }
  if (visibility.enabled) return;
  const updateHeaders = new Headers(headers);
  updateHeaders.set('content-type', 'application/json');
  const enabled = await providerRequest<{ enabled: boolean }>(port, `${scripts}/subdomain`, {
    method: 'POST', headers: updateHeaders,
    body: JSON.stringify({ enabled: true, previews_enabled: false }),
  }, true);
  if (!enabled.enabled) throw new Error('Cloudflare did not enable the dedicated Worker workers.dev subdomain');
}

export async function deployPackageToCloudflare(
  input: ProviderDeploymentInput,
  deployable: DeployablePackage,
  port: ProviderFetchPort,
): Promise<ProviderDeploymentResult> {
  validateProviderInput(input, deployable);
  const account = `${API_BASE}/accounts/${input.accountId}`;
  const scripts = `${account}/workers/scripts/${input.workerName}`;
  const headers = authorization(input.accessToken);
  const tag = deploymentTag(input.deploymentId, input.packageDigest);
  const config = safeDeployableConfig(deployable.manifest.deployableConfig);

  const subdomain = await providerRequest<{ subdomain: string }>(port, `${account}/workers/subdomain`, { method: 'GET', headers });
  if (!subdomain.subdomain) throw new Error('workers.dev subdomain must be configured before deployment');

  let worker: WorkerSummary | undefined;
  try {
    worker = await providerRequest<WorkerSummary>(port, `${account}/workers/workers/${input.workerName}`, { method: 'GET', headers });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('status 404')) throw error;
  }
  if (worker && !worker.tags?.includes(MANAGED_WORKER_TAG)) {
    throw new Error('dedicated Worker name is already occupied by an unmanaged Worker');
  }
  let versions: VersionSummary[] = [];
  if (worker) {
    const response = await providerRequest<{ id?: string; annotations?: Record<string, string> }[]>(
      port, `${account}/workers/workers/${worker.id}/versions`, { method: 'GET', headers },
    );
    versions = response.map((version) => ({ id: version.id, annotations: version.annotations }));
  }
  const reconciledVersion = versions.find((version) => version.annotations?.['workers/tag'] === tag)?.id;
  if (versions.length > 0 && !reconciledVersion
    && versions.some((version) => !version.annotations?.['workers/tag']?.startsWith('bp:'))) {
    throw new Error('dedicated Worker name is already occupied by an unmanaged Worker');
  }

  let deployments: DeploymentSummary[] = [];
  try {
    const result = await providerRequest<{ deployments: DeploymentSummary[] }>(port, `${scripts}/deployments`, { method: 'GET', headers });
    deployments = result.deployments;
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('status 404')) throw error;
  }
  const activeVersion = deployments[0]?.versions?.find((version) => version.percentage === 100)?.version_id;
  if (reconciledVersion && activeVersion === reconciledVersion && deployments[0]) {
    await port.recoverFrozen?.(reconciledVersion);
    await port.recordVersion?.(reconciledVersion);
    await ensureWorkerVisible(port, scripts, headers);
    return {
      versionId: reconciledVersion, deploymentId: deployments[0].id,
      url: `https://${input.workerName}.${subdomain.subdomain}.workers.dev`, reconciled: true,
    };
  }
  if ((input.expectedActiveVersionId ?? undefined) !== activeVersion
    && (input.expectedActiveVersionId !== null || activeVersion !== undefined)) {
    throw new Error('active Worker version drifted from the expected provider version');
  }
  if (!reconciledVersion) await port.recoverPreparation?.(activeVersion);

  if (!worker) {
    worker = await providerRequest<WorkerSummary>(port, `${account}/workers/workers`, {
      method: 'POST', headers: authorization(input.accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ name: input.workerName, tags: [MANAGED_WORKER_TAG] }),
    }, true, false, 'prepare');
    if (!worker.id || worker.name !== input.workerName || !worker.tags?.includes(MANAGED_WORKER_TAG)) {
      throw new ProviderOutcomeUncertainError('Cloudflare Worker creation returned unusable ownership evidence', 'prepare');
    }
  }

  let versionId = reconciledVersion;
  if (!versionId) {
    const providerAssets = await Promise.all(deployable.manifest.assets.map(async (asset) => {
      const bytes = deployable.assets[asset.path];
      if (!bytes) throw new Error(`retained asset bytes are unavailable: ${asset.path}`);
      return { asset, bytes, hash: await providerAssetHash(asset.path, bytes) };
    }));
    const assetManifest = Object.fromEntries(providerAssets.map(({ asset, hash }) => [
      `/${asset.path.slice('public/'.length)}`, { hash, size: asset.bytes },
    ]));
    const session = await providerRequest<{ buckets: string[][]; jwt: string }>(port, `${scripts}/assets-upload-session`, {
      method: 'POST', headers: authorization(input.accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify({ manifest: assetManifest }),
    }, true, false, 'prepare');
    if (typeof session.jwt !== 'string' || session.jwt.length === 0 || !Array.isArray(session.buckets)) {
      throw new ProviderOutcomeUncertainError('Cloudflare asset upload session is malformed', 'prepare');
    }
    let completionJwt = session.jwt;
    const assetsByHash = new Map(providerAssets.map(({ hash, bytes }) => [hash, bytes]));
    for (const bucket of session.buckets) {
      const form = new FormData();
      for (const hash of bucket) {
        const bytes = assetsByHash.get(hash);
        if (!bytes) throw new Error(`Cloudflare requested an unknown asset hash: ${hash}`);
        form.append(hash, new Blob([base64(bytes)], { type: 'application/null' }));
      }
      const uploaded = await providerRequest<{ jwt: string }>(port, `${account}/workers/assets/upload?base64=true`, {
        method: 'POST', headers: authorization(session.jwt), body: form,
      }, true, true, 'prepare');
      if (typeof uploaded.jwt !== 'string' || uploaded.jwt.length === 0) {
        throw new ProviderOutcomeUncertainError('Cloudflare asset upload response is malformed', 'prepare');
      }
      completionJwt = uploaded.jwt;
    }
    const versionPayload = {
      main_module: deployable.manifest.module.path,
      compatibility_date: config.compatibility_date,
      compatibility_flags: config.compatibility_flags,
      bindings: [{ type: 'assets', name: 'ASSETS' }],
      assets: { jwt: completionJwt, config: config.assets },
      annotations: { 'workers/tag': tag },
      modules: [{
        name: deployable.manifest.module.path,
        content_type: 'application/javascript+module',
        content_base64: base64(deployable.compiledWorker),
      }],
    };
    const version = await providerRequest<{ id: string }>(port, `${account}/workers/workers/${worker.id}/versions`, {
      method: 'POST', headers: authorization(input.accessToken, { 'content-type': 'application/json' }),
      body: JSON.stringify(versionPayload),
    }, true);
    if (typeof version.id !== 'string' || version.id.trim().length === 0) {
      throw new ProviderOutcomeUncertainError('Cloudflare version response is malformed');
    }
    versionId = version.id;
  }

  await port.recordVersion?.(versionId);
  if (reconciledVersion) await port.recoverFrozen?.(reconciledVersion);

  const deployment = await providerRequest<{ id: string }>(port, `${scripts}/deployments`, {
    method: 'POST', headers: authorization(input.accessToken, { 'content-type': 'application/json' }),
    body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: versionId, percentage: 100 }] }),
  }, true);
  if (typeof deployment.id !== 'string' || deployment.id.trim().length === 0) {
    throw new ProviderOutcomeUncertainError('Cloudflare deployment response is malformed');
  }
  await ensureWorkerVisible(port, scripts, headers);
  return {
    versionId, deploymentId: deployment.id,
    url: `https://${input.workerName}.${subdomain.subdomain}.workers.dev`,
    reconciled: Boolean(reconciledVersion),
  };
}

export async function rollbackCloudflareDeployment(
  input: Omit<ProviderDeploymentInput, 'packageDigest' | 'deploymentId'> & { priorVersionId: string },
  port: ProviderFetchPort,
): Promise<{ deploymentId: string; url: string; reconciled: boolean }> {
  const scripts = `${API_BASE}/accounts/${input.accountId}/workers/scripts/${input.workerName}`;
  const headers = authorization(input.accessToken);
  const subdomain = await providerRequest<{ subdomain: string }>(port, `${API_BASE}/accounts/${input.accountId}/workers/subdomain`, { method: 'GET', headers });
  if (!subdomain.subdomain) throw new Error('workers.dev subdomain must be configured before rollback');
  const current = await providerRequest<{ deployments: DeploymentSummary[] }>(port, `${scripts}/deployments`, { method: 'GET', headers });
  const active = current.deployments[0]?.versions?.find((version) => version.percentage === 100)?.version_id;
  if (active === input.priorVersionId && current.deployments[0]) {
    await port.recoverFrozen?.(input.priorVersionId);
    await port.recordVersion?.(input.priorVersionId);
    return {
      deploymentId: current.deployments[0].id,
      url: `https://${input.workerName}.${subdomain.subdomain}.workers.dev`,
      reconciled: true,
    };
  }
  if (active !== input.expectedActiveVersionId) throw new Error('active Worker version drifted before rollback');
  const deployment = await providerRequest<{ id: string }>(port, `${scripts}/deployments`, {
    method: 'POST', headers: authorization(input.accessToken, { 'content-type': 'application/json' }),
    body: JSON.stringify({ strategy: 'percentage', versions: [{ version_id: input.priorVersionId, percentage: 100 }] }),
  }, true);
  if (typeof deployment.id !== 'string' || deployment.id.trim().length === 0) {
    throw new ProviderOutcomeUncertainError('Cloudflare rollback deployment response is malformed');
  }
  return { deploymentId: deployment.id, url: `https://${input.workerName}.${subdomain.subdomain}.workers.dev`, reconciled: false };
}

async function observe(url: string, surface: DeploymentObservation['surface'], path: string): Promise<DeploymentObservation> {
  const observedAtMs = Date.now();
  try {
    const response = await fetch(`${url}${path}`, { redirect: 'error' });
    return { surface, observedAtMs, healthy: response.ok, status: response.status, summary: response.ok ? 'surface responded successfully' : 'surface returned a non-success status' };
  } catch {
    return { surface, observedAtMs, healthy: false, summary: 'surface request failed' };
  }
}

function plainRpc<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function contextStillAuthorized(initial: DeploymentContext, current: DeploymentContext | null): current is DeploymentContext {
  return Boolean(current
    && current.worldId === initial.worldId
    && current.deploymentId === initial.deploymentId
    && current.jobId === initial.jobId
    && current.targetId === initial.targetId
    && current.thingId === initial.thingId
    && current.revisionId === initial.revisionId
    && current.packageRef.packageDigest === initial.packageRef.packageDigest
    && current.connectionPrincipalId === initial.connectionPrincipalId
    && current.connectionId === initial.connectionId
    && current.accountId === initial.accountId
    && current.rollbackProviderVersionId === initial.rollbackProviderVersionId);
}

function requireProgress(response: DeploymentProgressResponse, phase: DeploymentProgressUpdate['phase']): void {
  if (!response.accepted) throw new Error(`World authority rejected ${phase} deployment progress`);
}

export class DeploymentWorkflow extends WorkflowEntrypoint<DeploymentEnv, { worldId: string; deploymentId: string }> {
  async run(event: WorkflowEvent<{ worldId: string; deploymentId: string }>, step: WorkflowStep): Promise<ProviderDeploymentResult> {
    const { worldId, deploymentId } = event.payload;
    const world = this.env.WORLD_AUTHORITY.getByName(worldId);
    let context: DeploymentContext | null = null;
    let lease: TargetLease | undefined;
    let failureTarget: Pick<TargetDeploymentAuthority, 'freeze' | 'fail'> | undefined;
    let providerSuccessProved = false;
    try {
      context = await step.do<DeploymentContext | null>('load authorized deployment context', async () => (
        plainRpc(await world.getDeploymentContext(deploymentId))
      ));
      if (!context || context.worldId !== worldId || context.deploymentId !== deploymentId) throw new Error('deployment context is unavailable');
      const authorizedContext = context;
      const authorizationResult = await step.do<DeploymentProgressResponse>('authorize provider publication', async () => (
        plainRpc(await world.applyDeploymentProgress(deploymentId, {
          progressSeq: 1, phase: 'authorizePublication',
        }))
      ));
      if (!authorizationResult.accepted || !authorizationResult.publicationAuthorized) throw new Error('deployment publication was not authorized');
      await step.do<string>('verify retained package', async () => {
        const verified = await loadVerifiedPackage(this.env.BUILD_PACKAGES, authorizedContext.packageRef);
        return verified.manifest.packageDigest;
      });
      await step.do<boolean>('record verified package', async () => {
        requireProgress(await world.applyDeploymentProgress(deploymentId, { progressSeq: 2, phase: 'packageVerified' }), 'packageVerified');
        return true;
      });
      const workerName = await deriveWorkerName(authorizedContext.worldId, authorizedContext.thingId);
      const target = this.env.DEPLOYMENT_TARGETS.getByName(`${authorizedContext.accountId}:${workerName}`);
      failureTarget = target;
      const acquiredLease = await step.do<TargetLease>('acquire deployment target fence', async () => (
        plainRpc(await target.acquire(authorizedContext.jobId, authorizedContext.expectedActiveProviderVersionId))
      ));
      lease = acquiredLease;
      const connection = this.env.CLOUDFLARE_CONNECTIONS.getByName(authorizedContext.connectionPrincipalId);
      const result = await step.do<ProviderDeploymentResult>('publish dedicated Worker version', async () => {
        const accessToken = await connection.getAccessToken(authorizedContext.connectionPrincipalId, authorizedContext.connectionId);
        const recheck = async (): Promise<string> => {
          const fresh = plainRpc(await world.getDeploymentContext(deploymentId));
          if (!contextStillAuthorized(authorizedContext, fresh)) throw new Error('deployment authority changed before provider write');
          if (fresh.publicationAllowed === false) throw new Error('deployment publication is no longer allowed');
          await target.checkFence(authorizedContext.jobId, acquiredLease.fence);
          return connection.getAccessToken(authorizedContext.connectionPrincipalId, authorizedContext.connectionId);
        };
        const port: ProviderFetchPort = {
          fetch: (input, init) => fetch(input, init),
          checkFence: recheck,
          recoverFrozen: async (providerVersionId) => {
            const fresh = plainRpc(await world.getDeploymentContext(deploymentId));
            if (!contextStillAuthorized(authorizedContext, fresh)) throw new Error('deployment authority changed before reconciliation recovery');
            await connection.getAccessToken(authorizedContext.connectionPrincipalId, authorizedContext.connectionId);
            await target.recover(authorizedContext.jobId, acquiredLease.fence, providerVersionId);
          },
          recoverPreparation: acquiredLease.status === 'frozen' && acquiredLease.uncertaintyStage === 'prepare'
            ? async (observedActiveVersionId) => {
              const fresh = plainRpc(await world.getDeploymentContext(deploymentId));
              if (!contextStillAuthorized(authorizedContext, fresh) || fresh.publicationAllowed === false
                || fresh.expectedActiveProviderVersionId !== authorizedContext.expectedActiveProviderVersionId) {
                throw new Error('deployment authority changed before preparation recovery');
              }
              await connection.getAccessToken(authorizedContext.connectionPrincipalId, authorizedContext.connectionId);
              await target.recoverPreparation(authorizedContext.jobId, acquiredLease.fence, observedActiveVersionId);
            }
            : undefined,
          recordVersion: async (providerVersionId) => {
            requireProgress(await world.applyDeploymentProgress(deploymentId, {
              progressSeq: 3, phase: 'providerVersionCreated', providerVersionId,
            }), 'providerVersionCreated');
          },
        };
        if (authorizedContext.rollbackProviderVersionId) {
          const rollback = await rollbackCloudflareDeployment({
            accountId: authorizedContext.accountId, workerName, accessToken,
            expectedActiveVersionId: authorizedContext.expectedActiveProviderVersionId,
            priorVersionId: authorizedContext.rollbackProviderVersionId,
          }, port);
          return { versionId: authorizedContext.rollbackProviderVersionId, deploymentId: rollback.deploymentId, url: rollback.url, reconciled: rollback.reconciled };
        }
        const deployable = await loadVerifiedPackage(this.env.BUILD_PACKAGES, authorizedContext.packageRef);
        return deployPackageToCloudflare({
          accountId: authorizedContext.accountId, workerName, accessToken, deploymentId,
          packageDigest: authorizedContext.packageRef.packageDigest,
          expectedActiveVersionId: authorizedContext.expectedActiveProviderVersionId ?? null,
        }, deployable, port);
      });
      providerSuccessProved = true;
      await step.do<boolean>('complete deployment target lease', async () => {
        await target.complete(authorizedContext.jobId, acquiredLease.fence, result.versionId, result.deploymentId);
        return true;
      });
      await step.do<boolean>('record provider deployment', async () => {
        await world.applyDeploymentProgress(deploymentId, {
          progressSeq: 4, phase: 'deployed', providerVersionId: result.versionId,
          url: result.url || undefined,
        }).then((response) => requireProgress(response, 'deployed'));
        return true;
      });
      if (result.url) {
        const observations = await step.do('observe deployed surfaces', async () => Promise.all([
          observe(result.url, 'health', '/health'), observe(result.url, 'page', '/'), observe(result.url, 'api', '/api/message'),
        ]));
        for (const observation of observations) await world.recordDeploymentObservation(deploymentId, observation);
      }
      return result;
    } catch (error) {
      if (providerSuccessProved) throw error;
      const failure = error instanceof Error ? error.message : 'deployment failed';
      const uncertain = error instanceof ProviderOutcomeUncertainError || lease?.status === 'frozen';
      if (context && lease && failureTarget) {
        try {
          if (uncertain) {
            const uncertaintyStage = error instanceof ProviderOutcomeUncertainError ? error.uncertaintyStage : 'publish';
            await failureTarget.freeze(context.jobId, lease.fence, failure, uncertaintyStage);
          }
          else await failureTarget.fail(context.jobId, lease.fence, failure);
        } catch {
          // The exact owned fence may already have been finalized by a prior workflow attempt.
        }
      }
      try {
        await step.do<boolean>('record workflow failure', async () => {
          requireProgress(await world.applyDeploymentProgress(deploymentId, {
            progressSeq: 5, phase: uncertain ? 'uncertain' : 'failed',
            failure: failure.slice(0, 500),
          }), uncertain ? 'uncertain' : 'failed');
          return true;
        });
      } catch {
        // Preserve the originating failure; workflow replay can retry bookkeeping.
      }
      throw error;
    }
  }
}
