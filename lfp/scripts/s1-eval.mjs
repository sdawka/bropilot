// Live eval for the System One question designs (v4.3, AGENT-RUNTIME.md §9): flat vs. ontology-
// chained questions on labelled cases over the real graph. Usage: npm run s1:eval [-- node|gaps|parent]
// Prints per-strategy accuracy, mean confidence and latency, and every disagreement so a human can judge.
import { readFileSync } from 'node:fs';
import { askSystem1, system1Available, system1Provider } from '../agent/system1.ts';
import { checkInvariants } from '../src/checks.ts';
import { groupViolations } from '../src/consolidate.ts';
import { KINDS, QUESTIONS, kindById } from '../src/kernel.ts';
import { titleCandidates } from '../src/ai/candidates.ts';
import { answerConfidence } from '../src/ai/decisionConfig.ts';
import { spaceKindRequest, resolveSpaceKind, kindRequest, resolveKind, nodeRequest, resolveNode, gapPairQuestions, resolveGapPair, parentRequest, resolveParent, flatParentRequest } from '../src/ai/ontology.ts';

if (!system1Available()) { console.error('No System One key (TYPESAFE_API_KEY / OPENROUTER_API_KEY) — nothing to evaluate.'); process.exit(1); }
console.log(`provider: ${system1Provider()}`);
const graph = JSON.parse(readFileSync(new URL('../src/graph.json', import.meta.url), 'utf8'));
const only = process.argv[2];
const ask = async (req) => { const t = Date.now(); const r = await askSystem1(req.state, req.questions); return { ...r, ms: Date.now() - t }; };
const pct = (n, d) => d ? `${Math.round((100 * n) / d)}%` : '—';
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0).toFixed(2);

// ── node by title ───────────────────────────────────────────────────────────────────────────────
const NODE_CASES = [
  ['the phone view', 'screen-mirror'],
  ['the one-thing-at-a-time companion on the phone', 'screen-mirror'],
  ['the glossary', 'screen-glossary'],
  ['the agent that checks the diff after the suite is green', 'agent-reviewer'],
  ['the function that finds contradictions', 'ai-function-find-contradictions'],
  ['the rule that only a commit can make something committed', 'rule-commit-gate'],
  ['H5', 'hypothesis-h5'],
  ['the bet that structured questions beat chat', 'hypothesis-h1'],
  ['where the browser keeps local state', 'infra-localstorage'],
  ['the websocket relay', 'infra-relay-ws'],
  ['cloudflare', 'external-deploy'],
  ['the PR gate protocol', 'protocol-pr-gate'],
  ['the task about the simulation harness', 'task-sim-harness'],
  ['the test that undo reverts one commit', 'test-undo-whole'],
  ['domain modelling', 'feature-domain-modelling'],
  ['the strategist', 'agent-strategist'],
  ['banana bread recipe', null],
  ['the reality layer term', 'term-reality-layer'],
  ['the builder who never learned the craft', 'audience-untrained-builder'],
  ['the security audit', 'protocol-security-audit'],
];
async function evalNodes() {
  const strategies = {
    // A: today — substring pre-filter, one choice over candidates (+none); nothing to ask when no candidates
    flat: async (text) => {
      const cands = titleCandidates(text, graph.nodes);
      if (!cands.length) return { id: null, confidence: 1, ms: 0, note: 'no candidates' };
      const r = await ask({ state: { text }, questions: { node: { type: 'choice', instructions: 'Which of these nodes does the text refer to? Pick none if the text refers to nothing listed.', criteria: { ...Object.fromEntries(cands.map((n) => [n.id, `${n.title} (${n.kind})`])), none: 'None of these' } } } });
      const a = r.answers.node; return { id: a.choice === 'none' ? null : a.choice, confidence: answerConfidence(a), ms: r.ms };
    },
    // B: kind first (one 40-way choice), then node within the kind
    kindFirst: async (text) => {
      const present = [...new Set(graph.nodes.map((n) => n.kind))];
      const r1 = await ask({ state: { text }, questions: { kind: { type: 'choice', instructions: 'The text refers to one item in a product description. Which kind of item is it? Pick none if it refers to nothing of these kinds.', criteria: { ...Object.fromEntries(present.map((k) => [k, `${kindById[k].label}: ${kindById[k].blurb}`])), none: 'None of these kinds' } } } });
      const k = r1.answers.kind; if (k.choice === 'none') return { id: null, confidence: answerConfidence(k), ms: r1.ms };
      const r2 = await ask(nodeRequest(text, k.choice, graph.nodes)); const n = resolveNode(r2.answers);
      return { id: n.id, confidence: Math.min(answerConfidence(k), n.confidence), ms: r1.ms + r2.ms, via: k.choice };
    },
    // B': kind first with example titles, singular kinds excluded
    kindFirstEx: async (text) => {
      const r1 = await ask(kindRequest(text, graph.nodes)); const k = resolveKind(r1.answers);
      if (!k.kind) return { id: null, confidence: k.confidence, ms: r1.ms };
      const r2 = await ask(nodeRequest(text, k.kind, graph.nodes)); const n = resolveNode(r2.answers);
      return { id: n.id, confidence: Math.min(k.confidence, n.confidence), ms: r1.ms + r2.ms, via: k.kind };
    },
    // D: hybrid — substring candidates (if any) and the kind question in ONE request; a confident candidate wins, else the chain
    hybrid: async (text) => {
      const cands = titleCandidates(text, graph.nodes);
      const req = kindRequest(text, graph.nodes);
      if (cands.length) req.questions.cand = { type: 'choice', instructions: 'Which of these nodes does the text refer to? Pick none if the text refers to nothing listed.', criteria: { ...Object.fromEntries(cands.map((n) => [n.id, `${n.title} (${kindById[n.kind]?.label ?? n.kind})`])), none: 'None of these' } };
      const r1 = await ask(req);
      const c = r1.answers.cand;
      if (c && c.choice !== 'none' && answerConfidence(c) >= 0.65) return { id: c.choice, confidence: answerConfidence(c), ms: r1.ms, via: 'candidates' };
      const k = resolveKind(r1.answers);
      if (!k.kind) return { id: null, confidence: k.confidence, ms: r1.ms };
      const r2 = await ask(nodeRequest(text, k.kind, graph.nodes)); const n = resolveNode(r2.answers);
      return { id: n.id, confidence: Math.min(k.confidence, n.confidence), ms: r1.ms + r2.ms, via: k.kind };
    },
    // C: space + kind-in-space in one request, then node within the kind
    spaceKind: async (text) => {
      const r1 = await ask(spaceKindRequest(text, graph.nodes)); const sk = resolveSpaceKind(r1.answers);
      if (!sk.kind) return { id: null, confidence: sk.confidence, ms: r1.ms, via: sk.space ?? 'none' };
      const r2 = await ask(nodeRequest(text, sk.kind, graph.nodes)); const n = resolveNode(r2.answers);
      return { id: n.id, confidence: Math.min(sk.confidence, n.confidence), ms: r1.ms + r2.ms, via: `${sk.space}/${sk.kind}` };
    },
  };
  const table = {};
  for (const [name, run] of Object.entries(strategies)) {
    const rows = [];
    for (const [text, want] of NODE_CASES) {
      try { const got = await run(text); rows.push({ text, want, ...got, ok: got.id === want }); }
      catch (e) { rows.push({ text, want, id: 'ERR', confidence: 0, ms: 0, ok: false, note: e.message }); }
    }
    table[name] = { correct: rows.filter((r) => r.ok).length, n: rows.length, meanConf: mean(rows.map((r) => r.confidence)), meanMs: Math.round(rows.reduce((a, r) => a + r.ms, 0) / rows.length) };
    console.log(`\n[node] ${name}: ${table[name].correct}/${rows.length} correct, mean confidence ${table[name].meanConf}, mean ${table[name].meanMs} ms`);
    for (const r of rows) if (!r.ok) console.log(`   ✗ "${r.text}" → ${r.id}${r.via ? ` via ${r.via}` : ''} (wanted ${r.want}, conf ${r.confidence.toFixed(2)})${r.note ? ` — ${r.note}` : ''}`);
  }
  return table;
}

// ── gap pairs ───────────────────────────────────────────────────────────────────────────────────
async function evalGaps() {
  const vs = checkInvariants(graph).filter((v) => v.raise === 'question');
  const groups = groupViolations(vs, graph).filter((g) => g.by !== 'single' && g.violationIds.length > 1);
  const byId = new Map(vs.map((v) => [v.id, v]));
  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]));
  const fact = (v) => { const n = v.subjects.map((s) => nodeById.get(s)).find(Boolean); return { message: v.message, subjectTitle: n?.title, subjectKind: n ? kindById[n.kind]?.label : undefined, invariant: v.invariant, produces: v.produces }; };
  const pairs = [];
  for (const g of groups) for (let i = 0; i < g.violationIds.length; i++) for (let j = i + 1; j < g.violationIds.length; j++) pairs.push({ key: `${g.id}-${i}-${j}`, group: g.id, by: g.by, fa: fact(byId.get(g.violationIds[i])), fb: fact(byId.get(g.violationIds[j])), a: byId.get(g.violationIds[i]).message, b: byId.get(g.violationIds[j]).message });
  console.log(`\n[gaps] ${pairs.length} co-grouped pairs in ${groups.length} groups`);

  // flat, as observe.mjs v4.3 asked it: one shared state holding every pair, one noul per pair not naming its pair
  const flatState = Object.fromEntries(pairs.map((p) => [p.key, { a: p.a, b: p.b }]));
  const flatQs = Object.fromEntries(pairs.map((p) => [p.key, { type: 'noul', instructions: 'Would one answer from the user settle both of these gaps at once?' }]));
  const t0 = Date.now(); const flat = await askSystem1(flatState, flatQs); const flatMs = Date.now() - t0;
  const flatRows = pairs.map((p) => ({ ...p, noul: flat.answers[p.key].noul }));
  console.log(`  flat (shared-state blob): together ${pct(flatRows.filter((r) => r.noul >= 0.5).length, pairs.length)}, mean confidence ${mean(flatRows.map((r) => Math.abs(r.noul - 0.5) * 2))}, ${flatMs} ms`);

  // chained: three nouls per pair, literal texts in the instructions, empty shared state, batched
  const qs = {}; for (const p of pairs) Object.assign(qs, gapPairQuestions(p.key, p.fa, p.fb));
  const ids = Object.keys(qs); const answers = {}; let chainMs = 0;
  for (let i = 0; i < ids.length; i += 150) { const chunk = Object.fromEntries(ids.slice(i, i + 150).map((id) => [id, qs[id]])); const t = Date.now(); const r = await askSystem1({}, chunk); chainMs += Date.now() - t; Object.assign(answers, r.answers); }
  const rows = pairs.map((p) => ({ ...p, v: resolveGapPair(p.key, answers) }));
  // negative controls: pairs the code did NOT group (different groups); a yes-machine would say together here too
  const singles = vs.filter((v) => !pairs.some((p) => p.a === v.message || p.b === v.message));
  const neg = []; let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 24 && pairs.length && vs.length > 1; i++) { const p = pairs[Math.floor(rnd() * pairs.length)]; const other = vs[Math.floor(rnd() * vs.length)]; if (other.message === p.a || groups.find((g) => g.id === p.group)?.violationIds.includes(other.id)) continue; neg.push({ key: `neg-${i}`, fa: p.fa, fb: fact(other), a: p.a, b: other.message }); }
  const nqs = {}; for (const p of neg) Object.assign(nqs, gapPairQuestions(p.key, p.fa, p.fb));
  const nr = await askSystem1({}, nqs); const negRows = neg.map((p) => ({ ...p, v: resolveGapPair(p.key, nr.answers) }));
  console.log(`  negative controls (cross-group pairs): together ${pct(negRows.filter((r) => r.v?.together).length, negRows.length)} of ${negRows.length} (want ~0%), mean confidence ${mean(negRows.map((r) => r.v?.confidence ?? 0))}; ${singles.length} ungrouped violations`);
  for (const r of negRows.filter((r) => r.v?.together).slice(0, 4)) console.log(`    ⚠ together: subject ${r.v.subject.toFixed(2)} missing ${r.v.missing.toFixed(2)} repair ${r.v.repair.toFixed(2)}\n      A: ${r.a.slice(0, 100)}\n      B: ${r.b.slice(0, 100)}`);
  console.log(`  chained (subject→missing→repair): together ${pct(rows.filter((r) => r.v?.together).length, pairs.length)}, mean confidence ${mean(rows.map((r) => r.v?.confidence ?? 0))}, ${chainMs} ms`);
  for (const by of ['subject', 'invariant']) {
    const sub = rows.filter((r) => r.by === by);
    console.log(`    grouped by ${by}: ${sub.length} pairs — flat together ${pct(flatRows.filter((r) => r.by === by && r.noul >= 0.5).length, sub.length)}, chained together ${pct(sub.filter((r) => r.v?.together).length, sub.length)}; chained levels mean subject ${mean(sub.map((r) => r.v?.subject ?? 0))} missing ${mean(sub.map((r) => r.v?.missing ?? 0))} repair ${mean(sub.map((r) => r.v?.repair ?? 0))}`);
  }
  console.log('  one pair per group, for judgment:');
  for (const g of groups) { const r = rows.find((x) => x.group === g.id); if (!r?.v) continue; console.log(`    ${g.by} ${g.id}: subject ${r.v.subject.toFixed(2)} missing ${r.v.missing.toFixed(2)} repair ${r.v.repair.toFixed(2)} → ${r.v.together ? 'together' : 'apart'}\n      A: ${r.a.slice(0, 110)}\n      B: ${r.b.slice(0, 110)}`); }
  return { flatTogether: flatRows.filter((r) => r.noul >= 0.5).length, chainedTogether: rows.filter((r) => r.v?.together).length, n: pairs.length };
}

// ── raise-parent ────────────────────────────────────────────────────────────────────────────────
function codeParentFor(producesKind) {
  const kind = kindById[producesKind];
  if (kind) { const exact = QUESTIONS.find((q) => q.produces === kind.id); if (exact) return exact.id; const same = QUESTIONS.filter((q) => kindById[q.produces]?.space === kind.space); if (same.length) return same[same.length - 1].id; }
  return 'q-capability';
}
async function evalParent() {
  const kinds = KINDS.map((k) => k.id);
  const out = {};
  for (const [name, build, resolve] of [['flat', flatParentRequest, (a) => ({ questionId: a.q.choice, confidence: answerConfidence(a.q) })], ['spaceFirst', parentRequest, resolveParent]]) {
    const rows = [];
    for (const k of kinds) { const r = await ask(build(k)); const v = resolve(r.answers); rows.push({ kind: k, got: v.questionId, want: codeParentFor(k), confidence: v.confidence, ms: r.ms, space: v.space }); }
    const agree = rows.filter((r) => r.got === r.want).length;
    out[name] = { agree, n: rows.length, meanConf: mean(rows.map((r) => r.confidence)), meanMs: Math.round(rows.reduce((a, r) => a + r.ms, 0) / rows.length) };
    console.log(`\n[parent] ${name}: agrees with parentFor ${agree}/${rows.length}, mean confidence ${out[name].meanConf}, mean ${out[name].meanMs} ms`);
    for (const r of rows) if (r.got !== r.want) console.log(`   ≠ ${r.kind} (${kindById[r.kind].space}) → ${r.got}${r.space ? ` via ${r.space}` : ''} (code: ${r.want}, conf ${r.confidence.toFixed(2)})`);
  }
  return out;
}

const summary = {};
if (!only || only === 'node') summary.node = await evalNodes();
if (!only || only === 'gaps') summary.gaps = await evalGaps();
if (!only || only === 'parent') summary.parent = await evalParent();
console.log('\nsummary', JSON.stringify(summary));
