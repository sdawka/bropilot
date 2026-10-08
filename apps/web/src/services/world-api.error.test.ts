import { afterEach, expect, it, vi } from 'vitest';
import { sendWorldCommand, WorldApiError } from './world-api';

afterEach(() => vi.unstubAllGlobals());

it('preserves a structured command error from the local service', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'error', apiVersion: 1, code: 'base_mismatch', message: 'Candidate base is stale.' }), { status: 409, headers: { 'content-type': 'application/json' } })));
  await expect(sendWorldCommand('world', { kind: 'promote', candidateId: 'candidate', expectedHeadRevisionId: 'old', requestId: 'request' })).rejects.toMatchObject({ message: 'Candidate base is stale.', code: 'base_mismatch' });
});
