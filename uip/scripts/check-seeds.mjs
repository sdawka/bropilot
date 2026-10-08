#!/usr/bin/env node
// Validates every public/projects/*.graph.json against lfp's kernel (KINDS, EDGE_TYPES from/to)
// and the §3 perspective chains. The only test in uip (SPEC §8).
// Usage: node scripts/check-seeds.mjs        (node >= 23.6 strips kernel.ts types natively)
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'public/projects');
const { KINDS, EDGE_TYPES } = await import(join(ROOT, '../lfp/src/kernel.ts'));
const STRICT = new Set(['ledgerly', 'tidepool']); // every hop must have >= 1 edge (exit 1 otherwise)

// §3 chains as data. Each hop: from kind, edge type, dir ('in' = walk dst->src); `to` = kinds of that step.
const H = (from, edge, dir, to) => ({ from, edge, dir, to });
const PERSPECTIVES = {
  user: [
    H('audience', 'has', 'out', ['usecase', 'problem']),
    H('usecase', 'satisfies', 'in', ['capability', 'feature']),
    H('problem', 'satisfies', 'in', ['capability', 'feature']),
    H('capability', 'implements', 'in', ['flow', 'screen']),
    H('feature', 'has', 'out', ['flow', 'screen']),
    H('flow', 'uses', 'out', ['screen', 'interface']),
    H('screen', 'uses', 'out', ['interface', 'thing']),
    H('interface', 'carries', 'out', ['interface', 'thing']),
  ],
  domain: [
    H('system', 'contains', 'out', ['module']),
    H('module', 'exposes', 'out', ['interface', 'screen']),
    H('interface', 'carries', 'out', ['thing', 'event']),
    H('interface', 'emits', 'out', ['thing', 'event']),
    H('thing', 'governs', 'in', ['rule']),
    H('rule', 'verifies', 'in', ['test']),
  ],
  intent: [
    H('purpose', 'motivates', 'out', ['outcome']),
    H('outcome', 'references', 'in', ['hypothesis', 'metric']),
    H('outcome', 'monitors', 'in', ['hypothesis', 'metric']),
    H('hypothesis', 'references', 'in', ['assumption', 'evidence', 'metric-reading']),
    H('hypothesis', 'supports', 'in', ['assumption', 'evidence', 'metric-reading']),
    H('hypothesis', 'refutes', 'in', ['assumption', 'evidence', 'metric-reading']),
    H('metric', 'measures', 'in', ['assumption', 'evidence', 'metric-reading']),
  ],
  delivery: [
    H('epic', 'contains', 'out', ['task']),
    H('task', 'targets', 'out', ['test']),
    H('test', 'reports', 'in', ['test-result', 'rule']),
    H('test', 'verifies', 'out', ['test-result', 'rule']),
  ],
  product: [
    H('capability', 'has', 'out', ['agent']),
    H('agent', 'implements', 'out', ['feature']),
    H('feature', 'satisfies', 'out', ['problem', 'usecase']),
  ],
};
const kindById = new Map(KINDS.map((k) => [k.id, k]));
const edgeById = new Map(EDGE_TYPES.map((e) => [e.id, e]));
const pad = (s, n) => String(s).padEnd(n);
const hopLabel = (h) => (h.dir === 'out' ? `${h.from} -${h.edge}->` : `${h.from} <-${h.edge}-`);

let failed = false;
const files = readdirSync(DIR).filter((f) => f.endsWith('.graph.json')).sort();
if (!files.length) { console.error('no *.graph.json in', DIR); process.exit(1); }
const coverage = {}; // project -> hopKey -> count

for (const file of files) {
  const project = file.replace('.graph.json', '');
  const g = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
  const errors = [], warns = [];
  const byId = new Map();
  for (const n of g.nodes) {
    if (byId.has(n.id)) errors.push(`duplicate node id ${n.id}`);
    byId.set(n.id, n);
    if (!kindById.has(n.kind)) errors.push(`node ${n.id}: unknown kind ${n.kind}`);
  }
  const edgeIds = new Set();
  const good = [];
  for (const e of g.edges) {
    if (edgeIds.has(e.id)) errors.push(`duplicate edge id ${e.id}`);
    edgeIds.add(e.id);
    const s = byId.get(e.src), d = byId.get(e.dst), t = edgeById.get(e.type);
    if (!s || !d) { errors.push(`edge ${e.id}: missing endpoint ${!s ? e.src : e.dst}`); continue; }
    if (!t) { errors.push(`edge ${e.id}: unknown type ${e.type}`); continue; }
    if (!t.from.includes(s.kind) || !t.to.includes(d.kind))
      errors.push(`edge ${e.id}: ${s.kind} -${e.type}-> ${d.kind} not allowed`);
    else good.push({ e, s, d });
  }
  // hop coverage
  coverage[project] = {};
  for (const [pid, hops] of Object.entries(PERSPECTIVES)) {
    for (const h of hops) {
      const n = good.filter(({ e, s, d }) => e.type === h.edge &&
        (h.dir === 'out' ? s.kind === h.from && h.to.includes(d.kind) : d.kind === h.from && h.to.includes(s.kind))).length;
      coverage[project][`${pid}|${hopLabel(h)}`] = n;
      if (n === 0) (STRICT.has(project) ? errors : warns).push(`hop ${pid}: ${hopLabel(h)} has no edges`);
      else if (n < 2) warns.push(`hop ${pid}: ${hopLabel(h)} has only ${n} edge`);
    }
  }
  // unmet needs
  const unmet = [];
  for (const n of g.nodes) {
    for (const need of kindById.get(n.kind)?.needs ?? []) {
      const c = good.filter(({ e }) => e.type === need.edge && (need.dir === 'out' ? e.src === n.id : e.dst === n.id)).length;
      if (c < (need.min ?? 1)) unmet.push(`${n.id} (${need.dir === 'out' ? '-' : '<-'}${need.edge}${need.dir === 'out' ? '->' : '-'})`);
    }
  }
  // orphans (singular basics kinds are allowed to float) and empty kinds
  const touched = new Set(g.edges.flatMap((e) => [e.src, e.dst]));
  const orphans = g.nodes.filter((n) => !touched.has(n.id) && !kindById.get(n.kind)?.singular).map((n) => n.id);
  const present = new Set(g.nodes.map((n) => n.kind));
  const empty = KINDS.map((k) => k.id).filter((k) => !present.has(k));

  console.log(`\n${project}: ${g.nodes.length} nodes, ${g.edges.length} edges, ${errors.length} errors`);
  for (const m of errors) console.log(`  ERROR ${m}`);
  for (const m of warns) console.log(`  warn  ${m}`);
  console.log(`  unmet needs (${unmet.length}): ${unmet.join(', ') || '-'}`);
  console.log(`  orphans (${orphans.length}): ${orphans.join(', ') || '-'}`);
  console.log(`  empty kinds (${empty.length}): ${empty.join(', ') || '-'}`);
  if (errors.length) failed = true;
}

// compact hop table: one row per hop, one column per project
const projects = Object.keys(coverage);
const keys = Object.keys(coverage[projects[0]]);
console.log(`\n${pad('perspective', 10)} ${pad('hop', 26)} ${projects.map((p) => pad(p, 9)).join(' ')}`);
for (const k of keys) {
  const [pid, hop] = k.split('|');
  console.log(`${pad(pid, 10)} ${pad(hop, 26)} ${projects.map((p) => pad(coverage[p][k] || '·', 9)).join(' ')}`);
}
console.log(failed ? '\nFAIL' : '\nOK');
process.exit(failed ? 1 : 0);
