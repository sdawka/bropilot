import { describe, expect, it } from 'vitest';
import { createFixtureWorldApi, type WorkspaceResult } from './world-api';

describe('createFixtureWorldApi', () => {
  it('only resolves an explicitly injected pinned revision', async () => {
    const fixture = { kind: 'workspace', snapshot: { worldId: 'world', revisionId: 'r1' }, readiness: {} } as WorkspaceResult;
    const api = createFixtureWorldApi({ 'world/r1': fixture });
    expect(await api.getWorkspace('world', 'r1')).toEqual({ kind: 'workspace', workspace: fixture });
    expect(await api.getWorkspace('world', 'latest')).toEqual({ kind: 'unavailable' });
  });
});
