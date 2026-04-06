import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchApi, pair, getProject, getSpaces, getPipelineStatus, startVibe, submitVibeInput, startBuild } from './api';

// Mock connection module to control getConnection return values
vi.mock('./connection', () => ({
  getConnection: vi.fn(() => null),
}));

import { getConnection } from './connection';
const mockedGetConnection = vi.mocked(getConnection);

/**
 * Helper: create a mock Response with JSON body.
 */
function mockFetchResponse(data: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => data,
  });
}

describe('fetchApi', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns data when API responds with ok: true', async () => {
    globalThis.fetch = mockFetchResponse({ ok: true, data: { name: 'test-project' } });

    const result = await fetchApi('/api/project');
    expect(result).toEqual({ name: 'test-project' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('/api/project');
  });

  it('returns null when API responds with ok: false', async () => {
    globalThis.fetch = mockFetchResponse({ ok: false, error: 'not found' });

    const result = await fetchApi('/api/missing');
    expect(result).toBeNull();
  });

  it('returns null when fetch throws (network error)', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

    const result = await fetchApi('/api/project');
    expect(result).toBeNull();
  });

  it('returns null when HTTP status is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    const result = await fetchApi('/api/project');
    expect(result).toBeNull();
  });

  it('includes Authorization header when connection has token', async () => {
    mockedGetConnection.mockReturnValue({
      serverUrl: 'http://localhost:4000',
      token: 'test-token-123',
      connectedAt: new Date().toISOString(),
    });

    globalThis.fetch = mockFetchResponse({ ok: true, data: {} });

    await fetchApi('/api/project');

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = callArgs[1]?.headers;
    expect(headers).toHaveProperty('Authorization', 'Bearer test-token-123');
  });

  it('uses connection serverUrl when available', async () => {
    mockedGetConnection.mockReturnValue({
      serverUrl: 'http://remote-server:5000',
      token: 'tok',
      connectedAt: new Date().toISOString(),
    });

    globalThis.fetch = mockFetchResponse({ ok: true, data: {} });

    await fetchApi('/api/project');

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toBe('http://remote-server:5000/api/project');
  });

  it('defaults to localhost:4000 when no connection is set', async () => {
    mockedGetConnection.mockReturnValue(null);

    globalThis.fetch = mockFetchResponse({ ok: true, data: {} });

    await fetchApi('/api/project');

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toBe('http://localhost:4000/api/project');
  });
});

describe('pair', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns data on successful pairing', async () => {
    globalThis.fetch = mockFetchResponse({
      ok: true,
      data: { project_name: 'my-app' },
    });

    const result = await pair('http://localhost:4000', 'falcon-1234');
    expect(result).toEqual({ project_name: 'my-app' });
  });

  it('sends POST with correct auth header and body', async () => {
    globalThis.fetch = mockFetchResponse({ ok: true, data: {} });

    await pair('http://example.com', 'my-token');

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toBe('http://example.com/api/pair');
    expect(callArgs[1].method).toBe('POST');
    expect(callArgs[1].headers['Authorization']).toBe('Bearer my-token');

    const body = JSON.parse(callArgs[1].body);
    expect(body).toEqual({ token: 'my-token' });
  });

  it('throws on HTTP error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
    });

    await expect(pair('http://localhost:4000', 'bad-token')).rejects.toThrow(
      'Pairing failed (401)',
    );
  });

  it('throws on invalid pairing response', async () => {
    globalThis.fetch = mockFetchResponse({ ok: false, error: 'invalid' });

    await expect(pair('http://localhost:4000', 'token')).rejects.toThrow(
      'Invalid pairing response',
    );
  });

  it('strips trailing slashes from server URL', async () => {
    globalThis.fetch = mockFetchResponse({ ok: true, data: {} });

    await pair('http://localhost:4000///', 'token');

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toBe('http://localhost:4000/api/pair');
  });
});

describe('GET helpers', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockedGetConnection.mockReturnValue(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('getProject calls /api/project', async () => {
    globalThis.fetch = mockFetchResponse({ ok: true, data: { name: 'demo' } });

    const result = await getProject();
    expect(result).toEqual({ name: 'demo' });

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('/api/project');
  });

  it('getSpaces calls /api/spaces', async () => {
    globalThis.fetch = mockFetchResponse({ ok: true, data: { spaces: ['problem'] } });

    const result = await getSpaces();
    expect(result).toEqual({ spaces: ['problem'] });

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('/api/spaces');
  });

  it('getPipelineStatus calls /api/pipeline/status', async () => {
    globalThis.fetch = mockFetchResponse({
      ok: true,
      data: { current_step: 3, completed: ['step1', 'step2'] },
    });

    const result = await getPipelineStatus();
    expect(result).toEqual({ current_step: 3, completed: ['step1', 'step2'] });

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('/api/pipeline/status');
  });
});

describe('POST helpers', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockedGetConnection.mockReturnValue(null);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('startVibe sends POST to /api/vibe/start', async () => {
    globalThis.fetch = mockFetchResponse({ ok: true, data: { prompt: 'Tell me about your app' } });

    const result = await startVibe();
    expect(result).toEqual({ prompt: 'Tell me about your app' });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('/api/vibe/start');
    expect(callArgs[1].method).toBe('POST');
  });

  it('submitVibeInput sends POST with text body', async () => {
    globalThis.fetch = mockFetchResponse({ ok: true, data: { received: true } });

    await submitVibeInput('My app manages tasks');

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('/api/vibe/input');
    expect(callArgs[1].method).toBe('POST');

    const body = JSON.parse(callArgs[1].body);
    expect(body).toEqual({ text: 'My app manages tasks' });
  });

  it('startBuild sends POST to /api/build', async () => {
    globalThis.fetch = mockFetchResponse({ ok: true, data: { version: 'v1' } });

    const result = await startBuild();
    expect(result).toEqual({ version: 'v1' });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('/api/build');
    expect(callArgs[1].method).toBe('POST');
  });
});
