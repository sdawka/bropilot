// Project list + graph loading. store=static reads bundled /projects/*.json; store=artifacts asks the Worker.
import { defineStore } from 'pinia';
import { ref } from 'vue';
import { flags } from '../flags';
import type { Graph, PerspId, ProjectSummary, Timeline } from '../types';

const LAST = (id: string) => `uip.last.${id}`;
export type LastFocus = { persp: PerspId; path: string[] };

export function readLastFocus(id: string): LastFocus | undefined {
  try { const v = JSON.parse(localStorage.getItem(LAST(id)) ?? 'null'); return v && v.persp && Array.isArray(v.path) ? v : undefined; } catch { return undefined; }
}
export function writeLastFocus(id: string, lf: LastFocus) {
  try { localStorage.setItem(LAST(id), JSON.stringify(lf)); } catch {}
}

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json() as Promise<T>;
}
const api = () => flags.store === 'artifacts';

export const useProjects = defineStore('projects', () => {
  const list = ref<ProjectSummary[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const graphs = new Map<string, Promise<Graph>>();
  const timelines = new Map<string, Promise<Timeline | null>>();

  async function load(force = false) {
    if (list.value.length && !force) return list.value;
    loading.value = true; error.value = null;
    try {
      let rows: ProjectSummary[];
      try { rows = await getJson<ProjectSummary[]>(api() ? '/api/projects' : '/projects/index.json'); }
      catch (e) { if (!api()) throw e; rows = await getJson<ProjectSummary[]>('/projects/index.json'); error.value = 'Worker unavailable, showing bundled projects'; }
      list.value = rows.map((p) => ({ ...p, lastFocus: readLastFocus(p.id) ?? p.lastFocus }));
    } catch (e) { error.value = String(e); }
    finally { loading.value = false; }
    return list.value;
  }
  function graph(id: string): Promise<Graph> {
    if (!graphs.has(id)) {
      const p = (api() ? getJson<Graph>(`/api/projects/${id}/graph`).catch(() => getJson<Graph>(`/projects/${id}.graph.json`)) : getJson<Graph>(`/projects/${id}.graph.json`));
      p.catch(() => graphs.delete(id));
      graphs.set(id, p);
    }
    return graphs.get(id)!;
  }
  function timeline(id: string): Promise<Timeline | null> {
    if (!timelines.has(id)) {
      const url = api() ? `/api/projects/${id}/timeline` : `/projects/${id}.timeline.json`;
      timelines.set(id, getJson<Timeline>(url).catch(() => getJson<Timeline>(`/projects/${id}.timeline.json`)).catch(() => null));
    }
    return timelines.get(id)!;
  }
  const byId = (id: string) => list.value.find((p) => p.id === id);
  function touch(id: string, lf: LastFocus) {
    writeLastFocus(id, lf);
    const p = byId(id); if (p) p.lastFocus = lf;
  }
  return { list, loading, error, load, graph, timeline, byId, touch };
});
