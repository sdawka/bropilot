// CHECKS-SPEC §5: run the labelled set through the engine and score it.
// npx tsx scripts/checks-eval.mjs --model flash|clef|escalate|fake [--url http://127.0.0.1:8787/api/decide] [--all]
// Without --url every model runs on the in-process fake. Reviewed rows only, unless none are reviewed
// (or --all): then all rows, and the report says `reviewedOnly: false`.
// Writes public/eval/checks-report.json (one entry per model, merged) and prints one row per model.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeCtx, planChecks } from '../src/checks/plan.ts';
import { runChecks } from '../src/checks/run.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const model = arg('model', 'fake');
const url = arg('url');
if (!['flash', 'clef', 'escalate', 'fake'].includes(model)) { console.error(`unknown --model ${model}`); process.exit(1); }
const onto = JSON.parse(readFileSync(resolve(root, 'src/data/ontology.json'), 'utf8'));
const labelled = JSON.parse(readFileSync(resolve(root, 'public/eval/checks-labelled.json'), 'utf8'));
const reviewedRows = labelled.filter((r) => r.reviewed);
const reviewedOnly = reviewedRows.length > 0 && !process.argv.includes('--all');
const rows = reviewedOnly ? reviewedRows : labelled;
if (!reviewedOnly) console.warn(`checks-eval: ${reviewedRows.length ? '--all' : 'no reviewed rows'}; scoring all ${rows.length} rows`);

const fakeResp = (error) => ({ answers: {}, model: 'fake', ms: 0, fake: true, ...(error ? { error } : {}) });
const decide = model === 'fake' || !url ? async () => fakeResp() : async (req) => {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req), signal: ctl.signal });
    if (!res.ok) throw new Error(`decide ${res.status}`);
    return await res.json();
  } catch (e) { return fakeResp(String(e)); } finally { clearTimeout(t); }
};
const seeds = {};
const seed = (p) => (seeds[p] ??= JSON.parse(readFileSync(resolve(root, `public/projects/${p}.graph.json`), 'utf8')));

const out = [];
let usd = 0;
for (const row of rows) {
  const g = structuredClone(seed(row.project));
  const o = row.original;
  const e = g.edges.find((x) => x.src === o.src && x.dst === o.dst && x.type === o.type);
  if (!e) { console.warn(`${row.id}: original edge not in seed, skipped`); continue; }
  Object.assign(e, row.edge);
  const ctx = makeCtx(g, onto, row.project);
  const units = planChecks(g, onto, { edgeIds: [e.id] }, row.project);
  let last = null;
  const t0 = Date.now();
  const rs = await runChecks(units, { model: model === 'fake' ? 'flash' : model, ctx, decide, useCache: false, onProgress: (p) => { last = p; } });
  const ms = Date.now() - t0;
  usd += last?.usd ?? 0;
  const r = rs.find((x) => x.subjects[0] === `edge:${e.id}`);
  const rtKey = r && Object.keys(r.answers).find((k) => k.startsWith('sol-retype|'));
  const rt = rtKey ? r.answers[rtKey] : null;
  out.push({ id: row.id, project: row.project, label: row.label, checkId: r?.checkId ?? null, verdict: r?.verdict ?? 'unknown',
    finding: r?.finding ?? '', confidence: r?.confidence ?? 0, retype: rt?.type === 'choice' ? rt.choice : null,
    expect: row.expect, fake: r?.fake ?? true, model: r?.model ?? '', ms, evidence: r?.evidence ?? '' });
}

const ratio = (a, b) => (b ? +(a / b).toFixed(3) : null);
function score(xs) {
  const pos = xs.filter((x) => !x.expect.solid), flagged = xs.filter((x) => x.verdict === 'weak' || x.verdict === 'broken');
  const tp = flagged.filter((x) => !x.expect.solid).length, solid = xs.filter((x) => x.verdict === 'solid');
  const rtRows = xs.filter((x) => x.expect.retype);
  return { n: xs.length, flagPrecision: ratio(tp, flagged.length), flagRecall: ratio(tp, pos.length),
    strictRecall: ratio(pos.filter((x) => x.verdict === 'broken').length, pos.length),
    solidPrecision: ratio(solid.filter((x) => x.expect.solid).length, solid.length),
    retypeAccuracy: ratio(rtRows.filter((x) => x.retype === x.expect.retype).length, rtRows.length),
    meanConf: ratio(xs.reduce((s, x) => s + x.confidence, 0), xs.length), meanMs: ratio(xs.reduce((s, x) => s + x.ms, 0), xs.length),
    fakeShare: ratio(xs.filter((x) => x.fake).length, xs.length) };
}
const perCheck = Object.fromEntries([...new Set(out.map((x) => x.checkId))].sort().map((c) => {
  const s = score(out.filter((x) => x.checkId === c));
  return [c, { n: s.n, flagPrecision: s.flagPrecision, flagRecall: s.flagRecall }];
}));
const run = { model, url: url ?? null, at: new Date().toISOString(), reviewedOnly, ...score(out), usd: +usd.toFixed(6), perCheck, rows: out };

const file = resolve(root, 'public/eval/checks-report.json');
mkdirSync(dirname(file), { recursive: true });
const report = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { runs: {} };
report.runs[model] = run;
report.at = run.at;
writeFileSync(file, JSON.stringify(report, null, 1) + '\n');

const f = (x) => (x === null ? '—' : x.toFixed(2));
console.log('model | n | flag precision | flag recall | strict recall (broken only) | solid precision | retype accuracy | mean conf | mean ms | $');
for (const r of Object.values(report.runs)) {
  console.log(`${r.model}${r.url ? '' : r.model === 'fake' ? '' : ' (fake: no --url)'} | ${r.n} | ${f(r.flagPrecision)} | ${f(r.flagRecall)} | ${f(r.strictRecall)} | ${f(r.solidPrecision)} | ${f(r.retypeAccuracy)} | ${f(r.meanConf)} | ${Math.round(r.meanMs)} | $${r.usd.toFixed(4)}`);
}
console.log('per check:', Object.entries(perCheck).map(([c, s]) => `${c} n=${s.n} P=${f(s.flagPrecision)} R=${f(s.flagRecall)}`).join(' · '));
console.log(`→ ${file}`);
