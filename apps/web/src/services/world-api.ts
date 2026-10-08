import type { CoreResponse } from '@bropilot/contracts';

export type WorkspaceResult = Extract<Extract<CoreResponse, { status: 'ok' }>['result'], { kind: 'workspace' }>;
export type WorkspaceLookup = { kind: 'workspace'; workspace: WorkspaceResult } | { kind: 'unavailable' };

export interface WorldApi {
  getWorkspace(worldId: string, revisionId: string): Promise<WorkspaceLookup>;
}
export type Example = { worldId: string; revisionId: string; title: string; scenario: string };

export class WorldApiError extends Error {
  constructor(message: string, readonly code?: string) { super(message); }
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

/** Explicit test-only adapter: callers decide which pinned responses are present. */
export function createFixtureWorldApi(fixtures: Record<string, WorkspaceResult>): WorldApi {
  return { async getWorkspace(worldId, revisionId) { return fixtures[`${worldId}/${revisionId}`] ? { kind: 'workspace', workspace: fixtures[`${worldId}/${revisionId}`] } : { kind: 'unavailable' }; } };
}
