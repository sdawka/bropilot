import { DurableObject } from 'cloudflare:workers';
import type {
  Actor,
  Candidate,
  WorldCommand,
  WorldCommandResponse,
  WorldSnapshot,
  WorldState,
} from '@bropilot/contracts';
import { world_command } from '../../../packages/core-wasm/bropilot_core_wasm.js';

export type LocalEnv = Omit<Env, 'LOCAL_WORKSPACE'> & {
  WORLD_AUTHORITY: DurableObjectNamespace<WorldAuthority>;
  LOCAL_WORLD_DIRECTORY: DurableObjectNamespace<LocalWorldDirectory>;
  LOCAL_WORKSPACE?: string;
  LOCAL_OWNER_TOKEN?: string;
  LOCAL_IMPLEMENTER_TOKEN?: string;
  LOCAL_VERIFIER_TOKEN?: string;
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
    };
  }

  execute(actor: Actor, nowMs: number, command: WorldCommand): WorldCommandResponse {
    const current = this.readState();
    const response = JSON.parse(world_command(JSON.stringify({
      apiVersion: 1,
      state: current,
      actor,
      nowMs,
      command,
    }))) as WorldCommandResponse;
    if (response.status === 'error') return response;
    let revision: WorldSnapshot | undefined;
    if (response.result.kind === 'worldCreated') {
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
