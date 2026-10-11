import type { CoreResponse, WorldCommand, WorldCommandResponse, WorldState } from '@bropilot/contracts';

export type WorkspaceResult = Extract<Extract<CoreResponse, { status: 'ok' }>['result'], { kind: 'workspace' }>;
export type WorkspaceLookup = { kind: 'workspace'; workspace: WorkspaceResult } | { kind: 'unavailable' };

export interface WorldApi {
  getWorkspace(worldId: string, revisionId: string): Promise<WorkspaceLookup>;
}
export type Example = { worldId: string; revisionId: string; title: string; scenario: string };
export type WorldSummary = { worldId: string; title: string; headRevisionId: string; desiredRevisionId: string };
export type Session = { enabled: boolean; mode: 'local' | 'hosted' | 'example'; principalId?: string };
export type CloudflareConnection = { connectionId: string; accountId?: string; accountName?: string; status: string; expiresAtMs?: number };
export type SourceReconciliation = { revisionId: string; status: 'pending' | 'current' };
export type WorldWithMetadata = { state: WorldState; sourceReconciliation: SourceReconciliation | null };

export class WorldApiError extends Error {
  constructor(message: string, readonly code?: string, readonly status?: number) { super(message); }
}

export const liveWorldApi: WorldApi = {
  async getWorkspace(worldId, revisionId) {
    const response = await fetch(`/api/v1/worlds/${encodeURIComponent(worldId)}/revisions/${encodeURIComponent(revisionId)}`);
    if (response.status === 404) return { kind: 'unavailable' };
    if (!response.ok) throw new WorldApiError(`The World service returned ${response.status}.`);
    const body = await response.json() as CoreResponse;
    if (body.status === 'error') throw new WorldApiError(body.message, body.code);
    if (body.apiVersion !== 1 || body.result.kind !== 'workspace') throw new WorldApiError('The World service returned an unexpected response.');
    return { kind: 'workspace', workspace: body.result };
  },
};

export async function getExamples(): Promise<Example[]> {
  const response = await fetch('/api/v1/examples');
  if (!response.ok) throw new WorldApiError(`The example catalog returned ${response.status}.`);
  return await response.json() as Example[];
}
async function localFetch(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: 'same-origin', ...init });
  if (!response.ok) {
    let body: { message?: unknown; code?: unknown } | undefined;
    try { body = await response.clone().json() as { message?: unknown; code?: unknown }; } catch { /* non-JSON transport error */ }
    const message = typeof body?.message === 'string' ? body.message : `The World service returned ${response.status}.`;
    throw new WorldApiError(message, typeof body?.code === 'string' ? body.code : undefined, response.status);
  }
  return response;
}
export async function startLocalSession() { return (await localFetch('/api/v1/local/session')).json() as Promise<{ enabled: boolean }>; }
export async function getSession() { return (await localFetch('/api/v1/session')).json() as Promise<Session>; }
export async function getLocalWorlds() { return ((await localFetch('/api/v1/worlds')).json() as Promise<{ worlds: WorldSummary[] }>).then((body) => body.worlds); }
export async function getWorldWithMetadata(worldId: string) { return (await localFetch(`/api/v1/worlds/${encodeURIComponent(worldId)}`)).json() as Promise<WorldWithMetadata>; }
export async function getLocalWorld(worldId: string) { return (await getWorldWithMetadata(worldId)).state; }
export async function reconcileWorldSource(worldId: string) {
  return (await localFetch(`/api/v1/worlds/${encodeURIComponent(worldId)}/source-reconciliation`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json() as Promise<WorldWithMetadata>;
}
export async function sendWorldCommand(worldId: string, command: WorldCommand) {
  const response = await localFetch(`/api/v1/worlds/${encodeURIComponent(worldId)}/commands`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command) });
  const body = await response.json() as WorldCommandResponse;
  if (body.status === 'error') throw new WorldApiError(body.message, body.code);
  return body;
}
export async function getLocalKit() { return (await localFetch('/api/v1/local-kit')).json() as Promise<{ sources: { working: { files: Record<string, string> }; brokenHealth: { files: Record<string, string> } }; runnerHash: string; runnerRef: string }>; }
export async function getCloudflareConnection() {
  return ((await localFetch('/api/v1/cloudflare/connections')).json() as Promise<{ connection?: CloudflareConnection }>).then(body => body.connection);
}
export async function startCloudflareConnection(returnTo: string) {
  return (await localFetch('/api/v1/cloudflare/connections/start', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ returnTo }) })).json() as Promise<{ authorizationUrl: string }>;
}
export async function selectCloudflareAccount(accountId: string) {
  return (await localFetch('/api/v1/cloudflare/connections/account', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountId }) })).json() as Promise<{ connection: CloudflareConnection }>;
}
export async function disconnectCloudflareConnection() {
  await localFetch('/api/v1/cloudflare/connections', { method: 'DELETE' });
}
export async function createDeploymentTarget(worldId: string) {
  return ((await localFetch(`/api/v1/worlds/${encodeURIComponent(worldId)}/deployment-target`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json() as Promise<{ target: unknown }>).then(body => body.target);
}
export async function resumeDeployment(worldId: string, deploymentId: string) {
  return (await localFetch(`/api/v1/worlds/${encodeURIComponent(worldId)}/deployments/${encodeURIComponent(deploymentId)}/resume`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json() as Promise<{ status: string }>;
}

/** Explicit test-only adapter: callers decide which pinned responses are present. */
export function createFixtureWorldApi(fixtures: Record<string, WorkspaceResult>): WorldApi {
  return { async getWorkspace(worldId, revisionId) { return fixtures[`${worldId}/${revisionId}`] ? { kind: 'workspace', workspace: fixtures[`${worldId}/${revisionId}`] } : { kind: 'unavailable' }; } };
}
