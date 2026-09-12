import { reactive, computed } from 'vue';
import seed from './graph.json';
import { QUESTIONS, kindById, edgeTypeById, type Provenance } from './kernel';

export type Status = 'draft' | 'committed';

export interface Node {
  id: string;
  kind: string;
  title: string;
  description?: string;
  props?: Record<string, string>;
  status: Status;
  source?: Provenance;
  answerId?: string;
}
export interface Edge { id: string; src: string; dst: string; type: string; status?: Status; answerId?: string }
export interface Graph { nodes: Node[]; edges: Edge[] }

export interface Answer { id: string; questionId: string; content: string; at: number }
export type Effect =
  | { id: string; op: 'add-node'; node: Node; answerId: string }
  | { id: string; op: 'update-node'; nodeId: string; patch: Partial<Node>; answerId: string }
  | { id: string; op: 'remove-node'; nodeId: string; answerId: string }
  | { id: string; op: 'add-edge'; edge: Edge; answerId: string };
export interface Changeset { effects: Effect[]; warnings: string[] }
export interface Commit { id: string; at: number; effects: Effect[]; before: Graph; label?: string }
/** Project-specific question under a template question (sub-question) or a follow-up on one (thread). S52, S53, S54. */
export interface FollowUp {
  id: string;
  parentId: string; // a QUESTIONS id or another FollowUp id
  prompt: string;
  kind: 'sub' | 'thread';
  produces: string; // kind id the answer creates nodes of
  answerIds: string[];
  createdAt: number;
}

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
  transcript: [] as { who: 'agent' | 'user'; text: string; at: number }[],
  domainLevel: 0 as 0 | 1 | 2 | 3,
  domainModule: null as string | null,
  definitionQuestion: null as string | null,
});

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

export function hydrate() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      state.graph = s.graph; state.answers = s.answers ?? []; state.commits = s.commits ?? []; state.staged = s.staged ?? null; state.followups = s.followups ?? [];
    } else {
      state.graph = clone(seed as Graph);
    }
  } catch { state.graph = clone(seed as Graph); }
  state.hydrated = true;
}

export function persist() {
  const { graph, answers, commits, staged, followups } = state;
  localStorage.setItem(KEY, JSON.stringify({ graph, answers, commits, staged, followups }));
}

export function resetToSeed() {
  state.graph = clone(seed as Graph); state.answers = []; state.commits = []; state.staged = null; state.selectedId = null; state.followups = [];
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

/** Low-fi effect mapping: singular kinds → one add/update; otherwise one node per non-empty line. */
function stageFor(kindId: string, content: string, answerId: string) {
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
  state.staged = { effects, warnings };
  persist();
}

export function answer(questionId: string, content: string) {
  const q = QUESTIONS.find((q) => q.id === questionId)!;
  const a: Answer = { id: `a-${Date.now()}`, questionId, content, at: Date.now() };
  state.answers.push(a);
  stageFor(q.produces, content, a.id);
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
  stageFor(f.produces, content, a.id);
}
export function removeFollowUp(id: string) {
  const kill = new Set<string>(); const walk = (x: string) => { kill.add(x); followUpsOf(x).forEach((c) => walk(c.id)); }; walk(id);
  state.followups = state.followups.filter((f) => !kill.has(f.id)); persist();
}

/** Escape hatch (flow Q5): apply effects as one immediate commit, bypassing review. Used by the glossary. */
export function directCommit(effects: Effect[], label: string) {
  const before = clone(state.graph);
  for (const e of effects) {
    if (e.op === 'add-node') state.graph.nodes.push({ ...e.node, status: 'committed' });
    else if (e.op === 'update-node') { const n = nodeById(e.nodeId); if (n) Object.assign(n, e.patch, { status: 'committed' }); }
    else if (e.op === 'remove-node') { state.graph.nodes = state.graph.nodes.filter((n) => n.id !== e.nodeId); state.graph.edges = state.graph.edges.filter((x) => x.src !== e.nodeId && x.dst !== e.nodeId); }
    else if (e.op === 'add-edge') state.graph.edges.push({ ...e.edge, status: 'committed' });
  }
  state.commits.push({ id: `c-${Date.now()}`, at: Date.now(), effects, before, label });
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

export function commit(acceptedIds: Set<string>) {
  if (!state.staged) return;
  const accepted = state.staged.effects.filter((e) => acceptedIds.has(e.id));
  const before = clone(state.graph);
  const addedNodeIds = new Set<string>();
  for (const e of accepted) {
    if (e.op === 'add-node') { state.graph.nodes.push({ ...e.node, status: 'committed' }); addedNodeIds.add(e.node.id); }
    else if (e.op === 'update-node') { const n = nodeById(e.nodeId); if (n) Object.assign(n, e.patch, { status: 'committed' }); }
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
  persist();
  return { applied: accepted.length, skipped };
}

export function undo() {
  const c = state.commits.pop();
  if (!c) return;
  state.graph = c.before;
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
