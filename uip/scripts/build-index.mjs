#!/usr/bin/env node
// Regenerates public/projects/index.json (ProjectSummary[]) from every public/projects/*.graph.json.
// Usage: node scripts/build-index.mjs        (reads kinds/spaces/needs from lfp/src/kernel.ts)
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'public/projects');
const { KINDS, SPACES } = await import(join(ROOT, '../lfp/src/kernel.ts'));
const kindById = new Map(KINDS.map((k) => [k.id, k]));
const spaceIds = SPACES.map((s) => s.id);

// Fixed, staggered timestamps so the build is deterministic. Unknown projects step back a day each.
const UPDATED = { bropilot: '2026-10-04T09:12:00Z', ledgerly: '2026-10-03T16:40:00Z', tidepool: '2026-09-30T11:05:00Z' };
const ORDER = ['bropilot', 'ledgerly', 'tidepool'];

const files = readdirSync(DIR).filter((f) => f.endsWith('.graph.json'));
const ids = files.map((f) => f.replace('.graph.json', ''))
  .sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b));

const summaries = ids.map((id, i) => {
  const g = JSON.parse(readFileSync(join(DIR, `${id}.graph.json`), 'utf8'));
  const one = (kind) => g.nodes.find((n) => n.kind === kind)?.title ?? '';
  const counts = Object.fromEntries(spaceIds.map((s) => [s, 0]));
  for (const n of g.nodes) { const s = kindById.get(n.kind)?.space; if (s in counts) counts[s]++; }
  let unmet = 0;
  for (const n of g.nodes) for (const need of kindById.get(n.kind)?.needs ?? []) {
    const c = g.edges.filter((e) => e.type === need.edge && (need.dir === 'out' ? e.src === n.id : e.dst === n.id)).length;
    if (c < (need.min ?? 1)) unmet++;
  }
  const kindOf = new Map(g.nodes.map((n) => [n.id, n.kind]));
  const unlinkedFlows = g.nodes.filter((n) => n.kind === 'flow' &&
    !g.edges.some((e) => e.type === 'uses' && e.src === n.id && kindOf.get(e.dst) === 'screen')).length;
  return {
    id, name: one('name') || id, purpose: one('purpose'), summary: one('summary'),
    counts, nodeCount: g.nodes.length, edgeCount: g.edges.length, openCount: unmet + unlinkedFlows,
    updatedAt: UPDATED[id] ?? new Date(Date.UTC(2026, 8, 29 - i, 10)).toISOString().replace('.000', ''),
  };
});
writeFileSync(join(DIR, 'index.json'), JSON.stringify(summaries, null, 2) + '\n');
for (const s of summaries) console.log(`${s.id.padEnd(9)} nodes ${s.nodeCount} edges ${s.edgeCount} open ${s.openCount}  ${s.name}`);
if (!ids.includes('bropilot')) console.log('note: bropilot.graph.json not present yet; rerun after WP1 writes it');
