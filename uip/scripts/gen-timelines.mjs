import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../public/projects', import.meta.url));
const A = (id, name) => ({ kind: 'agent', id: `agent:${id}`, name });
const ME = { kind: 'human', id: 'you', name: 'You' };
const S1 = { kind: 's1', id: 's1', name: 'S1' };
const day = { bropilot: '2026-10-03', ledgerly: '2026-10-02', tidepool: '2026-09-30' };

for (const id of ['bropilot', 'ledgerly', 'tidepool']) {
  const g = JSON.parse(readFileSync(`${root}/${id}.graph.json`, 'utf8'));
  const by = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
  const of = (k) => g.nodes.filter((n) => n.kind === k);
  const into = (nid) => g.edges.filter((e) => e.dst === nid);
  const t = (h, m = 0) => `${day[id]}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`;
  const pick = (k, i = 0) => { const xs = of(k); if (!xs.length) throw new Error(`${id}: no ${k}`); return xs[Math.min(i, xs.length - 1)]; };

  const realises = g.edges.filter((e) => e.type === 'realises');
  const contains = g.edges.filter((e) => e.type === 'contains');
  const commitFx = (es) => es.map((e) => `${e.type} +1 · ${by[e.dst]?.title ?? e.dst}`);

  // changeset target: bropilot follows the design (Split Review change); others take the first
  // ai-function / rule / screen with an incoming structural edge
  let R, E, newTitle, csTitle;
  if (id === 'bropilot') {
    R = by['ai-function-review-change']; E = g.edges.find((e) => e.id === 'e-contains-ai-function-review-change');
    newTitle = 'Triage change'; csTitle = 'Split Review change into triage + verdict';
  } else {
    for (const k of ['ai-function', 'rule', 'screen']) {
      for (const n of of(k)) { const e = into(n.id).find((x) => ['contains', 'exposes', 'governs', 'implements'].includes(x.type)); if (e) { R = n; E = e; break; } }
      if (R) break;
    }
    newTitle = `${R.title} (v2)`; csTitle = `Split ${R.title} into a v2`;
  }
  const N = { id: `${R.kind}-${newTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/, '')}`, kind: R.kind, title: newTitle, status: 'draft', description: `Proposed by the reviewer agent as a narrower ${R.kind}.` };
  const open = {
    id: `cs-${id}-12`, number: 12, title: csTitle, author: A('reviewer', 'reviewer'), status: 'open',
    effects: [
      { id: 'fx-12-1', op: 'add-node', node: N, verdict: 'pending' },
      { id: 'fx-12-2', op: 'add-edge', edge: { id: `e-${E.type}-${N.id}`, src: E.src, dst: N.id, type: E.type, status: 'draft' }, verdict: 'pending' },
      { id: 'fx-12-3', op: 'update-node', node: { ...R, props: { ...(R.props ?? {}), status: 'deprecated' } }, before: { props: R.props ?? {} }, verdict: 'pending' },
      { id: 'fx-12-4', op: 'remove-edge', edge: E, verdict: 'pending' },
    ],
    checks: { ok: 3, warn: 1, messages: [`${by[E.src]?.title ?? E.src} loses its ${E.type} edge to ${R.title}`] },
    blast: `touches 1 ${R.kind} and ${by[E.src]?.title ?? E.src} · ${into(R.id).length} edge(s) re-pointed`,
    createdAt: t(14, 10),
  };
  // accepted (and committed) earlier: three implements/satisfies edges that are in the graph today
  const accEdges = g.edges.filter((e) => ['implements', 'satisfies', 'has'].includes(e.type)).slice(0, 3);
  const accepted = {
    id: `cs-${id}-11`, number: 11, title: `Link ${by[accEdges[0].src].title} to what it serves`, author: A('planner', 'planner'), status: 'committed',
    effects: accEdges.map((e, i) => ({ id: `fx-11-${i + 1}`, op: 'add-edge', edge: e, verdict: i === 2 ? 'rejected' : 'accepted', ...(i === 2 ? { reason: 'already implied by the capability' } : {}) })),
    checks: { ok: 3, warn: 0, messages: [] }, blast: `adds ${accEdges.length} edges in Product and User`, createdAt: t(10, 5),
  };
  const red = (id === 'bropilot' && by['test-unlock']) || (of('test').find((x) => g.edges.some((e) => e.src === x.id && e.type === 'verifies')) ?? pick('test'));
  const green = of('test').find((x) => x.id !== red.id) ?? red;
  const task = pick('task');
  const linked = g.nodes.filter((n) => ['thing', 'rule', 'interface', 'event'].includes(n.kind)).slice(-4);
  const R1 = realises.slice(0, 2).concat(contains.slice(0, 2));
  const R2 = contains.slice(5, 8);

  const entries = [
    { id: `${id}-t1`, at: t(9, 2), author: A('extractor', 'extractor'), nodeRefs: R1.map((e) => e.dst), type: 'commit', summary: 'extract: modules and their contents', effects: commitFx(R1) },
    { id: `${id}-t2`, at: t(9, 6), author: A('extractor', 'extractor'), nodeRefs: R2.map((e) => e.dst), type: 'commit', summary: 'extract: things and rules', effects: commitFx(R2) },
    { id: `${id}-t3`, at: t(10, 5), author: A('planner', 'planner'), nodeRefs: accEdges.map((e) => e.src), type: 'changeset', changeset: accepted },
    { id: `${id}-t4`, at: t(10, 40), author: ME, nodeRefs: accEdges.map((e) => e.src), type: 'commit', summary: 'accepted #11 (2 of 3 effects)', effects: accEdges.slice(0, 2).map((e) => `${e.type} · ${by[e.src].title} → ${by[e.dst].title}`) },
    { id: `${id}-t5`, at: t(11, 30), author: A('engineer', 'engineer'), nodeRefs: [task.id], type: 'task', taskId: task.id, status: 'running' },
    { id: `${id}-t6`, at: t(12, 1), author: A('tester', 'tester'), nodeRefs: [green.id], type: 'test', ok: true, testId: green.id, title: green.title },
    { id: `${id}-t7`, at: t(12, 2), author: A('tester', 'tester'), nodeRefs: [red.id], type: 'test', ok: false, testId: red.id, title: red.title },
    { id: `${id}-t8`, at: t(13, 15), author: A('engineer', 'engineer'), nodeRefs: [task.id], type: 'commit', summary: `wip on ${task.title}`, effects: [`targets · ${task.title} → ${red.title}`] },
    { id: `${id}-t9`, at: t(14, 10), author: A('reviewer', 'reviewer'), nodeRefs: [R.id, E.src], type: 'changeset', changeset: open },
    { id: `${id}-t10`, at: t(14, 30), author: S1, nodeRefs: linked.map((n) => n.id), type: 'message', text: `linked ${linked.length - 1} of ${linked.length} new nodes · 1 needs you` },
  ];
  // sanity: every node ref exists (or is the changeset's new node)
  for (const e of entries) for (const r of e.nodeRefs ?? []) if (!by[r]) throw new Error(`${id}: bad ref ${r}`);
  writeFileSync(`${root}/${id}.timeline.json`, JSON.stringify({ project: id, entries }, null, 2) + '\n');
  console.log(id, entries.length, 'entries; open changeset on', R.id, 'removes', E.id, '; red test', red.id);
}
