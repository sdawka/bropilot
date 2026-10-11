import type { LocationQueryRaw, RouteLocationNormalizedLoaded } from 'vue-router';
import type { WorkspaceView } from './router';

export type RouteState = { worldId: string; revisionId: string; view: WorkspaceView; mapMode?: 'visual' | 'text'; selected?: string; path?: string; lens?: string; compareRevisionId?: string };

export function readRouteState(route: Pick<RouteLocationNormalizedLoaded, 'params' | 'query'>): RouteState {
  return {
    worldId: String(route.params.worldId), revisionId: String(route.params.revisionId), view: (route.params.view ?? 'overview') as WorkspaceView,
    selected: typeof route.query.selected === 'string' ? route.query.selected : undefined,
    path: typeof route.query.path === 'string' ? route.query.path : undefined,
    mapMode: route.query.map === 'text' ? 'text' : 'visual',
    lens: typeof route.query.lens === 'string' ? route.query.lens : undefined,
    compareRevisionId: typeof route.query.compare === 'string' ? route.query.compare : undefined,
  };
}

export function routeQuery(state: Pick<RouteState, 'selected' | 'path' | 'lens' | 'mapMode' | 'compareRevisionId'>): LocationQueryRaw {
  return { ...(state.compareRevisionId ? { compare: state.compareRevisionId } : {}), selected: state.selected || undefined, path: state.path || undefined, lens: state.lens || undefined, ...(state.mapMode ? { map: state.mapMode } : {}) };
}
