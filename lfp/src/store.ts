import { reactive, computed } from 'vue';
import seed from './graph.json';
import reality from './reality.json';
import { QUESTIONS, kindById, edgeTypeById, SPACES } from './kernel';
import { checkInvariants, contentHash, repairOf, actOf, type Repair } from './checks.ts';
import { groupViolations } from './consolidate.ts';
import { endpoints, linkRulesFor } from './ai/links.ts';
import type { Node, Graph, ScreenItem, Answer, AICall, Effect, Changeset, Commit, FollowUp, OpenItem, ViolationGroup } from './types';

export type { Status, Node, Edge, Graph, ScreenItem, Answer, AICall, Effect, Changeset, Commit, FollowUp, Violation, OpenItem, ViolationGroup } from './types';

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
  // System One (v4.3): orthogonal to aiRuntime — classification decisions go to Jev whenever a
  // System One client is on the bus (`system1Ready`, set by the server's system1-ready message)
  // and the user hasn't switched it off. Free-text generation still follows aiRuntime.
  system1: true,
  system1Ready: false,
  system1Mode: 'off' as 'live' | 'fake' | 'off',
  domainLevel: 0 as 0 | 1 | 2 | 3,
  domainModule: null as string | null,
  definitionQuestion: null as string | null,
  // ── screen awareness (S110-115): what the active view is showing, for the Talk panel ──
  screen: { view: '', params: {} as Record<string, string>, items: [] as ScreenItem[] },
  panelOpen: true,
  // Persisted. The agent server keys its Flue conversation on this (snapshot.sessionId), so a reset
  // graph gets a fresh agent memory (found in session 2026-09-28: it remembered the wiped design).
  sessionId: '',
});

/** `s-<base36 time>-<4 random>`: a new design session (hydrate when missing, resetToSeed). */
export const newSessionId = () => `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function clone<T>(x: T): T { return JSON.parse(JSON.stringify(x)); }

/** The shape of src/reality.json (v4.3 adds `matches`/`decisions` — System One's caches, written
 * by scripts/observe.mjs, read here and by checks.ts::checkInvariants). */
export interface RealityFile {
  results: Record<string, { status: string; value?: string; threshold?: string; confidence?: string; at?: string; codeRef?: string }>;
  verdicts?: Record<string, { verdict: 'serves-intent' | 'overfits' | 'unclear'; reasons: string[]; at: string; scopeOk?: boolean }>;
  metrics: Record<string, { value: string; at: string }>;
  /** contentHash(condition line) -> testId -> noul probability the test verifies the rule. */
  matches?: Record<string, Record<string, number>>;
  /** decision id -> key -> a recorded System One cross-check vs. what the code decided. */
  decisions?: Record<string, Record<string, { value: unknown; confidence: number; agreedWithCode: boolean; at: string }>>;
  /** taskId -> the question `scripts/dispatch.mjs`'s ask-or-act gate raised instead of a work order (v4.3). */
  raised?: Record<string, { raisedBy: { kind: 'agent'; ref: string }; prompt: string; options?: string[]; at: string }>;
}

/** Merge `reality.json`'s observed test results onto the `test-result` node that `reports` each
 * test. Never creates nodes — only patches props of ones that already exist. */
function applyReality() {
  const r = reality as RealityFile;
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
  // task lifecycle gate (v4.2, S152): a recorded verdict drives done → verified/blocked, and is
  // always shown on the task via props.verdict, whether or not it moves the status.
  for (const [taskId, verdict] of Object.entries(r.verdicts ?? {})) {
    const task = nodeById(taskId);
    if (!task || task.kind !== 'task') continue;
    task.props = { ...task.props, verdict: verdict.verdict };
    const targets = state.graph.edges.filter((e) => e.type === 'targets' && e.src === taskId).map((e) => nodeById(e.dst)).filter(Boolean) as Node[];
    const allGreen = targets.length > 0 && targets.every((t) => {
      const repEdge = state.graph.edges.find((e) => e.type === 'reports' && e.dst === t.id);
      return !!repEdge && repEdge.trace !== 'suspect' && nodeById(repEdge.src)?.props?.status === 'pass';
    });
    if (verdict.verdict === 'serves-intent' && allGreen) task.props.status = 'verified';
    else if (verdict.verdict === 'overfits' || verdict.verdict === 'unclear') task.props.status = 'blocked';
  }
  // ask-or-act gate (v4.3, AGENT-RUNTIME.md §9): a question dispatch.mjs raised on disk becomes the
  // same agent-raised follow-up the `raise` cue would have made — once, keyed by task + prompt.
  for (const [taskId, raised] of Object.entries(r.raised ?? {})) {
    const task = nodeById(taskId);
    if (!task || task.kind !== 'task') continue;
    if (state.followups.some((f) => f.raisedBy?.kind === 'agent' && f.raisedBy.ref === taskId && f.prompt === raised.prompt)) continue;
    const parentId = QUESTIONS.find((q) => q.produces === 'task')?.id ?? 'q-capability';
    const f: FollowUp = { id: `f-raised-${taskId}`, parentId, prompt: raised.prompt, kind: 'thread', produces: 'task', answerIds: [], createdAt: Date.parse(raised.at) || Date.now(), options: raised.options };
    f.raisedBy = raised.raisedBy; f.subjects = [taskId];
    state.followups.push(f);
    task.props = { ...task.props, status: 'blocked' };
  }
}

export function hydrate() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      state.graph = s.graph; state.answers = s.answers ?? []; state.commits = s.commits ?? []; state.staged = s.staged ?? null; state.followups = s.followups ?? []; state.aiCalls = s.aiCalls ?? []; state.sessionId = s.sessionId ?? '';
    } else {
      state.graph = clone(seed as Graph);
    }
  } catch { state.graph = clone(seed as Graph); }
  if (!state.sessionId) state.sessionId = newSessionId();
  // lazy hash init for nodes seeded/loaded without one — never bumps v, just gives revalidate() a baseline
  for (const n of state.graph.nodes) if (!n.hash) n.hash = contentHash(n);
  applyReality();
  syncRaised();
  state.hydrated = true;
}

export function persist() {
  const { graph, answers, commits, staged, followups, aiCalls, sessionId } = state;
  localStorage.setItem(KEY, JSON.stringify({ graph, answers, commits, staged, followups, aiCalls, sessionId }));
}

export function resetToSeed() {
  state.graph = clone(seed as Graph); state.answers = []; state.commits = []; state.staged = null; state.selectedId = null; state.followups = []; state.aiCalls = [];
  state.sessionId = newSessionId(); state.transcript = []; state.say = null; state.ask = null;
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

/** Items in one answer: newline or " / " separated (the Talk input is single-line, so " / " is the
 * only way to give several there — found in session 2026-09-28). Trimmed, empties dropped. */
export const splitItems = (content: string) => content.split(/\n|\s\/\s/).map((l) => l.trim()).filter(Boolean);

/** Low-fi effect mapping: singular kinds → one add/update; otherwise one node per item (splitItems).
 * Pure (no state mutation) so AI functions (`ai/functions/answer-to-effects.ts`) can reuse it as
 * their stub's core logic and renumber the effect ids against their own `callId`. */
export function stageFor(kindId: string, content: string, answerId: string): Changeset {
  const kind = kindById[kindId];
  const taken = new Set(state.graph.nodes.map((n) => n.id));
  const effects: Effect[] = []; const warnings: string[] = [];
  const lines = splitItems(content);
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
/** The kernel checks as the store sees them: reality's System One matches, and the template
 * questions answered so far (a need waits for the question that produces its kind). */
function currentViolations() {
  return checkInvariants(state.graph, { matches: (reality as RealityFile).matches ?? {} }, { answered: state.answers.map((a) => a.questionId) });
}

/** The repairs of the violations a violation-raised follow-up is about: its own violation and,
 * for a consolidated parent, every covered one (checks.ts::repairOf). */
function repairsOf(f: FollowUp): Repair[] {
  const vids = new Set([...(f.raisedBy?.kind === 'violation' ? [f.raisedBy.ref] : []), ...(f.covers ?? [])]);
  return currentViolations().filter((v) => vids.has(v.id)).map((v) => repairOf(v, state.graph)).filter((r): r is Repair => !!r);
}

/** Need repair (v4.4), answered in code for every violation-raised follow-up (orphans, needs, a
 * rule condition's test …); the option semantics live in checks.ts::OPTION_ACTS:
 * - `defer` (Leave as a stub, Mark as intentionally absent for now, Defer …) → 'defer';
 * - `remove` (Remove it, Remove the test, Retire the protocol) → a remove-node per subject;
 * - `link`/`add` on the bare label, or titles that match nothing and may not add → a hint:
 *   nothing answered, nothing staged, the user names the node instead;
 * - a repair label with no act (Revalidate, Accept without review …) → recorded, nothing staged;
 * - otherwise each item (splitItems) that is an existing title of a needed kind (any case) stages
 *   the need's edge from every subject whose rule targets that kind; an item matching no title adds
 *   a node of the needed kind AND its edge(s) in the same changeset, when the repair may add (a need
 *   may, an orphan only links). A node is never staged alone.
 * `null`: not a violation-raised follow-up — stage as a normal answer (stageFor). */
function needRepair(f: FollowUp, content: string, answerId: string): Changeset | 'defer' | 'noted' | { hint: string } | null {
  if (f.raisedBy?.kind === 'link') return linkRepair(f, content, answerId);
  if (f.raisedBy?.kind !== 'violation') return null;
  const act = actOf(content);
  if (act === 'defer') return 'defer';
  if (act === 'noted') return 'noted';
  const repairs = repairsOf(f);
  if (act === 'remove') {
    const ids = [...new Set(repairs.length ? repairs.map((r) => r.subject) : (f.subjects ?? []).filter((id) => nodeById(id)))];
    return { effects: ids.map((id, i): Effect => ({ id: `ef-${i}`, op: 'remove-node', nodeId: id, answerId })), warnings: [] };
  }
  const need = repairs.flatMap((r) => r.rules.map((rule) => rule.target))[0];
  const hint = `Name the ${need ? kindById[need]?.label.toLowerCase() ?? need : 'node'}: pick one of the titles${repairs.some((r) => r.add) ? ', or type a new one to add it linked' : ''}.`;
  if (act === 'link' || act === 'add') return { hint };
  if (!repairs.length) return 'noted';
  return stageLinks(repairs, content, answerId, hint);
}

/** The staging half of need repair: each item naming an existing node of a repair's target kind
 * (restricted to `pool` when given) stages the rule's edge from each subject; a new title adds a
 * node when a repair may add. Shared by violation and link follow-ups. */
function stageLinks(repairs: Repair[], content: string, answerId: string, hint: string, pool?: Node[]): Changeset | { hint: string } {
  const key = (src: string, type: string, dst: string) => `${src}|${type}|${dst}`;
  const have = new Set(state.graph.edges.map((e) => key(e.src, e.type, e.dst)));
  const taken = new Set(state.graph.nodes.map((n) => n.id));
  const effects: Effect[] = []; const warnings: string[] = [];
  const link = (r: Repair, targetId: string, targetKind: string) => {
    for (const rule of r.rules) {
      if (rule.target !== targetKind || targetId === r.subject) continue;
      const { src, dst } = endpoints(rule, r.subject, targetId);
      if (have.has(key(src, rule.edge, dst))) continue;
      have.add(key(src, rule.edge, dst));
      effects.push({ id: `ef-${effects.length}`, op: 'add-edge', edge: { id: `e-${src}-${rule.edge}-${dst}`, src, dst, type: rule.edge, status: 'draft', answerId }, answerId });
    }
  };
  const targets = new Set(repairs.flatMap((r) => r.rules.map((rule) => rule.target)));
  for (const item of splitItems(content)) {
    const hits = (pool ?? state.graph.nodes).filter((c) => targets.has(c.kind) && c.title.toLowerCase() === item.toLowerCase());
    if (hits.length) { for (const c of hits) for (const r of repairs) link(r, c.id, c.kind); continue; }
    const adders = repairs.filter((r) => r.add && r.rules.length);
    if (!adders.length) { warnings.push(`"${item}" matches no candidate; skipped.`); continue; }
    const kind = adders[0].rules[0].target;
    const props = adders.length === 1 ? adders[0].props : undefined;
    const node: Node = { id: uniqueId(`${kind}-${kebab(item)}`, taken), kind, title: item, status: 'draft', answerId, ...(props ? { props } : {}) };
    effects.push({ id: `ef-${effects.length}`, op: 'add-node', node, answerId });
    for (const r of adders) link(r, node.id, kind);
  }
  if (!effects.length) return warnings.length ? { hint: `${warnings.join(' ')} ${hint}` } : { effects, warnings: ['Nothing to stage: already linked.'] };
  return { effects, warnings };
}

// ── link follow-ups (v4.5): link-answer's uncertain pairs, asked ────────────────────────────────
// link-answer (ai/functions/link-answer.ts) leaves a pair uncertain when Jev is unsure (or the stub
// sees 2+ candidates). Each uncertain node gets ONE follow-up `f-link-<nodeId>` (raisedBy 'link'),
// raised once the node is committed: 'Does "<title>" relate to any of these?', options = the
// uncertain candidates' titles + "None of these". One pick answers it (the simpler of the two
// designs — options are single clicks, no multi-select): a title stages that edge through the need
// repair path; typing several titles separated by " / " stages each; "None of these" (or "Done")
// answers it with nothing staged. subjects = [node, ...candidates]. Dropped (unanswered) when the
// node is removed, gets an edge to one of the candidates, or no candidate is left (syncRaised).
export const LINK_NONE = 'None of these';
/** answerId → nodeId → uncertain candidate ids, for nodes still in the staged changeset. */
const pendingLinks = new Map<string, Record<string, string[]>>();
const linkedTo = (a: string, b: string) => state.graph.edges.some((e) => (e.src === a && e.dst === b) || (e.src === b && e.dst === a));
const linkCandidates = (f: FollowUp) => (f.subjects ?? []).slice(1).map(nodeById).filter((c): c is Node => !!c);

function raiseLink(nodeId: string, candidateIds: string[]) {
  const node = nodeById(nodeId);
  const id = `f-link-${nodeId}`;
  if (!node || state.followups.some((f) => f.id === id)) return;
  const cands = candidateIds.map(nodeById).filter((c): c is Node => !!c);
  if (!cands.length || cands.some((c) => linkedTo(nodeId, c.id))) return; // already answered by an edge
  state.followups.push({
    id, parentId: parentFor([nodeId]), kind: 'thread', produces: cands[0].kind, answerIds: [], createdAt: Date.now(),
    prompt: `Does "${node.title}" relate to any of these? Pick the one that applies.`,
    raisedBy: { kind: 'link', ref: nodeId }, subjects: [nodeId, ...cands.map((c) => c.id)],
    options: [...new Set(cands.map((c) => c.title)), LINK_NONE],
  });
}

/** link-answer's `uncertain`, handed over from its toCues: a committed node is asked now (the user
 * committed before Jev answered); a staged one waits for commit(). */
export function noteUncertain(answerId: string, uncertain: Record<string, string[]>) {
  const later: Record<string, string[]> = {};
  for (const [nodeId, cands] of Object.entries(uncertain)) {
    if (!cands.length) continue;
    if (nodeById(nodeId)?.status === 'committed') raiseLink(nodeId, cands); else later[nodeId] = cands;
  }
  if (Object.keys(later).length) pendingLinks.set(answerId, { ...pendingLinks.get(answerId), ...later });
  persist();
}

function linkRepair(f: FollowUp, content: string, answerId: string): Changeset | 'defer' | 'noted' | { hint: string } {
  const said = content.trim().toLowerCase();
  if (said === LINK_NONE.toLowerCase() || said === 'done') return 'noted';
  if (actOf(content) === 'defer') return 'defer';
  const node = nodeById(f.raisedBy!.ref);
  const pool = linkCandidates(f);
  if (!node || !pool.length) return 'noted';
  const kinds = new Set(pool.map((c) => c.kind));
  const repair: Repair = { subject: node.id, rules: linkRulesFor(node.kind).filter((r) => kinds.has(r.target)), add: false };
  return stageLinks([repair], content, answerId, `Pick one of the titles, or "${LINK_NONE}".`, pool);
}

export function answerFollowUp(followUpId: string, content: string) {
  const f = state.followups.find((f) => f.id === followUpId)!;
  const a: Answer = { id: `a-${Date.now()}`, questionId: followUpId, content, at: Date.now() };
  const repair = needRepair(f, content, a.id);
  // a deferral is the Now strip's Skip: deferred, nothing answered, nothing staged
  if (repair === 'defer') { f.deferred = true; persist(); return; }
  // a bare "Add one"/"Link …" or a title that matches nothing: nothing answered, say what to type
  if (typeof repair === 'object' && repair && 'hint' in repair) { state.staged = { effects: [], warnings: [repair.hint] }; persist(); return; }
  state.answers.push(a); f.answerIds.push(a.id);
  // a consolidated follow-up's answer also answers every violation it covers (child follow-ups
  // created by syncRaised() as `f-<violationId>`) so tier 3 doesn't re-surface them individually.
  for (const vid of f.covers ?? []) {
    const child = state.followups.find((c) => c.id === `f-${vid}`);
    if (child && !child.answerIds.includes(a.id)) child.answerIds.push(a.id);
  }
  state.staged = repair === 'noted' ? null : repair ?? stageFor(f.produces, content, a.id);
  persist();
}
/** Replace a follow-up's prompt (and, if given, its options) — used by the `refine` cue after
 * `consolidate-questions` rewrites a consolidated group's message as one broader question. */
export function refineFollowUp(id: string, prompt: string, options?: string[]) {
  const f = state.followups.find((f) => f.id === id);
  if (!f) return;
  f.prompt = prompt;
  if (options) f.options = options;
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

/** Derive open violation-raised follow-ups from `checkInvariants`, consolidated via
 * `consolidate.ts::groupViolations`: one parent follow-up per group (`f-<group.id>`), plus — for
 * groups of more than one violation — one child follow-up per member violation (`f-<violationId>`,
 * `parentId` = the group's parent) so `rankOpen()` can hide them while the parent is open and
 * `answerFollowUp` can answer them together with it. Removes unanswered follow-ups whose group or
 * violation no longer exists; regenerates an unanswered parent's prompt/subjects/covers when its
 * group's membership changes. An answered follow-up (`answerIds.length > 0`) always stays.
 * Call after hydrate/commit/directCommit/undo/revalidate. */
export function syncRaised() {
  const violations = currentViolations().filter((v) => v.raise === 'question');
  const groups = groupViolations(violations, state.graph);
  const groupById = new Map<string, ViolationGroup>(groups.map((g) => [g.id, g]));
  const violationIds = new Set(violations.map((v) => v.id));

  state.followups = state.followups.filter((f) => {
    if (f.raisedBy?.kind === 'link') {
      if (f.answerIds.length > 0) return true;
      const cands = linkCandidates(f);
      return !!nodeById(f.raisedBy.ref) && cands.length > 0 && !cands.some((c) => linkedTo(f.raisedBy!.ref, c.id));
    }
    if (f.raisedBy?.kind !== 'violation') return true;
    if (f.answerIds.length > 0) return true;
    const ref = f.raisedBy.ref;
    return groupById.has(ref) || violationIds.has(ref);
  });

  const existingParents = new Map(
    state.followups
      .filter((f) => f.raisedBy?.kind === 'violation' && groupById.has(f.raisedBy!.ref))
      .map((f) => [f.raisedBy!.ref, f] as const),
  );
  const existingChildIds = new Set(
    state.followups
      .filter((f) => f.raisedBy?.kind === 'violation' && violationIds.has(f.raisedBy!.ref))
      .map((f) => f.raisedBy!.ref),
  );

  for (const g of groups) {
    let parent = existingParents.get(g.id);
    if (!parent) {
      const parentId = parentFor(g.subjects);
      parent = {
        id: `f-${g.id}`,
        parentId,
        prompt: g.message,
        kind: 'thread',
        produces: g.produces ?? QUESTIONS.find((q) => q.id === parentId)?.produces ?? 'context',
        answerIds: [],
        createdAt: Date.now(),
        raisedBy: { kind: 'violation', ref: g.id },
        subjects: g.subjects,
        covers: g.violationIds,
      };
      state.followups.push(parent);
    } else if (parent.answerIds.length === 0 && (parent.covers ?? []).join('|') !== g.violationIds.join('|')) {
      // membership changed: regenerate; an unchanged group keeps a refined prompt (consolidate-questions)
      parent.prompt = g.message;
      parent.subjects = g.subjects;
      parent.covers = g.violationIds;
      parent.options = undefined;
    }

    if (g.by === 'single') continue;
    for (const vid of g.violationIds) {
      if (existingChildIds.has(vid)) continue;
      const v = violations.find((v) => v.id === vid)!;
      state.followups.push({
        id: `f-${v.id}`,
        parentId: parent.id,
        prompt: v.message,
        kind: 'thread',
        produces: v.produces ?? parent.produces,
        answerIds: [],
        createdAt: Date.now(),
        raisedBy: { kind: 'violation', ref: v.id },
        subjects: v.subjects,
      });
    }
  }
}

/** Everything open, ranked into four tiers: (1) agent questions blocking a task, (2) the next
 * template question, (3) violation-raised follow-ups (by the first subject's space, then
 * invariant order), (4) the rest — thread follow-ups with no answer yet. Exception (v4.4): a
 * violation follow-up about a node the latest answer committed ranks right after tier 1, ahead of
 * the next template question, so a new bet's link question comes before the next question. Link
 * follow-ups (v4.5) about such a node come right after those (tier 3); older ones are tier 4. */
export function rankOpen(): OpenItem[] {
  const items: OpenItem[] = [];

  for (const f of state.followups) {
    if (f.raisedBy?.kind === 'agent' && f.answerIds.length === 0 && !f.deferred) {
      items.push({ id: f.id, prompt: f.prompt, produces: f.produces, source: 'agent', subjects: f.subjects ?? [], tier: 1, blocking: f.raisedBy.ref });
    }
  }

  const nq = nextQuestion.value;
  const templateAt = items.length;
  if (nq) items.push({ id: nq.id, prompt: nq.prompt, produces: nq.produces, source: 'template', subjects: [], tier: 2 });

  const violations = currentViolations();
  const groups = groupViolations(violations.filter((v) => v.raise === 'question'), state.graph);
  const violationIndex = new Map(violations.map((v, i) => [v.id, i]));
  const violationsById = new Map(violations.map((v) => [v.id, v]));
  const groupById = new Map(groups.map((g) => [g.id, g]));
  // children stay hidden while their consolidated parent is still an open violation follow-up
  const openViolationParentIds = new Set(
    state.followups.filter((f) => f.raisedBy?.kind === 'violation' && f.answerIds.length === 0).map((f) => f.id),
  );
  const tier3 = state.followups
    .filter((f) => f.raisedBy?.kind === 'violation' && f.answerIds.length === 0 && !f.deferred && !openViolationParentIds.has(f.parentId))
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
      options: f.options ?? (f.raisedBy ? (groupById.get(f.raisedBy.ref)?.options ?? violationsById.get(f.raisedBy.ref)?.options) : undefined),
      covers: f.covers?.length,
    }));
  const latest = state.answers.at(-1)?.id;
  const fresh = new Set(latest ? state.graph.nodes.filter((n) => n.answerId === latest && n.status === 'committed').map((n) => n.id) : []);
  const isFresh = (i: OpenItem) => i.subjects.some((id) => fresh.has(id));
  // link follow-ups (v4.5): right after the template question while their node is from the latest
  // committed answer, else tier 4. Hidden while the node's orphans follow-up is open (that one
  // already offers the candidate titles; asking both would ask the same thing twice).
  const orphanAsked = (nodeId: string) => state.followups.some((o) => o.raisedBy?.kind === 'violation' && o.answerIds.length === 0 && !o.deferred
    && (o.raisedBy.ref === `orphans:${nodeId}` || (o.covers ?? []).includes(`orphans:${nodeId}`)));
  const links = state.followups
    .filter((f) => f.raisedBy?.kind === 'link' && f.answerIds.length === 0 && !f.deferred && !orphanAsked(f.raisedBy.ref))
    .map((f) => ({ id: f.id, prompt: f.prompt, produces: f.produces, source: 'link' as const, subjects: f.subjects ?? [], options: f.options, fresh: fresh.has(f.raisedBy!.ref) }));
  const asItem = ({ fresh: isNew, ...i }: (typeof links)[number]): OpenItem => ({ ...i, tier: isNew ? 3 : 4 });
  items.splice(templateAt, 0, ...tier3.filter(isFresh));
  // fresh link questions come right AFTER the template question: live session 9 (2026-09-28) put
  // three of them ahead of it and the chain never moved past q-context.
  items.push(...links.filter((l) => l.fresh).map(asItem));
  items.push(...tier3.filter((i) => !isFresh(i)));

  const tier4 = state.followups
    .filter((f) => f.answerIds.length === 0 && !f.deferred && f.raisedBy?.kind !== 'agent' && f.raisedBy?.kind !== 'violation' && f.raisedBy?.kind !== 'link')
    .map((f) => ({ id: f.id, prompt: f.prompt, produces: f.produces, source: (f.raisedBy?.kind ?? 'template') as OpenItem['source'], subjects: f.subjects ?? [], tier: 4 as const }));
  items.push(...tier4, ...links.filter((l) => !l.fresh).map(asItem));

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

export function discardStaged() { state.staged = null; pendingLinks.clear(); persist(); }

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
  for (const e of accepted) if (e.op === 'add-node') { const c = pendingLinks.get(e.answerId)?.[e.node.id]; if (c) raiseLink(e.node.id, c); }
  pendingLinks.clear();
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
