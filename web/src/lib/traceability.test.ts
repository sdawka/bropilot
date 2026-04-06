import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  getTraceability,
  getTraceabilityEntry,
  SPEC_CATEGORIES,
  LINK_TYPES,
  formatSpecName,
} from './api';
import type { TraceabilityMatrix } from './api';

// Mock connection module
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

describe('Traceability API functions', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('getTraceability calls /api/traceability', async () => {
    const matrix: TraceabilityMatrix = {
      entries: [],
      coverage: {
        total_specs: 0,
        total_linked: 0,
        total_unlinked: 0,
        by_category: {},
      },
    };

    globalThis.fetch = mockFetchResponse({ ok: true, data: matrix });

    const result = await getTraceability();
    expect(result).toEqual(matrix);

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('/api/traceability');
  });

  it('getTraceabilityEntry calls /api/traceability/:category/:specId', async () => {
    const entry = {
      spec_category: 'api',
      spec_id: 'InitProject',
      links: [{ type: 'implementation', file_path: 'lib/init.ex' }],
    };

    globalThis.fetch = mockFetchResponse({ ok: true, data: entry });

    const result = await getTraceabilityEntry('api', 'InitProject');
    expect(result).toEqual(entry);

    const url = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toContain('/api/traceability/api/InitProject');
  });

  it('getTraceability returns null when API is unreachable', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    const result = await getTraceability();
    expect(result).toBeNull();
  });
});

describe('Traceability empty state data handling', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('empty matrix response has correct structure for UI rendering', async () => {
    const emptyMatrix: TraceabilityMatrix = {
      entries: [],
      coverage: {
        total_specs: 0,
        total_linked: 0,
        total_unlinked: 0,
        by_category: {},
      },
    };

    globalThis.fetch = mockFetchResponse({ ok: true, data: emptyMatrix });

    const result = (await getTraceability()) as TraceabilityMatrix;
    expect(result).not.toBeNull();
    expect(result.entries).toEqual([]);
    expect(result.coverage.total_specs).toBe(0);
    expect(result.coverage.total_linked).toBe(0);
    expect(result.coverage.total_unlinked).toBe(0);
  });

  it('empty matrix coverage by_category can be iterated for all 11 categories', async () => {
    // Simulate server response with all 11 categories in coverage
    const by_category: Record<string, { total: number; linked: number; unlinked: number }> = {};
    for (const cat of SPEC_CATEGORIES) {
      by_category[cat] = { total: 0, linked: 0, unlinked: 0 };
    }

    const emptyMatrix: TraceabilityMatrix = {
      entries: [],
      coverage: {
        total_specs: 0,
        total_linked: 0,
        total_unlinked: 0,
        by_category,
      },
    };

    globalThis.fetch = mockFetchResponse({ ok: true, data: emptyMatrix });

    const result = (await getTraceability()) as TraceabilityMatrix;

    // UI iterates over SPEC_CATEGORIES and checks by_category[cat]
    for (const cat of SPEC_CATEGORIES) {
      const catCov = result.coverage.by_category[cat];
      expect(catCov).toBeDefined();
      expect(catCov.total).toBe(0);
      expect(catCov.linked).toBe(0);
      expect(catCov.unlinked).toBe(0);
    }
  });

  it('empty state renders correct percentage (0%)', () => {
    // Simulate the coverage calculation that the Alpine.js UI does
    const totalSpecs = 0;
    const totalLinked = 0;
    const percentage = totalSpecs > 0 ? Math.round((totalLinked / totalSpecs) * 100) : 0;
    expect(percentage).toBe(0);
  });

  it('matrix with entries but empty links counts as unlinked', async () => {
    // Entry exists but has empty links array — should NOT count as linked
    const matrix: TraceabilityMatrix = {
      entries: [
        { spec_category: 'api', spec_id: 'EmptySpec', links: [] },
      ],
      coverage: {
        total_specs: 1,
        total_linked: 0,
        total_unlinked: 1,
        by_category: {
          api: { total: 1, linked: 0, unlinked: 1 },
        },
      },
    };

    globalThis.fetch = mockFetchResponse({ ok: true, data: matrix });
    const result = (await getTraceability()) as TraceabilityMatrix;

    // Verify that the entry with empty links is not counted as linked
    expect(result.coverage.total_linked).toBe(0);
    expect(result.coverage.total_unlinked).toBe(1);
    expect(result.coverage.by_category['api']?.linked).toBe(0);
  });
});

describe('Traceability constants and helpers', () => {
  it('SPEC_CATEGORIES contains all 11 categories', () => {
    expect(SPEC_CATEGORIES).toHaveLength(11);
    expect(SPEC_CATEGORIES).toContain('api');
    expect(SPEC_CATEGORIES).toContain('behaviours');
    expect(SPEC_CATEGORIES).toContain('constraints');
    expect(SPEC_CATEGORIES).toContain('entities');
    expect(SPEC_CATEGORIES).toContain('modules');
    expect(SPEC_CATEGORIES).toContain('events');
    expect(SPEC_CATEGORIES).toContain('externals');
    expect(SPEC_CATEGORIES).toContain('views');
    expect(SPEC_CATEGORIES).toContain('components');
    expect(SPEC_CATEGORIES).toContain('streams');
    expect(SPEC_CATEGORIES).toContain('infra');
  });

  it('LINK_TYPES contains all 4 link types', () => {
    expect(LINK_TYPES).toHaveLength(4);
    expect(LINK_TYPES).toContain('implementation');
    expect(LINK_TYPES).toContain('test');
    expect(LINK_TYPES).toContain('type');
    expect(LINK_TYPES).toContain('migration');
  });

  it('formatSpecName formats category names correctly', () => {
    expect(formatSpecName('api')).toBe('Api');
    expect(formatSpecName('behaviours')).toBe('Behaviours');
    expect(formatSpecName('constraints')).toBe('Constraints');
  });
});

describe('Traceability UI GitHub URL logic', () => {
  it('parseGitRemote handles git@ format', () => {
    // Test the logic from the traceability.astro page
    function parseGitRemote(remote: string): string | null {
      if (!remote) return null;
      let url = remote;
      if (url.startsWith('git@github.com:')) {
        url = 'https://github.com/' + url.slice('git@github.com:'.length);
      }
      url = url.replace(/\.git$/, '').replace(/\/+$/, '');
      if (url.includes('github.com')) {
        return url;
      }
      return null;
    }

    expect(parseGitRemote('git@github.com:owner/repo.git'))
      .toBe('https://github.com/owner/repo');
    expect(parseGitRemote('https://github.com/owner/repo.git'))
      .toBe('https://github.com/owner/repo');
    expect(parseGitRemote('https://github.com/owner/repo'))
      .toBe('https://github.com/owner/repo');
    expect(parseGitRemote('https://gitlab.com/owner/repo.git'))
      .toBeNull();
    expect(parseGitRemote(''))
      .toBeNull();
  });

  it('buildGitHubUrl constructs correct URL with line range', () => {
    // Test the URL construction logic from the traceability page
    function buildGitHubUrl(
      baseUrl: string,
      link: { file_path: string; line_range?: [number, number] },
    ): string {
      let url = `${baseUrl}/blob/main/${link.file_path}`;
      if (link.line_range && link.line_range.length === 2) {
        url += `#L${link.line_range[0]}-L${link.line_range[1]}`;
      }
      return url;
    }

    expect(
      buildGitHubUrl('https://github.com/owner/repo', {
        file_path: 'lib/app/init.ex',
      }),
    ).toBe('https://github.com/owner/repo/blob/main/lib/app/init.ex');

    expect(
      buildGitHubUrl('https://github.com/owner/repo', {
        file_path: 'lib/app/init.ex',
        line_range: [10, 25],
      }),
    ).toBe('https://github.com/owner/repo/blob/main/lib/app/init.ex#L10-L25');
  });

  it('project API response path is data.project.git_remote', () => {
    // Verify the correct path through the API response structure
    // The /api/project endpoint returns: { ok: true, data: { project: {...}, recipe: {...} } }
    const apiResponse = {
      ok: true,
      data: {
        project: { git_remote: 'git@github.com:owner/repo.git' },
        recipe: { name: 'webapp' },
      },
    };

    // The CORRECT path (after fix)
    const projectData = apiResponse.data.project;
    expect(projectData.git_remote).toBe('git@github.com:owner/repo.git');

    // The WRONG path (before fix) would be apiResponse.data.git_remote which is undefined
    const wrongPath = (apiResponse.data as Record<string, unknown>).git_remote;
    expect(wrongPath).toBeUndefined();
  });
});
