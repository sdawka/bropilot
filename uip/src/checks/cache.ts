// CHECKS-SPEC §3.4: results cached per sha1 of their literal inputs (localStorage, cap 3000, oldest `at`
// evicted). Editing a subject's words changes the inputs, so the cache misses by construction.
import type { CheckResult, CheckUnit } from './types';
import { CHECKS_VERSION } from './phrasing';

export const CACHE_CAP = 3000;
const cacheKey = (project: string) => `uip.checks.v1.${project}`;
const reviewedKey = (project: string) => `uip.checks.reviewed.${project}`;
const store = (): Storage | null => { try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; } };
function readJson<T>(key: string): T | null {
  try { const s = store()?.getItem(key); return s ? (JSON.parse(s) as T) : null; } catch { return null; }
}
function writeJson(key: string, v: unknown) { try { store()?.setItem(key, JSON.stringify(v)); } catch { /* quota / private mode */ } }

/** hex sha1 of `${checkId}\n${subjects}\n${JSON.stringify(questions)}\n${model}\n${CHECKS_VERSION}`. */
export async function hashUnit(unit: CheckUnit, model: string): Promise<string> {
  const src = `${unit.checkId}\n${unit.subjects.join(',')}\n${JSON.stringify(unit.questions)}\n${model}\n${CHECKS_VERSION}`;
  const buf = await globalThis.crypto.subtle.digest('SHA-1', new TextEncoder().encode(src));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function readCache(project: string): Record<string, CheckResult> {
  return readJson<Record<string, CheckResult>>(cacheKey(project)) ?? {};
}
/** Merge non-fake results into the project cache; keep the newest CACHE_CAP by `at`. */
export function writeCache(project: string, results: CheckResult[]): void {
  const cur = readCache(project);
  for (const r of results) if (!r.fake && r.hash) cur[r.hash] = r;
  let entries = Object.entries(cur);
  if (entries.length > CACHE_CAP) entries = entries.sort((a, b) => (a[1].at < b[1].at ? 1 : -1)).slice(0, CACHE_CAP);
  writeJson(cacheKey(project), Object.fromEntries(entries));
}

/** In-memory results without those whose subjects name a removed node or edge id. */
export function evictSubjects(results: Record<string, CheckResult>, removedIds: Iterable<string>): Record<string, CheckResult> {
  const gone = new Set<string>();
  for (const id of removedIds) { gone.add(id); gone.add(`edge:${id}`); }
  if (!gone.size) return results;
  return Object.fromEntries(Object.entries(results).filter(([, r]) => !r.subjects.some((s) => gone.has(s))));
}

/** `uip.checks.reviewed.<project>`: unitKey → the hash it was reviewed at. */
export const reviewed = {
  read: (project: string): Record<string, string> => readJson<Record<string, string>>(reviewedKey(project)) ?? {},
  write: (project: string, map: Record<string, string>) => writeJson(reviewedKey(project), map),
  mark(project: string, unitKey: string, hash: string) { const m = reviewed.read(project); m[unitKey] = hash; reviewed.write(project, m); },
};
