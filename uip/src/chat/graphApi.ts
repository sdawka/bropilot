// WP2 reads WP1's store only through GraphApi (SPEC §10). A Pinia setup store unwraps refs, a plain
// composable does not; this adapter accepts either and always hands back real Refs.
import { computed, isRef, toRef, type Ref } from 'vue';
import { useGraph } from '../store/graph';
import type { GraphApi } from '../types';

let cached: GraphApi | null = null;

export function useGraphApi(): GraphApi {
  if (cached) return cached;
  const s = useGraph() as any;
  const ref = <T,>(k: string): Ref<T> => (isRef(s[k]) ? s[k] : toRef(s, k)) as Ref<T>;
  const sel = isRef(s.selection) ? s.selection : computed(() => s.selection);
  cached = {
    project: ref('project'), graph: ref('graph'), view: ref('view'), ghost: ref('ghost'),
    selection: sel,
    get perspectives() { return isRef(s.perspectives) ? s.perspectives.value : s.perspectives; },
    byId: (id) => s.byId(id), neighbours: (id) => s.neighbours(id), resolvePath: (p, id) => s.resolvePath(p, id),
    dispatch: (c) => s.dispatch(c), undo: () => s.undo(), applyEffects: (e, st) => s.applyEffects(e, st),
    openGap: (k, p, q) => s.openGap(k, p, q), onGap: (cb) => s.onGap(cb),
  };
  // let WP1's changeset views (Changes.vue, ghost lookup) read the timeline's live list
  return cached;
}
/** WP1's optional hook: its changeset list becomes a view over ours. */
export function provideChangesets(getter: () => import('../types').Changeset[]) {
  const s = useGraph() as any;
  if (typeof s.provideChangesets === 'function') s.provideChangesets(getter);
}
