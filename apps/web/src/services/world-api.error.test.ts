import { afterEach, expect, it, vi } from 'vitest';
import { createDeploymentTarget, getCloudflareConnection, getWorldWithMetadata, reconcileWorldSource, resumeDeployment, sendWorldCommand, startCloudflareConnection, WorldApiError } from './world-api';

afterEach(() => vi.unstubAllGlobals());

it('preserves a structured command error from the local service', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'error', apiVersion: 1, code: 'base_mismatch', message: 'Candidate base is stale.' }), { status: 409, headers: { 'content-type': 'application/json' } })));
  await expect(sendWorldCommand('world', { kind: 'promote', candidateId: 'candidate', expectedHeadRevisionId: 'old', requestId: 'request' })).rejects.toMatchObject({ message: 'Candidate base is stale.', code: 'base_mismatch', status: 409 });
});

it('sends deployment target requests without accepting a user-provided worker name', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ target: { targetId: 'target-1', workerName: 'derived-worker' } }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  await expect(createDeploymentTarget('world-1')).resolves.toEqual({ targetId: 'target-1', workerName: 'derived-worker' });
  expect(fetch).toHaveBeenCalledWith('/api/v1/worlds/world-1/deployment-target', expect.objectContaining({ method: 'POST', body: '{}' }));
});

it('submits exactly one selected Cloudflare account id', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ connection: { connectionId: 'connection-1', status: 'connected' } }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  const { selectCloudflareAccount } = await import('./world-api');
  await selectCloudflareAccount('a'.repeat(32));
  expect(fetch).toHaveBeenCalledWith('/api/v1/cloudflare/connections/account', expect.objectContaining({ body: JSON.stringify({ accountId: 'a'.repeat(32) }) }));
});

it('preserves retryable Cloudflare connection errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'reconnect_required', message: 'Reconnect Cloudflare and try again.' }), { status: 409, headers: { 'content-type': 'application/json' } })));
  await expect(getCloudflareConnection()).rejects.toMatchObject({ code: 'reconnect_required', message: 'Reconnect Cloudflare and try again.' });
});

it('preserves the same-origin route through Cloudflare authorization', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ authorizationUrl: 'https://dash.cloudflare.com/oauth' }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  await startCloudflareConnection('/worlds/world-1/revisions/revision-1/overview?selected=thing-1');
  expect(fetch).toHaveBeenCalledWith('/api/v1/cloudflare/connections/start', expect.objectContaining({ body: JSON.stringify({ returnTo: '/worlds/world-1/revisions/revision-1/overview?selected=thing-1' }) }));
});

it('resumes a pending deployment at its world-scoped endpoint', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok' }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  await resumeDeployment('world-1', 'deployment-1');
  expect(fetch).toHaveBeenCalledWith('/api/v1/worlds/world-1/deployments/deployment-1/resume', expect.objectContaining({ method: 'POST', body: '{}' }));
});

it('reads the durable source reconciliation marker with hosted World state', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ state: { worldId: 'world-1' }, sourceReconciliation: { revisionId: 'revision-1', status: 'pending' } }), { status: 200, headers: { 'content-type': 'application/json' } })));
  await expect(getWorldWithMetadata('world-1')).resolves.toMatchObject({ state: { worldId: 'world-1' }, sourceReconciliation: { revisionId: 'revision-1', status: 'pending' } });
});

it('retries source reconciliation through the world-scoped endpoint', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ state: { worldId: 'world-1' }, sourceReconciliation: { revisionId: 'revision-1', status: 'current' } }), { status: 200, headers: { 'content-type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  await reconcileWorldSource('world-1');
  expect(fetch).toHaveBeenCalledWith('/api/v1/worlds/world-1/source-reconciliation', expect.objectContaining({ method: 'POST', body: '{}' }));
});
