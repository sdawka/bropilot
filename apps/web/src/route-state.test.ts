import { describe, expect, it } from 'vitest';
import { routeQuery } from './route-state';

describe('routeQuery', () => {
  it('keeps only meaningful pinned context', () => {
    expect(routeQuery({ selected: 'thing-1', path: 'world/thing-1', lens: 'risk' })).toEqual({ selected: 'thing-1', path: 'world/thing-1', lens: 'risk' });
    expect(routeQuery({ selected: undefined, path: undefined, lens: undefined })).toEqual({ selected: undefined, path: undefined, lens: undefined });
  });
});
