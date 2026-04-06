import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getSpaceData,
  getMapSlot,
  getRecipe,
  getVersions,
  getKnowledge,
  extractVibe,
  createSnapshot,
  generatePlan,
  generateTasks,
} from './api';

// Mock connection module to control getConnection return values
vi.mock('./connection', () => ({
  getConnection: vi.fn(() => null),
}));

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

describe('GET helpers with parameters', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('getSpaceData encodes space name in URL', async () => {
    globalThis.fetch = mockFetchResponse({
      ok: true,
      data: { slots: ['basics', 'messy_detail'] },
    });

    const result = await getSpaceData('problem');
    expect(result).toEqual({ slots: ['basics', 'messy_detail'] });

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('/api/spaces/problem');
  });

  it('getSpaceData handles spaces with special characters', async () => {
    globalThis.fetch = mockFetchResponse({ ok: true, data: {} });

    await getSpaceData('my space/name');

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('/api/spaces/my%20space%2Fname');
  });

  it('getMapSlot encodes both space and slot parameters', async () => {
    globalThis.fetch = mockFetchResponse({
      ok: true,
      data: { content: 'yaml data' },
    });

    const result = await getMapSlot('solution', 'vocabulary');
    expect(result).toEqual({ content: 'yaml data' });

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('/api/map/solution/vocabulary');
  });

  it('getRecipe calls /api/recipe', async () => {
    globalThis.fetch = mockFetchResponse({
      ok: true,
      data: { name: 'webapp', steps: 8 },
    });

    const result = await getRecipe();
    expect(result).toEqual({ name: 'webapp', steps: 8 });

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('/api/recipe');
  });

  it('getVersions calls /api/versions', async () => {
    globalThis.fetch = mockFetchResponse({
      ok: true,
      data: { versions: ['v1', 'v2'] },
    });

    const result = await getVersions();
    expect(result).toEqual({ versions: ['v1', 'v2'] });

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('/api/versions');
  });

  it('getKnowledge calls /api/knowledge', async () => {
    globalThis.fetch = mockFetchResponse({
      ok: true,
      data: { glossary: {}, changelog: [] },
    });

    const result = await getKnowledge();
    expect(result).toEqual({ glossary: {}, changelog: [] });

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('/api/knowledge');
  });
});

describe('POST helpers - remaining coverage', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('extractVibe sends POST to /api/vibe/extract', async () => {
    globalThis.fetch = mockFetchResponse({
      ok: true,
      data: { vocabulary: ['term1'], entities: ['User'] },
    });

    const result = await extractVibe();
    expect(result).toEqual({ vocabulary: ['term1'], entities: ['User'] });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('/api/vibe/extract');
    expect(callArgs[1].method).toBe('POST');
  });

  it('createSnapshot sends POST to /api/snapshot', async () => {
    globalThis.fetch = mockFetchResponse({
      ok: true,
      data: { version: 'v3', created_at: '2025-01-01' },
    });

    const result = await createSnapshot();
    expect(result).toEqual({ version: 'v3', created_at: '2025-01-01' });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('/api/snapshot');
    expect(callArgs[1].method).toBe('POST');
  });

  it('generatePlan sends POST to /api/plan', async () => {
    globalThis.fetch = mockFetchResponse({
      ok: true,
      data: { changes: [{ type: 'add', path: 'lib/app.ex' }] },
    });

    const result = await generatePlan();
    expect(result).toEqual({ changes: [{ type: 'add', path: 'lib/app.ex' }] });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('/api/plan');
    expect(callArgs[1].method).toBe('POST');
  });

  it('generateTasks sends POST to /api/tasks', async () => {
    globalThis.fetch = mockFetchResponse({
      ok: true,
      data: { tasks: [{ id: 't1', title: 'Build user model' }] },
    });

    const result = await generateTasks();
    expect(result).toEqual({ tasks: [{ id: 't1', title: 'Build user model' }] });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toContain('/api/tasks');
    expect(callArgs[1].method).toBe('POST');
  });
});

describe('API error handling patterns', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns null for all GET helpers when API is unreachable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    expect(await getRecipe()).toBeNull();
    expect(await getVersions()).toBeNull();
    expect(await getKnowledge()).toBeNull();
  });

  it('returns null for all POST helpers when API returns 500', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    });

    expect(await extractVibe()).toBeNull();
    expect(await createSnapshot()).toBeNull();
    expect(await generatePlan()).toBeNull();
    expect(await generateTasks()).toBeNull();
  });
});
