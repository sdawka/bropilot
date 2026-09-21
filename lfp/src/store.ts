import { reactive, computed } from 'vue';
import seed from './graph.json';
import reality from './reality.json';
import { QUESTIONS, kindById, edgeTypeById, SPACES } from './kernel';
import { checkInvariants, contentHash } from './checks.ts';
import type { Node, Graph, ScreenItem, Answer, AICall, Effect, Changeset, Commit, FollowUp, OpenItem } from './types';

export type { Status, Node, Edge, Graph, ScreenItem, Answer, AICall, Effect, Changeset, Commit, FollowUp, Violation, OpenItem } from './types';

const KEY = 'bropilot:lfp:v1';

export const state = reactive({
  graph: { nodes: [], edges: [] } as Graph,
  answers: [] as Answer[],
  followups: [] as FollowUp[],
  staged: null as Changeset | null,
  commits: [] as Commit[],
  selectedId: null as string | null,
  hydrated: false,
  // ── director / mirror state (S110–S115) ──
  highlight: { nodes: [] as string[], edges: [] as string[], focus: null as string | null },
  say: null as { id: string; text: string } | null,
  ask: null as { id: string; text: string; options?: string[] } | null,
  tour: null as { steps: any[][]; i: number; dwellMs: number; paused: boolean } | null,
  transcript: [] as { who: 'agent' | 'user'; text: string; at: number; callId?: string }[],
  aiCalls: [] as AICall[],
  aiRuntime: 'stub' as 'stub' | 'flue', // not persisted: runtime choice is per-session
  domainLevel: 0 as 0 | 1 | 2 | 3,
  domainModule: null as string | null,
  definitionQuestion: null as string | null,
  // ── screen awareness (S110-115): what the active view is showing, for the Talk panel ──
  screen: { view: '', params: {} as Record<string, string>, items: [] as ScreenItem[] },
  panelOpen: true,
});

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

/** Merge `reality.json`'s observed test results onto the `test-result` node that `reports` each
 * test. Never creates nodes — only patches props of ones that already exist. */
function applyReality() {
  const r = reality as { results: Record<string, { status: string; value?: string; threshold?: string; confidence?: string; at?: string; codeRef?: string }>; metrics: Record<string, { value: string; at: string }> };
  for (const [testId, res] of Object.entries(r.results ?? {})) {
    const repEdge = state.graph.edges.find((e) => e.type === 'reports' && e.dst === testId);
    const tr = repEdge ? nodeById(repEdge.src) : undefined;
    if (!tr) continue;
    tr.props = { ...tr.props, status: res.status };
    if (res.value !== undefined) tr.props.value = res.value;
    if (res.threshold !== undefined) tr.props.threshold = res.threshold;
    if (res.confidence !== undefined) tr.props.confidence = res.confidence;
    if (res.codeRef !== undefined) tr.props.codeRef = res.codeRef;
  }
}

export function hydrate() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      state.graph = s.graph; state.answers = s.answers ?? []; state.commits = s.commits ?? []; state.staged = s.staged ?? null; state.followups = s.followups ?? []; state.aiCalls = s.aiCalls ?? [];
    } else {
      state.graph = clone(seed as Graph);
    }
  } catch { state.graph = clone(seed as Graph); }
  // lazy hash init for nodes seeded/loaded without one — never bumps v, just gives revalidate() a baseline
  for (const n of state.graph.nodes) if (!n.hash) n.hash = contentHash(n);
  applyReality();
  syncRaised();
  state.hydrated = true;
}

export function persist() {
  const { graph, answers, commits, staged, followups, aiCalls } = state;
  localStorage.setItem(KEY, JSON.stringify({ graph, answers, commits, staged, followups, aiCalls }));
}

export function resetToSeed() {
  state.graph = clone(seed as Graph); state.answers = []; state.commits = []; state.staged = null; state.selectedId = null; state.followups = []; state.aiCalls = [];
  for (const n of state.graph.nodes) if (!n.hash) n.hash = contentHash(n);
  applyReality();
  syncRaised();
  persist();
}

/** Record efficacy feedback ("makes sense / doesn't / bad question") on a recorded AI call (S129, S130). */
export function rateCall(id: string, value: string, note?: string) {
  const c = state.aiCalls.find((c) => c.id === id);
  if (!c) return;
  c.rating = { value, note, at: Date.now() };
  persist();
}

export function exportJson(): string {
  return JSON.stringify({ nodes: state.graph.nodes, edges: state.graph.edges }, null, 2);
}

// ── helpers ─────────────────────────────────────────────────────────────────
export const kebab = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
export function uniqueId(base: string, taken: Set<string>) {
  let id = base, n = 2;
  while (taken.has(id)) id = `${base}-${n++}`;
  taken.add(id); return id;
}
export const nodeById = (id: string) => state.graph.nodes.find((n) => n.id === id);
export const edgesOf = (id: string) => state.graph.edges.filter((e) => e.src === id || e.dst === id);

// ── path ────────────────────────────────────────────────────────────────────
export function committedAnswerFor(qid: string) {
  // a question has a committed answer when any committed node points at one of its answers
  const ids = new Set(state.answers.filter((a) => a.questionId === qid).map((a) => a.id));
  if (state.graph.nodes.some((n) => n.status === 'committed' && n.answerId && ids.has(n.answerId))) return true;
  // seed nodes count: if the produced kind already has committed nodes, treat as answered
  const q = QUESTIONS.find((q) => q.id === qid)!;
  return state.graph.nodes.some((n) => n.kind === q.produces && n.status === 'committed');
}
export const isUnlocked = (qid: string) => QUESTIONS.find((q) => q.id === qid)!.unlocksAfter.every(committedAnswerFor);
export const nextQuestion = computed(() => QUESTIONS.find((q) => isUnlocked(q.id) && !committedAnswerFor(q.id)) ?? null);

/** Low-fi effect mapping: singular kinds → one add/update; otherwise one node per non-empty line.
 * Pure (no state mutation) so AI functions (`ai/functions/answer-to-effects.ts`) can reuse it as
 * their stub's core logic and renumber the effect ids against their own `callId`. */
export function stageFor(kindId: string, content: string, answerId: string): Changeset {
  const kind = kindById[kindId];
  const taken = new Set(state.graph.nodes.map((n) => n.id));
  const effects: Effect[] = []; const warnings: string[] = [];
  const lines = content.split('\n').map((l) => l.trim()).filter(Boolean);
  if (kind.singular) {
    const existing = state.graph.nodes.find((n) => n.kind === kind.id);
    const title = lines.join(' ');
    if (existing) effects.push({ id: `ef-${effects.length}`, op: 'update-node', nodeId: existing.id, patch: { title, status: 'draft', answerId }, answerId });
    else effects.push({ id: `ef-${effects.length}`, op: 'add-node', node: { id: uniqueId(`${kind.id}-${kebab(title)}`, taken), kind: kind.id, title, status: 'draft', answerId }, answerId });
  } else {
    for (const line of lines) {
      if (state.graph.nodes.some((n) => n.kind === kind.id && n.title.toLowerCase() === line.toLowerCase())) { warnings.push(`"${line}" already exists as a ${kind.label}; skipped.`); continue; }
      const node: Node = { id: uniqueId(`${kind.id}-${kebab(line)}`, taken), kind: kind.id, title: line, status: 'draft', answerId };
      effects.push({ id: `ef-${effects.length}`, op: 'add-node', node, answerId });
      if (kind.id === 'outcome') {
        const purpose = state.graph.nodes.find((n) => n.kind === 'purpose');
        if (purpose) effects.push({ id: `ef-${effects.length}`, op: 'add-edge', edge: { id: `e-${node.id}-motivated`, src: purpose.id, dst: node.id, type: 'motivates', status: 'draft', answerId }, answerId });
      }
    }
  }
  if (!effects.length) warnings.push('Nothing to stage.');
  return { effects, warnings };
}

export function answer(questionId: string, content: string) {
  const q = QUESTIONS.find((q) => q.id === questionId)!;
  const a: Answer = { id: `a-${Date.now()}`, questionId, content, at: Date.now() };
  state.answers.push(a);
  state.staged = stageFor(q.produces, content, a.id);
  persist();
}

// ── follow-ups: sub-questions and threads (project-specific, under template questions) ──
export const followUpsOf = (parentId: string) => state.followups.filter((f) => f.parentId === parentId);
export function rootQuestionOf(id: string): string {
  const f = state.followups.find((f) => f.id === id);
  return f ? rootQuestionOf(f.parentId) : id;
}
export function addFollowUp(parentId: string, prompt: string, kind: FollowUp['kind'], produces?: string) {
  const root = QUESTIONS.find((q) => q.id === rootQuestionOf(parentId));
  const f: FollowUp = { id: `f-${Date.now()}`, parentId, prompt, kind, produces: produces ?? root?.produces ?? 'context', answerIds: [], createdAt: Date.now() };
  state.followups.push(f); persist(); return f;
}
export function answerFollowUp(followUpId: string, content: string) {
  const f = state.followups.find((f) => f.id === followUpId)!;
  const a: Answer = { id: `a-${Date.now()}`, questionId: followUpId, content, at: Date.now() };
  state.answers.push(a); f.answerIds.push(a.id);
  state.staged = stageFor(f.produces, content, a.id);
  persist();
}
export function removeFollowUp(id: string) {
  const kill = new Set<string>(); const walk = (x: string) => { kill.add(x); followUpsOf(x).forEach((c) => walk(c.id)); }; walk(id);
  state.followups = state.followups.filter((f) => !kill.has(f.id)); persist();
}

// ── content versioning & staleness (v4.1: edits are effects too; suspicion cascades transitively
// with an early cutoff — S145, S150) ──────────────────────────────────────────────────────────
/** Add a brand-new committed node, giving it a starting hash/version so future edits can be detected. */
function addCommittedNode(node: Node): Node {
  const n: Node = { ...node, status: 'committed' };
  n.hash = contentHash(n);
  n.v = n.v ?? 1;
  return n;
}
/** Apply a patch to an existing node; if the meaningful content actually changed, bump `v` and mark
 * every edge touching the node `suspect`. The spread past this one hop is not automatic — a human
 * (or the `revalidate` cue) has to look at each suspect neighbour in turn; if a neighbour turns out
 * unchanged, `revalidate` clears its own edges and the spread stops there (early cutoff); if it was
 * itself edited, committing that edit cascades suspicion outward again from the neighbour. */
function applyNodeUpdate(n: Node, patch: Partial<Node>) {
  const before = n.hash ?? contentHash(n);
  Object.assign(n, patch, { status: 'committed' });
  const after = contentHash(n);
  if (after !== before) {
    n.v = (n.v ?? 1) + 1;
    for (const e of state.graph.edges) if (e.src === n.id || e.dst === n.id) e.trace = 'suspect';
  }
  n.hash = after;
}

/** Recompute a node's hash against what was last stored. Unchanged: clear the suspicion on every
 * edge touching it (the early cutoff — the spread stops here). Changed (edited outside the commit
 * gate): bump `v` and mark its edges suspect again, same as a normal committed edit. */
export function revalidate(nodeId: string) {
  const n = nodeById(nodeId);
  if (!n) return;
  const current = contentHash(n);
  if (current === n.hash) {
    for (const e of state.graph.edges) if (e.src === n.id || e.dst === n.id) e.trace = 'valid';
  } else {
    n.v = (n.v ?? 1) + 1;
    n.hash = current;
    for (const e of state.graph.edges) if (e.src === n.id || e.dst === n.id) e.trace = 'suspect';
  }
  syncRaised();
  persist();
}

// ── raised questions: kernel violations become FollowUps (v4.1: never auto-repaired) ────────────
/** Where a violation-raised follow-up hangs in the question tree: the template question whose
 * `produces` matches the first subject's kind, else the last question of that subject's space,
 * else the fallback root. */
function parentFor(subjects: string[]): string {
  const n = subjects[0] ? nodeById(subjects[0]) : undefined;
  const kind = n ? kindById[n.kind] : undefined;
  if (kind) {
    const exact = QUESTIONS.find((q) => q.produces === kind.id);
    if (exact) return exact.id;
    const sameSpace = QUESTIONS.filter((q) => kindById[q.produces]?.space === kind.space);
    if (sameSpace.length) return sameSpace[sameSpace.length - 1].id;
  }
  return 'q-capability';
}

/** Derive open violation-raised follow-ups from `checkInvariants`: create new ones, remove ones
 * whose violation no longer exists and that have no answers yet (an answered one stays as a
 * record even if the violation later clears). Call after hydrate/commit/directCommit/undo/revalidate. */
export function syncRaised() {
  const violations = checkInvariants(state.graph).filter((v) => v.raise === 'question');
  const byId = new Map(violations.map((v) => [v.id, v]));
  state.followups = state.followups.filter((f) => {
    if (f.raisedBy?.kind !== 'violation') return true;
    return byId.has(f.raisedBy.ref) || f.answerIds.length > 0;
  });
  const existing = new Set(state.followups.filter((f) => f.raisedBy?.kind === 'violation').map((f) => f.raisedBy!.ref));
  for (const v of violations) {
    if (existing.has(v.id)) continue;
    const parentId = parentFor(v.subjects);
    state.followups.push({
      id: `f-${v.id}`,
      parentId,
      prompt: v.message,
      kind: 'thread',
      produces: v.produces ?? QUESTIONS.find((q) => q.id === parentId)?.produces ?? 'context',
      answerIds: [],
      createdAt: Date.now(),
      raisedBy: { kind: 'violation', ref: v.id },
      subjects: v.subjects,
    });
  }
}

/** Everything open, ranked into four tiers: (1) agent questions blocking a task, (2) the next
 * template question, (3) violation-raised follow-ups (by the first subject's space, then
 * invariant order), (4) the rest — thread follow-ups with no answer yet. */
export function rankOpen(): OpenItem[] {
  const items: OpenItem[] = [];

  for (const f of state.followups) {
    if (f.raisedBy?.kind === 'agent' && f.answerIds.length === 0) {
      items.push({ id: f.id, prompt: f.prompt, produces: f.produces, source: 'agent', subjects: f.subjects ?? [], tier: 1, blocking: f.raisedBy.ref });
    }
  }

  const nq = nextQuestion.value;
  if (nq) items.push({ id: nq.id, prompt: nq.prompt, produces: nq.produces, source: 'template', subjects: [], tier: 2 });

  const violations = checkInvariants(state.graph);
  const violationIndex = new Map(violations.map((v, i) => [v.id, i]));
  const violationsById = new Map(violations.map((v) => [v.id, v]));
  const tier3 = state.followups
    .filter((f) => f.raisedBy?.kind === 'violation' && f.answerIds.length === 0)
    .map((f) => {
      const subj = f.subjects?.[0];
      const n = subj ? nodeById(subj) : undefined;
      const spaceId = n ? kindById[n.kind]?.space : undefined;
      const spaceOrder = SPACES.find((s) => s.id === spaceId)?.order ?? 999;
      const vIndex = f.raisedBy ? violationIndex.get(f.raisedBy.ref) ?? 999 : 999;
      return { f, spaceOrder, vIndex };
    })
    .sort((a, b) => a.spaceOrder - b.spaceOrder || a.vIndex - b.vIndex)
    .map(({ f }) => ({
      id: f.id, prompt: f.prompt, produces: f.produces, source: 'violation' as const, subjects: f.subjects ?? [], tier: 3 as const,
      options: f.raisedBy ? violationsById.get(f.raisedBy.ref)?.options : undefined,
    }));
  items.push(...tier3);

  const tier4 = state.followups
    .filter((f) => f.answerIds.length === 0 && f.raisedBy?.kind !== 'agent' && f.raisedBy?.kind !== 'violation')
    .map((f) => ({ id: f.id, prompt: f.prompt, produces: f.produces, source: (f.raisedBy?.kind ?? 'template') as OpenItem['source'], subjects: f.subjects ?? [], tier: 4 as const }));
  items.push(...tier4);

  return items;
}

/** Escape hatch (flow Q5): apply effects as one immediate commit, bypassing review. Used by the glossary. */
export function directCommit(effects: Effect[], label: string) {
  const before = clone(state.graph);
  for (const e of effects) {
    if (e.op === 'add-node') state.graph.nodes.push(addCommittedNode(e.node));
    else if (e.op === 'update-node') { const n = nodeById(e.nodeId); if (n) applyNodeUpdate(n, e.patch); }
    else if (e.op === 'remove-node') { state.graph.nodes = state.graph.nodes.filter((n) => n.id !== e.nodeId); state.graph.edges = state.graph.edges.filter((x) => x.src !== e.nodeId && x.dst !== e.nodeId); }
    else if (e.op === 'add-edge') state.graph.edges.push({ ...e.edge, status: 'committed' });
  }
  state.commits.push({ id: `c-${Date.now()}`, at: Date.now(), effects, before, label });
  syncRaised();
  persist();
}
export function upsertTerm(title: string, description: string, id?: string) {
  const aid = 'direct';
  if (id) directCommit([{ id: 'ef-0', op: 'update-node', nodeId: id, patch: { title, description }, answerId: aid }], `glossary: ${title}`);
  else {
    const taken = new Set(state.graph.nodes.map((n) => n.id));
    directCommit([{ id: 'ef-0', op: 'add-node', node: { id: uniqueId(`term-${kebab(title)}`, taken), kind: 'term', title, description, status: 'draft' }, answerId: aid }], `glossary: ${title}`);
  }
}
export function removeNodeDirect(id: string) { directCommit([{ id: 'ef-0', op: 'remove-node', nodeId: id, answerId: 'direct' }], `remove ${id}`); }

export function discardStaged() { state.staged = null; persist(); }

/** One-line human description of a staged effect (moved here from Definition.vue so the Talk panel/Context can use it too). */
export function describe(e: Effect): string {
  if (e.op === 'add-node') return `add ${kindById[e.node.kind]?.label ?? e.node.kind} "${e.node.title}"`;
  if (e.op === 'update-node') return `update ${nodeById(e.nodeId)?.title ?? e.nodeId} → "${e.patch.title}"`;
  if (e.op === 'remove-node') return `remove ${e.nodeId}`;
  if (e.op === 'add-edge') return `edge ${nodeById(e.edge.src)?.title ?? e.edge.src} —${e.edge.type}→ ${e.edge.dst}`;
  return (e as Effect).op;
}

export function commit(acceptedIds: Set<string>) {
  if (!state.staged) return;
  const accepted = state.staged.effects.filter((e) => acceptedIds.has(e.id));
  const before = clone(state.graph);
  const addedNodeIds = new Set<string>();
  for (const e of accepted) {
    if (e.op === 'add-node') { state.graph.nodes.push(addCommittedNode(e.node)); addedNodeIds.add(e.node.id); }
    else if (e.op === 'update-node') { const n = nodeById(e.nodeId); if (n) applyNodeUpdate(n, e.patch); }
    else if (e.op === 'remove-node') { state.graph.nodes = state.graph.nodes.filter((n) => n.id !== e.nodeId); state.graph.edges = state.graph.edges.filter((x) => x.src !== e.nodeId && x.dst !== e.nodeId); }
  }
  let skipped = 0;
  for (const e of accepted) {
    if (e.op !== 'add-edge') continue;
    const ok = (id: string) => nodeById(id) !== undefined;
    if (ok(e.edge.src) && ok(e.edge.dst)) state.graph.edges.push({ ...e.edge, status: 'committed' }); else skipped++;
  }
  state.commits.push({ id: `c-${Date.now()}`, at: Date.now(), effects: accepted, before });
  state.staged = null;
  syncRaised();
  persist();
  return { applied: accepted.length, skipped };
}

export function undo() {
  const c = state.commits.pop();
  if (!c) return;
  state.graph = c.before;
  syncRaised();
  persist();
}

// ── dogfood check ───────────────────────────────────────────────────────────
export const dogfood = computed(() => {
  const ids = new Set(state.graph.nodes.map((n) => n.id));
  const unknownKinds = state.graph.nodes.filter((n) => !kindById[n.kind]).map((n) => `${n.id} (${n.kind})`);
  const dangling = state.graph.edges.filter((e) => !ids.has(e.src) || !ids.has(e.dst)).map((e) => e.id);
  const unknownEdgeTypes = state.graph.edges.filter((e) => !edgeTypeById[e.type]).map((e) => `${e.id} (${e.type})`);
  const orphans = state.graph.nodes.filter((n) => !state.graph.edges.some((e) => e.src === n.id || e.dst === n.id) && !kindById[n.kind]?.singular && n.kind !== 'term').map((n) => n.id); // glossary terms may define nothing yet
  return { unknownKinds, dangling, unknownEdgeTypes, orphans, ok: !unknownKinds.length && !dangling.length && !unknownEdgeTypes.length };
});
