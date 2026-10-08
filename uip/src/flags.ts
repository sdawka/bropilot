import { reactive, watch } from 'vue';
export const FLAGS = {
  nav: ['columns', 'focus', 'twin', 'canvas', 'outline'], waypoints: ['explicit', 'collapse'],
  persp: ['curated', 'derived', 'raw'], edgeGroup: ['verb', 'kind', 'lens'], gaps: ['inline', 'lane', 'off'],
  s1: ['act', 'preview', 'ask'], chat: ['sidebar', 'palette'], agents: ['inline', 'tab'],
  thread: ['project', 'node'], proposal: ['thread', 'canvas'], picker: ['fingerprint', 'readme', 'ask'],
  store: ['static', 'artifacts'],
  checks: ['lazy', 'eager', 'off'], verdictStyle: ['dots', 'words', 'hidden'],
  repairMode: ['thread', 'inline'], checkModel: ['flash', 'escalate', 'clef'],
} as const;
export type FlagId = keyof typeof FLAGS;
export type Flags = { -readonly [K in FlagId]: (typeof FLAGS)[K][number] };
const KEY = 'uip.flags';
const defaults = (): Flags => Object.fromEntries(Object.entries(FLAGS).map(([k, v]) => [k, v[0]])) as Flags;
const valid = (k: string, v: string): k is FlagId => k in FLAGS && (FLAGS as any)[k].includes(v);
function parse(src: string | null): Partial<Flags> {
  const out: Record<string, string> = {};
  for (const pair of (src ?? '').split(',')) { const [k, v] = pair.split(':'); if (k && v && valid(k, v)) out[k] = v; }
  return out as Partial<Flags>;
}
function load(): Flags {
  let stored: Partial<Flags> = {};
  try { stored = JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch {}
  const url = parse(new URLSearchParams(location.search).get('ff'));
  return { ...defaults(), ...stored, ...url };
}
export const flags = reactive<Flags>(load());
watch(flags, (f) => {
  try { localStorage.setItem(KEY, JSON.stringify(f)); } catch {}
  const d = defaults(); const ff = (Object.keys(f) as FlagId[]).filter((k) => f[k] !== d[k]).map((k) => `${k}:${f[k]}`).join(',');
  const u = new URL(location.href); ff ? u.searchParams.set('ff', ff) : u.searchParams.delete('ff');
  history.replaceState(history.state, '', u);
}, { deep: true });
export const useFlags = () => flags;
