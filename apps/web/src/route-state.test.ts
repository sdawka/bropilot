import { describe, expect, it } from 'vitest';
import { readRouteState, routeQuery } from './route-state';

describe('routeQuery', () => {
  it('preserves map representation while changing selected objects', () => {
    expect(routeQuery({ selected: 'thing-1', path: 'world/thing-1', lens: 'risk', mapMode: 'text' })).toEqual({ selected: 'thing-1', path: 'world/thing-1', lens: 'risk', map: 'text' });
  });

  it('defaults to the visual map and accepts only supported representations', () => {
    const route = { params: { worldId: 'world', revisionId: 'rev', view: 'map' }, query: {} };
    const read = (query: Record<string, string>) => readRouteState({ ...route, query });
    expect(read({}).mapMode).toBe('visual');
    expect(read({ map: 'text' }).mapMode).toBe('text');
    expect(read({ map: 'invalid' }).mapMode).toBe('visual');
  });
  it('keeps only meaningful pinned context', () => {
    expect(routeQuery({ selected: 'thing-1', path: 'world/thing-1', lens: 'risk' })).toEqual({ selected: 'thing-1', path: 'world/thing-1', lens: 'risk' });
    expect(routeQuery({ selected: undefined, path: undefined, lens: undefined })).toEqual({ selected: undefined, path: undefined, lens: undefined });
  });
});
