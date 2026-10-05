// CHECKS-SPEC §5: deterministic labelled set for the checks eval → public/eval/checks-labelled.json.
// 10 true (seed edges as they are), 10 retype (type swapped to another legal SEMANTIC type), 10 broken
// (dst swapped to an unlinked node of the same kind with the least word overlap). A human then reads every
// row and sets `reviewed: true`; re-running keeps those marks for rows whose edge is unchanged.
// Run: npm run checks:gen-eval
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCtx } from '../src/checks/plan.ts';
import { routeEdge } from '../src/checks/catalog.ts';
import { SEMANTIC } from '../src/checks/phrasing.ts';
import { overlap, tokens } from '../src/s1/text.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const onto = JSON.parse(readFileSync(resolve(root, 'src/data/ontology.json'), 'utf8'));
const PROJECTS = ['bropilot', 'ledgerly', 'tidepool'];
const N = 10;

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const rng = mulberry32(20261004);
const pick = (xs) => xs[Math.floor(rng() * xs.length)];

const G = Object.fromEntries(PROJECTS.map((p) => {
  const graph = JSON.parse(readFileSync(resolve(root, `public/projects/${p}.graph.json`), 'utf8'));
  return [p, { graph, ctx: makeCtx(graph, onto, p) }];
}));
const isSol = (e, ctx) => (routeEdge(e, ctx) ?? '').startsWith('sol-');
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const pool = Object.fromEntries(PROJECTS.map((p) => [p, G[p].graph.edges.filter((e) => G[p].ctx.byId.has(e.src) && G[p].ctx.byId.has(e.dst) && isSol(e, G[p].ctx)).sort(byId)]));
const used = new Set();
const free = (p) => pool[p].filter((e) => !used.has(`${p}:${e.id}`));
const triple = (e) => ({ src: e.src, dst: e.dst, type: e.type });
const rows = [];
const push = (label, p, edge, original, expect) => {
  used.add(`${p}:${original.id}`);
  rows.push({ id: `${label}-${String(rows.filter((r) => r.label === label).length + 1).padStart(2, '0')}`, project: p, label, edge, original: triple(original), expect, reviewed: false });
};

// 10 true: round-robin over edge types, rotating projects
const types = [...new Set(PROJECTS.flatMap((p) => pool[p].map((e) => e.type)))].sort();
for (let i = 0; rows.length < N && i < 1000; i++) {
  const type = types[i % types.length];
  for (let k = 0; k < PROJECTS.length; k++) {
    const p = PROJECTS[(i + k) % PROJECTS.length];
    const c = free(p).filter((e) => e.type === type);
    if (c.length) { const e = pick(c); push('true', p, triple(e), e, { solid: true }); break; }
  }
}

// 10 retype: the first other legal SEMANTIC type by id, except references and has
const ALT_TYPES = [...onto.EDGE_TYPES].sort(byId);
function altOf(e, ctx) {
  const s = ctx.byId.get(e.src).kind, d = ctx.byId.get(e.dst).kind;
  return ALT_TYPES.find((a) => a.id !== e.type && SEMANTIC.includes(a.id) && a.id !== 'references' && a.id !== 'has'
    && a.from.includes(s) && a.to.includes(d) && isSol({ ...e, type: a.id }, ctx))?.id;
}
for (let i = 0; rows.filter((r) => r.label === 'retype').length < N && i < 1000; i++) {
  const p = PROJECTS[i % PROJECTS.length], ctx = G[p].ctx;
  const c = free(p).filter((e) => altOf(e, ctx));
  if (!c.length) continue;
  const e = pick(c);
  push('retype', p, { ...triple(e), type: altOf(e, ctx) }, e, { solid: false, retype: e.type });
}

// 10 broken: same type, dst → unlinked node of dst's kind with the least overlap with src (rng tie-break)
function brokenDst(e, ctx, graph) {
  const src = ctx.byId.get(e.src), dst = ctx.byId.get(e.dst);
  const near = new Set(graph.edges.filter((x) => x.src === src.id || x.dst === src.id).flatMap((x) => [x.src, x.dst]));
  const st = tokens(`${src.title} ${src.description ?? ''}`);
  const c = graph.nodes.filter((n) => n.kind === dst.kind && n.id !== dst.id && n.id !== src.id && !near.has(n.id))
    .map((n) => ({ n, o: overlap(st, tokens(`${n.title} ${n.description ?? ''}`)) }));
  if (!c.length) return null;
  const min = Math.min(...c.map((x) => x.o));
  return c.filter((x) => x.o === min).map((x) => x.n).sort(byId);
}
for (let i = 0; rows.filter((r) => r.label === 'broken').length < N && i < 1000; i++) {
  const p = PROJECTS[i % PROJECTS.length], { ctx, graph } = G[p];
  const c = free(p).filter((e) => brokenDst(e, ctx, graph));
  if (!c.length) continue;
  const e = pick(c);
  const dst = pick(brokenDst(e, ctx, graph));
  push('broken', p, { src: e.src, dst: dst.id, type: e.type }, e, { solid: false, retype: 'none' });
}

const out = resolve(root, 'public/eval/checks-labelled.json');
mkdirSync(dirname(out), { recursive: true });
if (existsSync(out)) {
  const prev = JSON.parse(readFileSync(out, 'utf8'));
  const same = (a, b) => a && a.project === b.project && JSON.stringify(a.edge) === JSON.stringify(b.edge) && JSON.stringify(a.original) === JSON.stringify(b.original);
  for (const r of rows) if (same(prev.find((x) => x.id === r.id), r) && prev.find((x) => x.id === r.id).reviewed) r.reviewed = true;
}
writeFileSync(out, JSON.stringify(rows, null, 1) + '\n');
const count = (l) => rows.filter((r) => r.label === l).length;
console.log(`checks-labelled: ${rows.length} rows (${count('true')} true, ${count('retype')} retype, ${count('broken')} broken), ${rows.filter((r) => r.reviewed).length} reviewed → ${out}`);
