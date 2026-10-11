import { afterEach, expect, it, vi } from 'vitest';
import { analyzeChangeImpact } from './change-impact';

afterEach(() => vi.unstubAllGlobals());
it('sends an advisory typed request with cancellation to the analysis endpoint', async () => {
  const result = { report: {}, baselineSnapshot: {}, targetSnapshot: {} };
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(result), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const controller = new AbortController();
  const request = { baselineRevisionId: 'baseline', target: { kind: 'saved' as const, revisionId: 'target' } };
  expect(await analyzeChangeImpact('world/one', request, controller.signal)).toEqual(result);
  expect(fetchMock).toHaveBeenCalledWith('/api/v1/worlds/world%2Fone/analysis/change-impact', expect.objectContaining({ method: 'POST', body: JSON.stringify(request), signal: controller.signal }));
});
it('preserves endpoint diagnostics for invalid patches and unavailable pins', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'error', code: 'invalid_patch', message: 'Window start must precede end.' }), { status: 422 })));
  await expect(analyzeChangeImpact('world', { baselineRevisionId: 'baseline', target: { kind: 'hypothetical', patch: { operations: [] } } })).rejects.toMatchObject({ code: 'invalid_patch', message: 'Window start must precede end.', status: 422 });
});
