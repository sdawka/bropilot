// CHECKS-SPEC §3.1 / §6 checklist 1: routing, batching limits, deterministic keys and hashes, fake
// determinism, the verdict table. Run: npm run checks:test (tsx --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHECKS, CHECK_IDS, routeEdge } from './catalog.ts';
import { makeCtx, planChecks, planRetype } from './plan.ts';
import { batch, requestChars, MAX_CHARS, MAX_QUESTIONS } from './batch.ts';
import { hashUnit, evictSubjects } from './cache.ts';
import { fakeAnswers, fakeNoul, fakeChoice } from './fake.ts';
import { nounVerdict, resolveCheck, rollup } from './resolve.ts';
import { runChecks } from './run.ts';
import { estimate } from './cost.ts';
import { repairToEffects } from './repairs.ts';
import { SEMANTIC, CHECK_STATE } from './phrasing.ts';
import { bandFor } from '../s1/decisionConfig.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const onto = JSON.parse(readFileSync(resolve(root, 'src/data/ontology.json'), 'utf8'));
const PROJECTS = ['bropilot', 'ledgerly', 'tidepool'];
const seed = (p) => JSON.parse(readFileSync(resolve(root, `public/projects/${p}.graph.json`), 'utf8'));
const graphs = Object.fromEntries(PROJECTS.map((p) => [p, seed(p)]));
const fakeDecide = async (req) => ({ answers: {}, model: 'fake', ms: 0, fake: true });

test('catalog has all 23 checks with labels', () => {
  assert.equal(CHECK_IDS.length, 23);
  for (const id of CHECK_IDS) { assert.equal(CHECKS[id].id, id); assert.ok(CHECKS[id].label); }
  assert.equal(CHECKS['sol-edge'].label, 'Link holds?');
  assert.equal(CHECKS['con-term-usage'].label, 'Term used as defined?');
});

test('ontology carries hint, RELATIONS, LIFECYCLE_STAGES', () => {
  assert.ok(onto.EDGE_TYPES.every((e) => typeof e.hint === 'string' && e.hint.length));
  assert.ok(onto.RELATIONS.length > 0);
  assert.deepEqual(onto.LIFECYCLE_STAGES, ['awareness', 'acquisition', 'onboarding', 'use', 'support', 'retention', 'advocacy', 'end-of-life']);
});

for (const p of PROJECTS) {
  test(`routing: every ${p} SEMANTIC edge lands in exactly one planned unit`, () => {
    const g = graphs[p], ctx = makeCtx(g, onto, p), units = planChecks(g, onto, {}, p);
    const byEdge = new Map();
    for (const u of units) for (const s of u.subjects) if (s.startsWith('edge:')) byEdge.set(s, [...(byEdge.get(s) ?? []), u.checkId]);
    for (const e of g.edges) {
      const route = routeEdge(e, ctx);
      if (!SEMANTIC.includes(e.type)) { assert.equal(route, null, e.id); assert.equal(byEdge.get(`edge:${e.id}`), undefined, e.id); continue; }
      assert.ok(route, `${e.id} ${e.type} unrouted`);
      assert.deepEqual(byEdge.get(`edge:${e.id}`), [route], `${p} ${e.id} ${e.type}`);
    }
    assert.ok(units.every((u) => u.checkId !== 'sol-retype'));
  });

  test(`batching: ${p} requests are homogeneous, ≤ ${MAX_QUESTIONS} questions, ≤ ${MAX_CHARS} chars, nothing split or lost`, () => {
    const units = planChecks(graphs[p], onto, {}, p);
    for (const model of ['clef-flash', 'clef']) {
      const reqs = batch(units, model);
      const seen = new Set();
      for (const { request, units: us } of reqs) {
        assert.equal(request.fn, 'check');
        assert.equal(request.state, CHECK_STATE);
        assert.equal(request.model, model);
        assert.equal(new Set(us.map((u) => u.checkId)).size, 1);
        assert.ok(Object.keys(request.questions).length <= MAX_QUESTIONS);
        assert.ok(requestChars(request.questions) <= MAX_CHARS);
        for (const u of us) { for (const k of Object.keys(u.questions)) assert.ok(k in request.questions); seen.add(u.key); }
      }
      const asked = units.filter((u) => !u.code);
      assert.equal(seen.size, asked.length);
    }
  });
}

test('batching: a request closes at 64 questions', () => {
  const big = Array.from({ length: 150 }, (_, i) => ({ key: `sol-edge|edge:x${String(i).padStart(3, '0')}`, checkId: 'sol-edge', family: 'solidity',
    subjects: [`edge:x${i}`], meta: {}, questions: { [`sol-edge|edge:x${String(i).padStart(3, '0')}`]: { type: 'noul', instructions: 'x' } } }));
  const reqs = batch(big, 'clef-flash');
  assert.deepEqual(reqs.map((r) => Object.keys(r.request.questions).length), [64, 64, 22]);
});

test('keys and hashes are deterministic; an edit changes only the units naming the node', async () => {
  const g = graphs.ledgerly;
  const a = planChecks(g, onto, {}, 'ledgerly'), b = planChecks(structuredClone(g), onto, {}, 'ledgerly');
  assert.deepEqual(a.map((u) => u.key), b.map((u) => u.key));
  assert.deepEqual(a.map((u) => u.key), [...a.map((u) => u.key)].sort());
  for (const u of a) {
    const single = Object.keys(u.questions).length === 1;
    for (const k of Object.keys(u.questions)) assert.ok(single ? k === u.key : k.startsWith(`${u.key}|`), k);
  }
  const ha = await Promise.all(a.map((u) => hashUnit(u, 'clef-flash')));
  const hb = await Promise.all(b.map((u) => hashUnit(u, 'clef-flash')));
  assert.deepEqual(ha, hb);
  assert.match(ha[0], /^[0-9a-f]{40}$/);
  assert.notEqual(await hashUnit(a[0], 'clef'), ha[0]);
  const g2 = structuredClone(g);
  const target = g2.nodes.find((n) => n.id === 'goal-median-days-to-paid-under-14-by-end-of');
  target.title = 'Median days-to-paid under 10';
  const c = planChecks(g2, onto, {}, 'ledgerly');
  const hc = await Promise.all(c.map((u) => hashUnit(u, 'clef-flash')));
  const changed = c.filter((u, i) => hc[i] !== ha[a.findIndex((x) => x.key === u.key)]);
  assert.ok(changed.length > 0);
  assert.ok(changed.every((u) => u.subjects.includes(target.id) || JSON.stringify(u.questions).includes('Median days-to-paid')), changed.map((u) => u.key).join(' '));
});

test('scope: edgeIds plans that edge only; nodeIds pulls in units naming the node', () => {
  const g = graphs.ledgerly;
  const one = planChecks(g, onto, { edgeIds: ['e22'] }, 'ledgerly');
  assert.deepEqual(one.map((u) => u.key), ['sol-edge|edge:e22,goal-median-days-to-paid-under-14-by-end-of,metric-forecast-error-at-30-days']);
  const nid = 'rule-tax-rate-is-frozen-once-an-invoice-is';
  const byNode = planChecks(g, onto, { nodeIds: [nid] }, 'ledgerly');
  assert.ok(byNode.length >= 2 && byNode.every((u) => u.subjects.includes(nid)));
  assert.ok(byNode.some((u) => u.checkId === 'cmp-need'));
  assert.ok(planChecks(g, onto, { families: ['consistency'] }, 'ledgerly').every((u) => u.family === 'consistency'));
});

test('E1 / E5 questions are verbatim', () => {
  const g = graphs.ledgerly;
  const e1 = planChecks(g, onto, { edgeIds: ['e22'] }, 'ledgerly')[0];
  assert.equal(e1.questions[e1.key].instructions, 'In a product description, "combines" means: Goal combines metrics.\nClaim: the goal "Median days-to-paid under 14 by end of Q2" combines the metric "Forecast error at 30 days".\nDoes the claim hold, judging only from these words?');
  const e5 = planChecks(g, onto, { checkIds: ['cmp-need'] }, 'ledgerly').find((u) => u.key === 'cmp-need|rule-tax-rate-is-frozen-once-an-invoice-is,verifies');
  assert.ok(e5);
  const q = e5.questions[e5.key];
  assert.equal(q.instructions, 'The rule "Tax rate is frozen once an invoice is sent" needs a "verifies" link: How would we know "Tax rate is frozen once an invoice is sent" holds? One test per line, naming the condition.\nWhich of these test items is it? Pick none if none of them fits.');
  assert.equal(Object.keys(q.criteria).length, 4);
  assert.equal(q.criteria.none, 'None of these; a new one is needed');
});

test('fakes are deterministic and match the spec numbers', () => {
  for (const p of PROJECTS) {
    const ctx = makeCtx(graphs[p], onto, p);
    const units = planChecks(graphs[p], onto, {}, p);
    const a = units.map((u) => (u.code ? {} : fakeAnswers(u, ctx))), b = units.map((u) => (u.code ? {} : fakeAnswers(u, ctx)));
    assert.deepEqual(a, b);
    units.forEach((u, i) => { if (!u.code) assert.deepEqual(Object.keys(a[i]).sort(), Object.keys(u.questions).sort(), u.key); });
  }
  assert.deepEqual(fakeNoul('bank feed sync', 'sync the bank feed'), { type: 'noul', noul: 0.86 });
  assert.deepEqual(fakeNoul('invoice', 'invoice list'), { type: 'noul', noul: 0.72 });
  assert.deepEqual(fakeNoul('alpha', 'beta'), { type: 'noul', noul: 0.35 });
  const c = fakeChoice('bank feed sync', { a: 'Bank feed sync status', b: 'Invoice list', none: 'None of these' });
  assert.equal(c.choice, 'a'); assert.equal(c.confidence, 0.75);
  assert.equal(fakeChoice('zzz', { a: 'Bank', none: 'None' }).choice, 'none');
});

test('verdict table: nounVerdict, rollup, bands', () => {
  // conf = |p − .5|·2; act ≥ t, offer ≥ .40, else ask
  assert.equal(nounVerdict(0.08, 0.6, 'yes-good'), 'broken');   // E1: conf .84
  assert.equal(nounVerdict(0.27, 0.6, 'yes-good'), 'weak');     // E2: conf .46
  assert.equal(nounVerdict(0.62, 0.6, 'yes-good'), 'unknown');  // E4: conf .24
  assert.equal(nounVerdict(0.93, 0.6, 'yes-good'), 'solid');    // E10
  assert.equal(nounVerdict(0.93, 0.55, 'yes-bad'), 'broken');
  assert.equal(nounVerdict(0.05, 0.55, 'yes-bad'), 'solid');
  assert.equal(nounVerdict(0.74, 0.55, 'yes-bad'), 'weak');     // E6: conf .48
  assert.equal(rollup('solid', 'offer'), 'weak');
  assert.equal(rollup('broken', 'offer'), 'weak');
  assert.equal(rollup('weak', 'act'), 'weak');
  assert.equal(rollup('solid', 'ask'), 'unknown');
  assert.equal(bandFor(0.4, 0.7), 'offer');
});

test('worked examples resolve as specified', () => {
  const g = graphs.ledgerly, ctx = makeCtx(g, onto, 'ledgerly');
  const units = planChecks(g, onto, {}, 'ledgerly');
  const e1 = units.find((u) => u.key.startsWith('sol-edge|edge:e22,'));
  const r1 = resolveCheck(e1, { [e1.key]: { type: 'noul', noul: 0.08 } }, ctx);
  assert.equal(r1.verdict, 'broken'); assert.equal(r1.finding, 'does-not-hold'); assert.equal(r1.confidence, 0.84);
  assert.equal(r1.evidence, '"Median days-to-paid under 14 by end of Q2" combines "Forecast error at 30 days": does not hold (0.84)');
  assert.equal(r1.repairs[0].label, 'Remove this link'); assert.equal(r1.repairs[0].primary, true);
  const e5 = units.find((u) => u.key === 'cmp-need|rule-tax-rate-is-frozen-once-an-invoice-is,verifies');
  const r5 = resolveCheck(e5, { [e5.key]: { type: 'choice', choice: 'none', confidence: 0.91, probabilities: { none: 0.91 } } }, ctx);
  assert.equal(r5.verdict, 'broken'); assert.equal(r5.finding, 'missing');
  assert.equal(r5.evidence, '"Tax rate is frozen once an invoice is sent" has no test, none of 3 fits (0.91)');
  assert.equal(r5.repairs[0].op, 'question');
  const bet = units.find((u) => u.checkId === 'con-bet-evidence' && u.subjects[0] === 'hypothesis-a-60-day-forecast-reduces-end-of-month');
  assert.ok(bet);
  const r8 = resolveCheck(bet, { [bet.key]: { type: 'score', score: 0, confidence: 0.74, probabilities: { 0: 0.74 } } }, ctx);
  assert.equal(r8.verdict, 'weak'); assert.equal(r8.finding, 'unrecorded');
  assert.equal(r8.evidence, 'evidence says refuted (0.74), verdict not recorded');
  assert.equal(r8.repairs[0].label, 'Set verdict to refuted');
  const bro = graphs.bropilot, bctx = makeCtx(bro, onto, 'bropilot');
  const e10 = planChecks(bro, onto, { checkIds: ['con-outcome-metric'] }, 'bropilot').find((u) => u.questions[u.key].instructions.includes('hypotheses with verdicts'));
  const r10 = resolveCheck(e10, { [e10.key]: { type: 'noul', noul: 0.93 } }, bctx);
  assert.equal(r10.verdict, 'solid'); assert.equal(r10.finding, 'same');
  assert.equal(r10.evidence, '"Share of hypotheses with a verdict" = "hypotheses with verdicts" (0.86)');
});

test('retype unit: keep | legal SEMANTIC alternatives | none', () => {
  const g = graphs.ledgerly, ctx = makeCtx(g, onto, 'ledgerly');
  const e1 = planChecks(g, onto, { edgeIds: ['e22'] }, 'ledgerly')[0];
  const r = { ...resolveCheck(e1, { [e1.key]: { type: 'noul', noul: 0.08 } }, ctx), at: '', model: 'x', fake: false, hash: '' };
  const [rt] = planRetype([r], ctx);
  assert.equal(rt.checkId, 'sol-retype');
  const crit = rt.questions[rt.key].criteria;
  assert.equal(Object.keys(crit)[0], 'keep'); assert.equal(Object.keys(crit).at(-1), 'none');
  assert.equal(crit.keep, 'Keep "combines": Goal combines metrics.');
  assert.ok(Object.keys(crit).every((k) => k === 'keep' || k === 'none' || SEMANTIC.includes(k)));
});

test('runChecks on fake: code results kept, fakes never broken except cmp-need, sorted worst first', async () => {
  const g = graphs.ledgerly, ctx = makeCtx(g, onto, 'ledgerly');
  const units = planChecks(g, onto, {}, 'ledgerly');
  const a = await runChecks(units, { model: 'flash', ctx, decide: fakeDecide, useCache: false });
  const b = await runChecks(units, { model: 'flash', ctx, decide: fakeDecide, useCache: false });
  assert.equal(a.length, units.length);
  assert.deepEqual(a.map((r) => [r.id, r.verdict, r.confidence]), b.map((r) => [r.id, r.verdict, r.confidence]));
  assert.ok(a.every((r) => r.verdict !== 'broken' || r.checkId === 'cmp-need' || r.model === 'code'));
  const rank = { broken: 0, weak: 1, unknown: 2, solid: 3 };
  for (let i = 1; i < a.length; i++) assert.ok(rank[a[i - 1].verdict] <= rank[a[i].verdict]);
  const est = estimate(units, 'flash');
  assert.ok(est.requests >= 1 && est.usd > 0);
  assert.ok(estimate(units, 'escalate').usd > est.usd);
});

test('a missing answer key makes only that unit fake', async () => {
  const g = graphs.ledgerly, ctx = makeCtx(g, onto, 'ledgerly');
  const units = planChecks(g, onto, { checkIds: ['sol-edge'] }, 'ledgerly').slice(0, 3);
  const decide = async (req) => {
    const keys = Object.keys(req.questions);
    return { answers: Object.fromEntries(keys.slice(1).map((k) => [k, { type: 'noul', noul: 0.95 }])), model: 'clef-flash', ms: 1, fake: false };
  };
  const rs = await runChecks(units, { model: 'flash', ctx, decide, useCache: false });
  assert.equal(rs.filter((r) => r.fake).length, 1);
  assert.equal(rs.filter((r) => !r.fake && r.verdict === 'solid').length, 2);
});

test('repairs map to effects; question and mark-reviewed are no-ops', () => {
  const g = graphs.ledgerly;
  const e = g.edges.find((x) => x.id === 'e22');
  assert.deepEqual(repairToEffects({ label: 'Remove this link', op: 'remove-edge', edgeId: 'e22' }, g).map((f) => f.op), ['remove-edge']);
  assert.deepEqual(repairToEffects({ label: 'Change to references', op: 'retype-edge', edgeId: 'e22', to: 'references' }, g).map((f) => f.op), ['remove-edge', 'add-edge']);
  assert.deepEqual(repairToEffects({ label: 'x', op: 'add-edge', src: e.src, dst: e.dst, type: e.type }, g), []);
  assert.deepEqual(repairToEffects({ label: 'x', op: 'question', text: 'x', nodeIds: [], kind: null }, g), []);
  assert.deepEqual(repairToEffects({ label: 'x', op: 'mark-reviewed' }, g), []);
  const add = repairToEffects({ label: 'Add metric "X"', op: 'add-node', node: { kind: 'metric', title: 'X' }, link: { type: 'monitors', dir: 'out', other: 'o1' } }, g);
  assert.equal(add[1].edge.src, add[0].node.id);
  assert.deepEqual(repairToEffects({ label: 'x', op: 'add-node', node: { kind: 'metric', title: 'X' } }, g), repairToEffects({ label: 'x', op: 'add-node', node: { kind: 'metric', title: 'X' } }, g));
});

test('evictSubjects drops results naming removed nodes or edges', () => {
  const r = (id, subjects) => ({ id, subjects });
  const out = evictSubjects({ a: r('a', ['edge:e1', 'n1', 'n2']), b: r('b', ['n3']), c: r('c', ['n2', 'n4']) }, ['e1', 'n4']);
  assert.deepEqual(Object.keys(out), ['b']);
});

test('unknown verdicts carry only a question and mark-reviewed (no remove/retype/add/merge)', async () => {
  for (const p of PROJECTS) {
    const ctx = makeCtx(graphs[p], onto, p);
    const units = planChecks(graphs[p], onto, {}, p).filter((u) => !u.code);
    // every answer at p = .5 / conf .40 forces the ask band where possible
    for (const u of units) {
      const answers = Object.fromEntries(Object.entries(u.questions).map(([k, q]) => [k, q.type === 'noul' ? { type: 'noul', noul: 0.55 }
        : q.type === 'choice' ? { type: 'choice', choice: Object.keys(q.criteria)[0], confidence: 0.1, probabilities: {} }
        : { type: 'score', score: 1, confidence: 0.1, probabilities: {} }]));
      const r = resolveCheck(u, answers, ctx);
      if (r.verdict !== 'unknown') continue;
      assert.ok(r.repairs.every((x) => x.op === 'question' || x.op === 'mark-reviewed'), `${u.key}: ${r.repairs.map((x) => x.op)}`);
      assert.ok(r.repairs.some((x) => x.op === 'mark-reviewed'), u.key);
      if (u.checkId.startsWith('sol-')) assert.equal(r.repairs[0].op, 'question', u.key);
    }
  }
});

test('mixSmall: groups share requests; limits still hold; a lazy 3-node scope costs ≤ 2 first-pass requests', () => {
  const g = graphs.ledgerly;
  const ids = ['rule-tax-rate-is-frozen-once-an-invoice-is', 'goal-median-days-to-paid-under-14-by-end-of', 'hypothesis-a-60-day-forecast-reduces-end-of-month'];
  const units = planChecks(g, onto, { nodeIds: ids }, 'ledgerly');
  const homo = batch(units, 'clef-flash'), mixed = batch(units, 'clef-flash', { mixSmall: true });
  const qs = (bs) => bs.flatMap((b) => Object.keys(b.request.questions)).sort();
  assert.deepEqual(qs(mixed), qs(homo));
  assert.ok(mixed.length < homo.length, `${mixed.length} vs ${homo.length}`);
  assert.ok(mixed.length <= 2, `mixed ${mixed.length}`);
  for (const b of mixed) {
    assert.ok(Object.keys(b.request.questions).length <= MAX_QUESTIONS && requestChars(b.request.questions) <= MAX_CHARS);
    for (const u of b.units) for (const k of Object.keys(u.questions)) assert.ok(k in b.request.questions);
  }
  for (const b of homo) assert.equal(new Set(b.units.map((u) => u.checkId)).size, 1);
  console.log(`  lazy 3-node scope: ${units.length} units, ${homo.length} homogeneous requests → ${mixed.length} mixed`);
});

test('lazy: a 3-column scope on ledgerly costs ≤ 2 requests', () => {
  const g = graphs.ledgerly;
  for (const kinds of [['outcome', 'hypothesis', 'metric'], ['audience', 'problem', 'capability'], ['module', 'interface', 'thing'], ['feature', 'flow', 'screen'], ['rule', 'test', 'thing']]) {
    const ids = g.nodes.filter((n) => kinds.includes(n.kind)).map((n) => n.id);
    const units = planChecks(g, onto, { nodeIds: ids }, 'ledgerly');
    const mixed = batch(units, 'clef-flash', { mixSmall: true });
    assert.ok(mixed.length <= 2, `${kinds}: ${mixed.length} requests`);
    assert.equal(mixed.reduce((n, b) => n + b.units.length, 0), units.filter((u) => !u.code).length);
    for (const b of mixed) assert.ok(Object.keys(b.request.questions).length <= MAX_QUESTIONS && requestChars(b.request.questions) <= MAX_CHARS);
  }
});
