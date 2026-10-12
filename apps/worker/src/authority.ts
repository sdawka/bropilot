import { DurableObject } from 'cloudflare:workers';
import type {
  Actor,
  Candidate,
  WorldCommand,
  WorldCommandResponse,
  WorldSnapshot,
  WorldState,
  PrincipalContext,
  RetainedPackageRef,
} from '@bropilot/contracts';
import { world_command } from '../../../packages/core-wasm/bropilot_core_wasm.js';
import type { WorldRepository } from './artifacts/source.js';
import type { DeploymentContext, DeploymentObservation, DeploymentProgressResponse, DeploymentProgressUpdate } from './cloudflare/deployment.js';

export type LocalEnv = {
  ASSETS: Fetcher;
  WORLD_AUTHORITY: DurableObjectNamespace<WorldAuthority>;
  LOCAL_WORLD_DIRECTORY: DurableObjectNamespace<LocalWorldDirectory>;
  LOCAL_WORKSPACE?: string;
  LOCAL_OWNER_TOKEN?: string;
  LOCAL_IMPLEMENTER_TOKEN?: string;
  LOCAL_VERIFIER_TOKEN?: string;
  ONTOLOGY_LAB_ORIGIN?: string;
  ONTOLOGY_LAB_TOKEN?: string;
};

export type WorldSummary = {
  worldId: string;
  title: string;
  headRevisionId: string;
  desiredRevisionId: string;
};

export type RunnableJob = { worldId: string; runId: string };

export type ClaimedJob = {
  worldId: string;
  runId: string;
  candidateId: string;
  leaseId: string;
  sourceDigest: string;
  contractHash: string;
  planHash: string;
  runnerHash: string;
  source: Candidate['source'];
  sourceRef?: Candidate['sourceRef'];
};

type StoredStateRow = { state_json: string };
type StoredRevisionRow = { snapshot_json: string };

function summary(state: WorldState): WorldSummary {
  return {
    worldId: state.worldId,
    title: state.title,
    headRevisionId: state.headRevisionId,
    desiredRevisionId: state.desired.revisionId,
  };
}

function canonicalProjection(state: WorldState, candidateId: string, revisionId: string): WorldSnapshot {
  const candidate = state.candidates.find((item) => item.candidateId === candidateId);
  if (!candidate) throw new Error('promoted candidate is missing from authoritative state');
  const snapshot = structuredClone(state.desired);
  snapshot.revisionId = revisionId;
  snapshot.stateKind = 'canonical';
  const thing = snapshot.things.find((item) => item.id === 'web-app');
  if (!thing) throw new Error('desired snapshot is missing the web-app Thing');
  thing.revisionId = candidate.sourceDigest;
  return snapshot;
}

export class WorldAuthority extends DurableObject<LocalEnv> {
  constructor(ctx: DurableObjectState, env: LocalEnv) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS authority_state (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        state_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS revisions (
        revision_id TEXT PRIMARY KEY,
        snapshot_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS hosted_owner (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        principal_id TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS source_repository (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        repository_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS package_receipts (
        run_id TEXT NOT NULL,
        lease_id TEXT NOT NULL,
        verifier_id TEXT NOT NULL,
        package_json TEXT NOT NULL,
        PRIMARY KEY (run_id, lease_id)
      );
      CREATE TABLE IF NOT EXISTS deployment_callbacks (
        deployment_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        command_json TEXT NOT NULL,
        PRIMARY KEY (deployment_id, phase)
      );
      CREATE TABLE IF NOT EXISTS package_uploads (
        run_id TEXT NOT NULL, lease_id TEXT NOT NULL, verifier_id TEXT NOT NULL,
        upload_digest TEXT NOT NULL, PRIMARY KEY (run_id, lease_id)
      );
      CREATE TABLE IF NOT EXISTS source_reconciliation (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1), revision_id TEXT NOT NULL
      );
    `);
  }

  private readState(): WorldState | null {
    const row = this.ctx.storage.sql
      .exec<StoredStateRow>('SELECT state_json FROM authority_state WHERE singleton = 1')
      .toArray()[0];
    return row ? JSON.parse(row.state_json) as WorldState : null;
  }

  getState(): WorldState | null {
    return this.readState();
  }

  getOwnerPrincipalId(): string | null {
    return this.ctx.storage.sql.exec<{ principal_id: string }>(
      'SELECT principal_id FROM hosted_owner WHERE singleton = 1',
    ).toArray()[0]?.principal_id ?? null;
  }

  /** Reserve ownership before provider writes; retries cannot adopt another user's World. */
  reserveHostedOwner(principalId: string): boolean {
    const owner = this.getOwnerPrincipalId();
    if (owner) return owner === principalId;
    if (this.readState()) return false;
    this.ctx.storage.sql.exec('INSERT INTO hosted_owner (singleton, principal_id) VALUES (1, ?)', principalId);
    return true;
  }

  getSourceRepository(): WorldRepository | null {
    const row = this.ctx.storage.sql.exec<{ repository_json: string }>(
      'SELECT repository_json FROM source_repository WHERE singleton = 1',
    ).toArray()[0];
    return row ? JSON.parse(row.repository_json) as WorldRepository : null;
  }

  saveSourceRepository(repository: WorldRepository): void {
    const existing = this.getSourceRepository();
    if (existing && (existing.repoId !== repository.repoId || existing.worldId !== repository.worldId)) {
      throw new Error('World source repository identity cannot change');
    }
    this.ctx.storage.sql.exec(
      `INSERT INTO source_repository (singleton, repository_json) VALUES (1, ?)
       ON CONFLICT(singleton) DO UPDATE SET repository_json = excluded.repository_json`,
      JSON.stringify(repository),
    );
  }

  getPackageReceipt(runId: string, leaseId: string, verifierId: string): RetainedPackageRef | null {
    const row = this.ctx.storage.sql.exec<{ package_json: string }>(
      'SELECT package_json FROM package_receipts WHERE run_id = ? AND lease_id = ? AND verifier_id = ?',
      runId, leaseId, verifierId,
    ).toArray()[0];
    return row ? JSON.parse(row.package_json) as RetainedPackageRef : null;
  }

  reservePackageUpload(runId: string, leaseId: string, verifierId: string, uploadDigest: string, nowMs: number): boolean {
    const run = this.readState()?.runs.find(item => item.runId === runId);
    if (!run || run.status !== 'running' || run.activeLease?.leaseId !== leaseId
      || run.activeLease.verifierId !== verifierId || run.activeLease.expiresAtMs <= nowMs
      || !/^[a-f0-9]{64}$/.test(uploadDigest)) return false;
    const existing = this.ctx.storage.sql.exec<{ verifier_id: string; upload_digest: string }>(
      'SELECT verifier_id, upload_digest FROM package_uploads WHERE run_id = ? AND lease_id = ?', runId, leaseId,
    ).toArray()[0];
    if (existing) return existing.verifier_id === verifierId && existing.upload_digest === uploadDigest;
    this.ctx.storage.sql.exec('INSERT INTO package_uploads (run_id, lease_id, verifier_id, upload_digest) VALUES (?, ?, ?, ?)', runId, leaseId, verifierId, uploadDigest);
    return true;
  }

  getSourceReconciliation(): { revisionId: string; status: 'current' | 'pending' } | null {
    const state = this.readState();
    if (!state?.hosted || !state.revisions.find(item => item.revisionId === state.headRevisionId)?.candidateId) return null;
    const row = this.ctx.storage.sql.exec<{ revision_id: string }>('SELECT revision_id FROM source_reconciliation WHERE singleton = 1').toArray()[0];
    return { revisionId: state.headRevisionId, status: row?.revision_id === state.headRevisionId ? 'current' : 'pending' };
  }

  markSourceReconciled(revisionId: string): void {
    if (this.readState()?.headRevisionId !== revisionId) return;
    this.ctx.storage.sql.exec('INSERT INTO source_reconciliation (singleton, revision_id) VALUES (1, ?) ON CONFLICT(singleton) DO UPDATE SET revision_id = excluded.revision_id', revisionId);
  }

  savePackageReceipt(runId: string, leaseId: string, verifierId: string, packageRef: RetainedPackageRef, nowMs: number): void {
    const state = this.readState();
    const run = state?.runs.find(item => item.runId === runId);
    if (!run || run.status !== 'running' || run.activeLease?.leaseId !== leaseId
      || run.activeLease.verifierId !== verifierId || run.activeLease.expiresAtMs <= nowMs) {
      throw new Error('The package upload lease is no longer active');
    }
    const existing = this.getPackageReceipt(runId, leaseId, verifierId);
    if (existing && existing.packageDigest !== packageRef.packageDigest) throw new Error('The lease already retained a different package');
    this.ctx.storage.sql.exec(
      'INSERT OR IGNORE INTO package_receipts (run_id, lease_id, verifier_id, package_json) VALUES (?, ?, ?, ?)',
      runId, leaseId, verifierId, JSON.stringify(packageRef),
    );
  }

  getSummary(): WorldSummary | null {
    const state = this.readState();
    return state ? summary(state) : null;
  }

  getRevision(revisionId: string): WorldSnapshot | null {
    const row = this.ctx.storage.sql
      .exec<StoredRevisionRow>('SELECT snapshot_json FROM revisions WHERE revision_id = ?', revisionId)
      .toArray()[0];
    return row ? JSON.parse(row.snapshot_json) as WorldSnapshot : null;
  }

  getRunnableJobs(nowMs: number): RunnableJob[] {
    const state = this.readState();
    if (!state) return [];
    return state.runs
      .filter((run) => run.attempt < 4 && (run.status === 'queued' || run.status === 'error'
        || (run.status === 'running' && (run.activeLease?.expiresAtMs ?? 0) <= nowMs))
      )
      .map((run) => ({ worldId: state.worldId, runId: run.runId }));
  }

  getClaimedJob(runId: string, leaseId: string): ClaimedJob | null {
    const state = this.readState();
    const run = state?.runs.find((item) => item.runId === runId);
    const candidate = state?.candidates.find((item) => item.candidateId === run?.candidateId);
    if (!state || !run || !candidate || run.activeLease?.leaseId !== leaseId) return null;
    return {
      worldId: state.worldId,
      runId,
      candidateId: candidate.candidateId,
      leaseId,
      sourceDigest: run.sourceDigest,
      contractHash: run.contractHash,
      planHash: run.planHash,
      runnerHash: state.kit.runnerHash,
      source: candidate.source,
      ...(candidate.sourceRef ? { sourceRef: candidate.sourceRef } : {}),
    };
  }

  getDeploymentContext(deploymentId: string): DeploymentContext | null {
    const state = this.readState();
    const job = state?.deployments.find(item => item.deploymentId === deploymentId);
    const target = state?.hosted?.deploymentTargets.find(item => item.targetId === job?.targetId);
    const owner = this.getOwnerPrincipalId();
    if (!state || !job || !target || !owner || job.requesterPrincipalId !== owner || target.ownerPrincipalId !== owner
      || job.status === 'failed') return null;
    const prior = job.rollbackOfDeploymentId
      ? state.deployments.find(item => item.deploymentId === job.rollbackOfDeploymentId)
      : undefined;
    const latest = state.deployments.filter(item => item.targetId === target.targetId
      && item.status === 'succeeded' && item.deploymentId !== deploymentId).at(-1);
    return {
      worldId: state.worldId, deploymentId, jobId: job.jobId, targetId: target.targetId, thingId: target.thingId,
      revisionId: job.revisionId, packageRef: job.packageRef, requesterPrincipalId: job.requesterPrincipalId,
      connectionPrincipalId: target.ownerPrincipalId, connectionId: target.connectionId, accountId: target.accountId,
      publicationAllowed: Boolean(job.rollbackOfDeploymentId || job.revisionId === state.headRevisionId),
      ...(job.expectedHeadRevisionId ? { expectedHeadRevisionId: job.expectedHeadRevisionId } : {}),
      ...(job.expectedActiveProviderVersionId ?? latest?.providerVersionId
        ? { expectedActiveProviderVersionId: job.expectedActiveProviderVersionId ?? latest?.providerVersionId } : {}),
      ...(prior?.providerVersionId ? { rollbackProviderVersionId: prior.providerVersionId } : {}),
    };
  }

  applyDeploymentProgress(deploymentId: string, update: DeploymentProgressUpdate): DeploymentProgressResponse {
    const state = this.readState();
    const job = state?.deployments.find(item => item.deploymentId === deploymentId);
    if (!state || !job) return { accepted: false };
    const now = Date.now();
    const previous = this.ctx.storage.sql.exec<{ command_json: string }>(
      'SELECT command_json FROM deployment_callbacks WHERE deployment_id = ? AND phase = ?', deploymentId, update.phase,
    ).toArray()[0];
    const sequence = Math.max(job.progressSeq + 1, update.progressSeq);
    const command: WorldCommand = previous ? JSON.parse(previous.command_json) as WorldCommand : update.phase === 'authorizePublication'
      ? { kind: 'authorizeDeploymentPublication', deploymentId, progressSeq: sequence, requestId: `deploy:${deploymentId}:authorize` }
      : {
          kind: 'updateDeployment', deploymentId, progressSeq: sequence,
          status: update.phase === 'deployed' ? 'succeeded' : update.phase === 'failed' ? 'failed'
            : update.phase === 'uncertain' ? 'uncertain' : 'running',
          ...(update.providerVersionId ? { providerVersionId: update.providerVersionId } : {}),
          ...(update.url ? { url: update.url } : {}),
          ...(update.failure ? { failure: update.failure } : {}),
          requestId: `deploy:${deploymentId}:${update.phase}`,
        };
    if (previous && command.kind === 'updateDeployment' && update.providerVersionId
      && command.providerVersionId !== update.providerVersionId) return { accepted: false };
    // Persist the deterministic callback before applying it, including across a crash between the two writes.
    if (!previous) this.ctx.storage.sql.exec(
      'INSERT INTO deployment_callbacks (deployment_id, phase, command_json) VALUES (?, ?, ?)',
      deploymentId, update.phase, JSON.stringify(command),
    );
    const response = this.executeWithPrincipal('system', {
      principalId: 'platform:deployment', role: 'system', worldId: state.worldId,
      operations: [command.kind], expiresAtMs: now + 60_000,
    }, now, command);
    return { accepted: response.status === 'ok', ...(update.phase === 'authorizePublication'
      ? { publicationAuthorized: response.status === 'ok' } : {}) };
  }

  recordDeploymentObservation(deploymentId: string, observation: DeploymentObservation): WorldCommandResponse {
    const state = this.readState();
    const now = Date.now();
    const command: WorldCommand = {
      kind: 'recordRuntimeObservation', deploymentId, healthy: observation.healthy,
      summary: `${observation.surface}: ${observation.summary}`,
      requestId: `observe:${deploymentId}:${observation.surface}:${observation.observedAtMs}`,
    };
    return this.executeWithPrincipal('system', {
      principalId: 'platform:deployment', role: 'system', worldId: state?.worldId ?? '',
      operations: [command.kind], expiresAtMs: now + 60_000,
    }, now, command);
  }

  execute(actor: Actor, nowMs: number, command: WorldCommand): WorldCommandResponse {
    return this.apply(actor, nowMs, command);
  }

  executeWithPrincipal(actor: Actor, principal: PrincipalContext, nowMs: number, command: WorldCommand): WorldCommandResponse {
    return this.apply(actor, nowMs, command, principal);
  }

  previewWithPrincipal(actor: Actor, principal: PrincipalContext, nowMs: number, command: WorldCommand): WorldCommandResponse {
    return JSON.parse(world_command(JSON.stringify({
      apiVersion: 1, state: this.readState(), actor, principal, nowMs, command,
    }))) as WorldCommandResponse;
  }

  private apply(actor: Actor, nowMs: number, command: WorldCommand, principal?: PrincipalContext): WorldCommandResponse {
    const current = this.readState();
    const response = JSON.parse(world_command(JSON.stringify({
      apiVersion: 1,
      state: current,
      actor,
      nowMs,
      command,
      ...(principal ? { principal } : {}),
    }))) as WorldCommandResponse;
    if (response.status === 'error') return response;
    let revision: WorldSnapshot | undefined;
    if (response.result.kind === 'worldCreated' || response.result.kind === 'hostedWorldCreated') {
      revision = response.state.desired;
    } else if (response.result.kind === 'candidatePromoted') {
      revision = canonicalProjection(
        response.state,
        response.result.candidateId,
        response.result.revisionId,
      );
    }
    this.ctx.storage.transactionSync(() => {
      this.ctx.storage.sql.exec(
        `INSERT INTO authority_state (singleton, state_json) VALUES (1, ?)
         ON CONFLICT(singleton) DO UPDATE SET state_json = excluded.state_json`,
        JSON.stringify(response.state),
      );
      if (revision) {
        this.ctx.storage.sql.exec(
          'INSERT OR IGNORE INTO revisions (revision_id, snapshot_json) VALUES (?, ?)',
          revision.revisionId,
          JSON.stringify(revision),
        );
      }
    });
    return response;
  }
}

type SummaryRow = {
  world_id: string;
  title: string;
  head_revision_id: string;
  desired_revision_id: string;
};

export class LocalWorldDirectory extends DurableObject<LocalEnv> {
  constructor(ctx: DurableObjectState, env: LocalEnv) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS worlds (
        world_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        head_revision_id TEXT NOT NULL,
        desired_revision_id TEXT NOT NULL
      );
    `);
  }

  async saveOAuthReturnPath(state: string, path: string): Promise<void> {
    await this.ctx.storage.put(`oauth:${state}`, { path, expiresAtMs: Date.now() + 600_000 });
  }

  async consumeOAuthReturnPath(state: string): Promise<string | null> {
    const key = `oauth:${state}`;
    const value = await this.ctx.storage.get<{ path: string; expiresAtMs: number }>(key);
    await this.ctx.storage.delete(key);
    return value && value.expiresAtMs > Date.now() ? value.path : null;
  }

  upsert(world: WorldSummary): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO worlds (world_id, title, head_revision_id, desired_revision_id)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(world_id) DO UPDATE SET
         title = excluded.title,
         head_revision_id = excluded.head_revision_id,
         desired_revision_id = excluded.desired_revision_id`,
      world.worldId,
      world.title,
      world.headRevisionId,
      world.desiredRevisionId,
    );
  }

  list(): WorldSummary[] {
    return this.ctx.storage.sql
      .exec<SummaryRow>(
        `SELECT world_id, title, head_revision_id, desired_revision_id
         FROM worlds ORDER BY world_id LIMIT 64`,
      )
      .toArray()
      .map((row) => ({
        worldId: row.world_id,
        title: row.title,
        headRevisionId: row.head_revision_id,
        desiredRevisionId: row.desired_revision_id,
      }));
  }
}
