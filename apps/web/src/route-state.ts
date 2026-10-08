import type { LocationQueryRaw, RouteLocationNormalizedLoaded } from 'vue-router';
import type { WorkspaceView } from './router';

export type RouteState = { worldId: string; revisionId: string; view: WorkspaceView; selected?: string; path?: string; lens?: string };

export function readRouteState(route: RouteLocationNormalizedLoaded): RouteState {
  return {
    worldId: String(route.params.worldId), revisionId: String(route.params.revisionId), view: (route.params.view ?? 'overview') as WorkspaceView,
    selected: typeof route.query.selected === 'string' ? route.query.selected : undefined,
    path: typeof route.query.path === 'string' ? route.query.path : undefined,
    lens: typeof route.query.lens === 'string' ? route.query.lens : undefined,
  };
}

export function routeQuery(state: Pick<RouteState, 'selected' | 'path' | 'lens'>): LocationQueryRaw {
  return { selected: state.selected || undefined, path: state.path || undefined, lens: state.lens || undefined };
}
