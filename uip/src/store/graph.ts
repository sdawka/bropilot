// The graph + view store. `useGraph()` returns one shared instance implementing GraphApi (SPEC §10)
// plus the extras WP1's views need (columns, ix, select/pop, lens chips). Refs are real Refs (not a
// Pinia-unwrapped store) so the GraphApi surface types line up for WP2.
import { computed, effectScope, reactive, ref, shallowRef, watch, type ComputedRef, type Ref } from 'vue';
import type { Router, RouteLocationNormalizedLoaded } from 'vue-router';
import { toast } from 'vue-sonner';
import type { Band, CanvasCommand, Changeset, Edge, Effect, Graph, GraphApi, Hop, Node, Perspective, PerspId, ProjectSummary, Status, ViewState } from '../types';
import { flags } from '../flags';
import { PERSPECTIVES, perspById, isPersp, perspLabel, BRIDGE_KINDS, stepsWithKind } from '../perspectives';
import { kindLabel, edgeLabel } from '../ontology';
import { useProjects } from './projects';
import { pickNextHop } from '../s1/hops';
import {
  GIndex, gapSlots, hopQuestion, legalNextHops, openCount, parseSegments, rawItems, resolvePaths, serializeSegments,
  stepItems, unlinked, unmetNeeds, viaToken, type GapSlot, type Item, type Seg,
} from './traverse';

export interface ColItem extends Item { open: number; draft: boolean; suspect: boolean; ghost?: Effect }
export interface Column {
  index: number; stepIndex: number; kinds: string[];
  edges: { edge: string; dir: 'out' | 'in' }[];
  kind: 'root' | 'step' | 'across' | 'raw' | 'derived' | 'floating';
  waypoint: boolean;
  via?: { edge: string; dir?: 'out' | 'in' };
  derived?: { pinned: boolean; pending: boolean; confidence?: number; band?: Band; fake?: boolean; hop?: Hop };
  parentId: string | null; selectedId: string | null;
  items: ColItem[]; gaps: GapSlot[]; unlinked: Node[]; grouped: boolean;
}
export interface LensChip { persp: PerspId; label: string; via?: string; paths: string[][]; bridge?: { edge: string; dir: 'out' | 'in'; nodeId: string } }
type GapCb = (g: { kind: string; parentId: string | null; question: string }) => void;

function create() {
  let router: Router | null = null;
  const project = ref<ProjectSummary | null>(null) as Ref<ProjectSummary | null>;
  const graph = ref<Graph>({ nodes: [], edges: [] }) as Ref<Graph>;
  const view = ref<ViewState>({ project: '', persp: 'domain', path: [] }) as Ref<ViewState>;
  const segments = ref<Seg[]>([]);
  const ready = ref(false);
  const loadingProject = ref<string | null>(null);
  const ghost = ref<Changeset | null>(null) as Ref<Changeset | null>;
  const highlightIds = ref<string[]>([]);
  const filterIds = ref<string[] | null>(null);
  const previewId = ref<string | null>(null);
  const lastMove = ref<{ path: string; source: 'chat' | 'user' } | null>(null);
  const undoStack: string[] = [];
  const viaChoice = reactive<Record<string, string>>({});
  const pinnedHops = reactive<Record<string, Hop>>({});
  const derivedPicks = reactive<Record<string, { hop: Hop; confidence: number; band: Band; fake: boolean } | 'pending'>>({});
  const fixtureChangesets = ref<Changeset[]>([]);
  const changesetSource = shallowRef<(() => Changeset[]) | null>(null);
  const gapListeners = new Set<GapCb>();

  // ── graph, ghosted ────────────────────────────────────────────────────
  const ghostByNode = { value: new Map<string, Effect>() };
  const ghostByEdge = { value: new Map<string, Effect>() };
  const currentQuery = ref<string>('');
  const viewGraph = computed<Graph>(() => {
    const g = graph.value, cs = ghost.value;
    ghostByNode.value.clear(); ghostByEdge.value.clear();
    if (!cs) return g;
    const nodes = g.nodes.map((n) => ({ ...n })), edges = g.edges.map((e) => ({ ...e }));
    const nIdx = new Map(nodes.map((n) => [n.id, n]));
    for (const ef of cs.effects) {
      if (ef.verdict === 'rejected') continue;
      if (ef.op === 'add-node' && ef.node && !nIdx.has(ef.node.id)) { const n = { ...ef.node, status: 'draft' as Status }; nodes.push(n); nIdx.set(n.id, n); ghostByNode.value.set(n.id, ef); }
      else if (ef.op === 'add-edge' && ef.edge && !edges.some((e) => e.id === ef.edge!.id)) { edges.push({ ...ef.edge, status: 'draft' }); ghostByEdge.value.set(ef.edge.id, ef); }
      else if (ef.op === 'update-node' && ef.node && nIdx.has(ef.node.id)) { Object.assign(nIdx.get(ef.node.id)!, ef.node, { status: 'draft' }); ghostByNode.value.set(ef.node.id, ef); }
      else if (ef.op === 'remove-edge' && ef.edge) { const e = edges.find((x) => x.id === ef.edge!.id || (x.src === ef.edge!.src && x.dst === ef.edge!.dst && x.type === ef.edge!.type)); if (e) { e.trace = 'suspect'; ghostByEdge.value.set(e.id, ef); } }
      else if (ef.op === 'remove-node' && ef.node) ghostByNode.value.set(ef.node.id, ef);
    }
    return { nodes, edges };
  });
  const ix = computed(() => new GIndex(viewGraph.value));
  const byId = (id: string) => ix.value.get(id);
  const neighbours = (id: string) => ix.value.neighbours(id);
  const selection: ComputedRef<Node | null> = computed(() => {
    const last = segments.value[segments.value.length - 1];
    return (last && ix.value.get(last.id)) || null;
  });
  const persp = computed<Perspective | null>(() => (view.value.persp === 'raw' ? null : perspById[view.value.persp]));
  const chainless = computed(() => !persp.value || flags.persp === 'raw');

  // ── columns ───────────────────────────────────────────────────────────
  function decorate(items: Item[]): ColItem[] {
    const ib = ix.value, gn = ghostByNode.value, ge = ghostByEdge.value;
    return items.map((it) => ({
      ...it, open: openCount(ib, it.node), draft: it.node.status === 'draft' || it.edge?.status === 'draft',
      suspect: it.edge?.trace === 'suspect', ghost: gn.get(it.node.id) ?? (it.edge ? ge.get(it.edge.id) : undefined),
    }));
  }
  const byTitle = (a: Item, b: Item) => a.node.title.localeCompare(b.node.title);
  function base(index: number, parentId: string | null, over: Partial<Column>): Column {
    return { index, stepIndex: -1, kinds: [], edges: [], kind: 'step', waypoint: false, parentId, selectedId: null, items: [], gaps: [], unlinked: [], grouped: false, ...over };
  }
  function stepFor(kindId: string, after: number): number {
    const p = persp.value; if (!p) return -1;
    const idx = stepsWithKind(p, kindId);
    return idx.find((i) => i > after) ?? idx[0] ?? -1;
  }
  const columns = computed<Column[]>(() => {
    const ib = ix.value, segs = segments.value, p = persp.value;
    if (!ib.nodes.size) return [];
    const cols: Column[] = [];
    // root
    const first = segs[0] ? ib.get(segs[0].id) : undefined;
    if (!p) {
      const order = (k: string) => PERSPECTIVES.findIndex((x) => x.steps[0].kinds.includes(k));
      const items = [...ib.graph.nodes].map((node) => ({ node, group: kindLabel(node.kind, 2) }))
        .sort((a, b) => ((order(a.node.kind) + 99) % 99) - ((order(b.node.kind) + 99) % 99) || a.group.localeCompare(b.group) || byTitle(a, b));
      cols.push(base(0, null, { kind: 'root', kinds: [], items: decorate(items), grouped: true }));
    } else if (first && !p.steps[0].kinds.includes(first.kind)) {
      cols.push(base(0, null, { kind: 'floating', stepIndex: stepFor(first.kind, -1), kinds: [first.kind], items: decorate([{ node: first }]) }));
    } else {
      cols.push(base(0, null, { kind: 'root', stepIndex: 0, kinds: p.steps[0].kinds, items: decorate(ib.ofKinds(p.steps[0].kinds).map((node) => ({ node })).sort(byTitle)) }));
    }
    for (let i = 0; i < segs.length; i++) {
      const col = cols[i];
      col.selectedId = segs[i].id;
      const parent = ib.get(segs[i].id);
      if (!parent) break;
      const nxt = segs[i + 1];
      let c: Column | null = null;
      if (nxt?.via) {
        const items = ib.via(parent.id, nxt.via.edge, nxt.via.dir).map((nb) => ({ node: nb.other, edge: nb.edge, dir: nb.dir }));
        const target = ib.get(nxt.id);
        const kinds = [...new Set(items.map((x) => x.node.kind))];
        const dirs = [...new Set(items.map((x) => x.dir!))];
        const kindOf: Column['kind'] = flags.persp === 'derived' && !chainless.value ? 'derived' : 'across';
        c = base(i + 1, parent.id, { kind: kindOf, via: nxt.via, kinds, edges: dirs.map((d) => ({ edge: nxt.via!.edge, dir: d })),
          stepIndex: target && !chainless.value ? stepFor(target.kind, col.stepIndex) : -1, items: decorate(items.sort(byTitle)),
          derived: kindOf === 'derived' ? { pinned: !!pinnedHops[parent.kind], pending: false } : undefined });
      } else if (chainless.value) {
        const items = rawItems(ib, parent.id);
        c = base(i + 1, parent.id, { kind: 'raw', kinds: [...new Set(items.map((x) => x.node.kind))], items: decorate(items), grouped: true,
          gaps: unmetNeeds(ib, parent).map((u) => ({ kind: u.produces, parentId: parent.id, question: u.question })) });
      } else if (flags.persp === 'derived' && !nxt) {
        const pinned = pinnedHops[parent.kind];
        const pick = derivedPicks[parent.id];
        const hop = pinned ?? (pick && pick !== 'pending' ? pick.hop : undefined);
        if (!hop) c = base(i + 1, parent.id, { kind: 'derived', derived: { pinned: false, pending: true } });
        else {
          const items = ib.via(parent.id, hop.edge, hop.dir).map((nb) => ({ node: nb.other, edge: nb.edge, dir: nb.dir }));
          const kinds = [...new Set(items.map((x) => x.node.kind))];
          c = base(i + 1, parent.id, { kind: 'derived', via: { edge: hop.edge, dir: hop.dir }, kinds, edges: [{ edge: hop.edge, dir: hop.dir }], items: decorate(items.sort(byTitle)),
            derived: { pinned: !!pinned, pending: false, hop, ...(pick && pick !== 'pending' && !pinned ? { confidence: pick.confidence, band: pick.band, fake: pick.fake } : {}) },
            gaps: items.length ? [] : [{ kind: kinds[0] ?? '', parentId: parent.id, question: hopQuestion(parent, hop, kinds.length ? kinds : ['node']) }] });
        }
      } else if (p && col.stepIndex >= 0) {
        const si = col.stepIndex + 1;
        if (si < p.steps.length) {
          const step = p.steps[si];
          const items = stepItems(ib, step, parent);
          const edges = step.via.filter((h) => h.from === parent.kind).map((h) => ({ edge: h.edge, dir: h.dir }));
          c = base(i + 1, parent.id, { kind: 'step', stepIndex: si, kinds: step.kinds, edges, waypoint: !!step.waypoint, items: decorate(items.sort(byTitle)),
            gaps: gapSlots(ib, step, parent), unlinked: unlinked(ib, p, si) });
        }
      } else {
        const items = rawItems(ib, parent.id);
        c = base(i + 1, parent.id, { kind: 'raw', kinds: [...new Set(items.map((x) => x.node.kind))], items: decorate(items), grouped: true });
      }
      if (!c) break;
      cols.push(c);
    }
    // filters: ?q= narrows the last column; a chat 'filter' command narrows every column (selection kept)
    const q = (currentQuery.value ?? '').toLowerCase().trim();
    const keep = filterIds.value ? new Set(filterIds.value) : null;
    cols.forEach((c, k) => {
      if (keep) c.items = c.items.filter((it) => keep.has(it.node.id) || it.node.id === c.selectedId);
      if (q && k === cols.length - 1) c.items = c.items.filter((it) => it.node.title.toLowerCase().includes(q) || it.node.kind.includes(q));
    });
    return cols;
  });

  // derived: ask S1 for the next hop of the selection when no pick exists
  watch([selection, () => flags.persp, () => view.value.persp], async ([sel]) => {
    if (!sel || flags.persp !== 'derived' || view.value.persp === 'raw') return;
    if (pinnedHops[sel.kind] || derivedPicks[sel.id]) return;
    const segs = segments.value, last = segs[segs.length - 1];
    const options = legalNextHops(ix.value, sel, last?.via?.dir ? { edge: last.via.edge, dir: last.via.dir } : undefined);
    if (!options.length) return;
    derivedPicks[sel.id] = 'pending';
    try {
      const r = await pickNextHop({ kind: sel.kind, pathTitles: segs.map((s) => ix.value.get(s.id)?.title ?? s.id), options });
      derivedPicks[sel.id] = r;
    } catch { derivedPicks[sel.id] = { hop: options[0], confidence: 0.2, band: 'ask', fake: true }; }
  }, { immediate: true });
  function pinHop(kindId: string, hop: Hop) { pinnedHops[kindId] = hop; toast(`Pinned ${edgeLabel(hop.edge)} ${hop.dir === 'out' ? '→' : '←'} for every ${kindLabel(kindId)}`); }
  function unpinHop(kindId: string) { delete pinnedHops[kindId]; }
  function repickHop(nodeId: string, hop: Hop) { const n = ix.value.get(nodeId); if (!n) return; derivedPicks[nodeId] = { hop, confidence: 1, band: 'act', fake: false }; }

  // ── re-root ───────────────────────────────────────────────────────────
  function pathsFor(p: PerspId, id: string): string[][] {
    if (p === 'raw') return ix.value.get(id) ? [[id]] : [];
    return resolvePaths(ix.value, perspById[p], id);
  }
  function resolvePath(p: PerspId, id: string): string[] | null {
    const paths = pathsFor(p, id);
    if (!paths.length) return null;
    const via = viaChoice[`${p}:${id}`];
    return (via && paths.find((x) => x[x.length - 2] === via)) || paths[0];
  }
  function rememberVia(p: PerspId, id: string, parentId: string) { viaChoice[`${p}:${id}`] = parentId; }
  const hasVia = (p: PerspId, id: string) => !!viaChoice[`${p}:${id}`];
  /** Lens chips for a node: every other perspective whose chain has this kind, or one bridge edge away. */
  function lensChips(id: string): LensChip[] {
    const n = ix.value.get(id); if (!n) return [];
    const out: LensChip[] = [];
    for (const p of PERSPECTIVES) {
      if (p.id === view.value.persp) continue;
      const paths = pathsFor(p.id, id);
      if (paths.length) {
        const par = paths[0].length > 1 ? ix.value.get(paths[0][paths[0].length - 2]) : undefined;
        out.push({ persp: p.id, label: p.label, via: par ? `${kindLabel(par.kind).toLowerCase()} ${par.title}` : undefined, paths });
        continue;
      }
      // one bridge edge away
      for (const nb of ix.value.neighbours(id)) {
        if (!BRIDGE_KINDS.has(nb.other.kind) && !BRIDGE_KINDS.has(n.kind)) continue;
        const ps = pathsFor(p.id, nb.other.id);
        if (ps.length) { out.push({ persp: p.id, label: p.label, via: `${kindLabel(nb.other.kind).toLowerCase()} ${nb.other.title}`, paths: ps, bridge: { edge: nb.edge.type, dir: nb.dir === 'out' ? 'in' : 'out', nodeId: nb.other.id } }); break; }
      }
    }
    return out;
  }

  // ── navigation ────────────────────────────────────────────────────────
  function buildUrl(p: PerspId, segs: Seg[] | string[], project = view.value.project) {
    const parts = typeof segs[0] === 'string' || !segs.length ? (segs as string[]) : serializeSegments(segs as Seg[]);
    return `/p/${project}/${p}${parts.length ? '/' + parts.map(encodeURIComponent).join('/') : ''}`;
  }
  function withQuery(path: string) {
    const ff = new URLSearchParams(location.search).get('ff');
    return { path, query: ff ? { ff } : {}, hash: location.hash };
  }
  function go(p: PerspId, segs: Seg[] | string[], opts: { source?: 'chat' | 'user'; replace?: boolean; undoable?: boolean } = {}) {
    if (!router) return;
    const url = buildUrl(p, segs);
    if (opts.undoable) undoStack.push(router.currentRoute.value.fullPath);
    lastMove.value = { path: url, source: opts.source ?? 'user' };
    const loc = withQuery(url);
    return opts.replace ? router.replace(loc) : router.push(loc);
  }
  /** Select `id` in column `colIndex` (drops everything right of it). */
  function select(colIndex: number, id: string, replace = false) {
    const col = columns.value[colIndex];
    const segs = segments.value.slice(0, colIndex);
    const via = col?.via;
    segs.push(via ? { id, via } : { id });
    return go(view.value.persp, segs, { replace });
  }
  /** Push an across hop from the selection (node pane, canvas). */
  function across(edge: string, id: string, dir?: 'out' | 'in') {
    const segs = [...segments.value, { id, via: { edge, dir } }];
    return go(view.value.persp, segs);
  }
  function popTo(colIndex: number) { return go(view.value.persp, segments.value.slice(0, colIndex)); }
  function up() { if (segments.value.length) return popTo(segments.value.length - 1); }
  function switchPersp(target: PerspId, chosenPath?: string[]) {
    const sel = selection.value;
    if (!sel) return go(target, []);
    if (chosenPath) { if (chosenPath.length > 1) rememberVia(target, sel.id, chosenPath[chosenPath.length - 2]); return go(target, chosenPath); }
    const path = resolvePath(target, sel.id);
    if (path) return go(target, path);
    toast(`${sel.title} is not on the ${perspLabel(target)} chain`, { description: 'Pinned as a floating first column.' });
    return go(target, [sel.id]);
  }

  // ── commands from chat (CanvasCommand) ────────────────────────────────
  function focusPathFor(id: string): { persp: PerspId; path: string[] } {
    const cur = view.value.persp;
    const p1 = resolvePath(cur, id);
    if (p1) return { persp: cur, path: p1 };
    for (const p of PERSPECTIVES) { const x = resolvePath(p.id, id); if (x) return { persp: p.id, path: x }; }
    return { persp: cur, path: [id] };
  }
  function moveToast(title: string) {
    toast(`Moved to ${title}`, { action: { label: 'Undo', onClick: () => undo() }, duration: 5000 });
  }
  function dispatch(cmd: CanvasCommand) {
    switch (cmd.verb) {
      case 'focus': {
        const n = ix.value.get(cmd.id); if (!n) return;
        const t = focusPathFor(cmd.id);
        previewId.value = null;
        go(t.persp, t.path, { source: 'chat', undoable: true }); moveToast(n.title); return;
      }
      case 'trail': {
        if (!isPersp(cmd.persp)) return;
        const last = cmd.path[cmd.path.length - 1];
        go(cmd.persp, cmd.path, { source: 'chat', undoable: true });
        moveToast(ix.value.get(last)?.title ?? perspLabel(cmd.persp)); return;
      }
      case 'filter': filterIds.value = cmd.ids.length ? [...cmd.ids] : null; return;
      case 'ghost': {
        const cs = allChangesets().find((c) => c.id === cmd.changesetId) ?? null;
        ghost.value = cs; if (!cs) toast(`Changeset ${cmd.changesetId} not found`); return;
      }
      case 'preview': previewId.value = cmd.id; return;
      case 'highlight': highlightIds.value = [...cmd.ids]; return;
      case 'clear': filterIds.value = null; highlightIds.value = []; previewId.value = null; ghost.value = null; return;
    }
  }
  function confirmPreview() { const id = previewId.value; if (id) dispatch({ verb: 'focus', id }); }
  function undo() {
    const prev = undoStack.pop();
    if (!prev || !router) { toast('Nothing to undo'); return; }
    lastMove.value = { path: prev, source: 'user' };
    router.push(prev);
  }

  // ── changesets ────────────────────────────────────────────────────────
  const allChangesets = () => (changesetSource.value ? changesetSource.value() : fixtureChangesets.value);
  const openChangesets = computed(() => allChangesets().filter((c) => c.status === 'open' || c.status === 'partial' || c.status === 'sent-back'));
  /** WP2's timeline store can make this list a view over its own (so counts stay live). */
  function provideChangesets(getter: () => Changeset[]) { changesetSource.value = getter; }
  function applyEffects(effects: Effect[], status: Status) {
    const g = graph.value;
    let nodes = [...g.nodes], edges = [...g.edges];
    for (const ef of effects) {
      if (ef.verdict === 'rejected') continue;
      if (ef.op === 'add-node' && ef.node) {
        const ex = nodes.find((n) => n.id === ef.node!.id);
        if (ex) nodes = nodes.map((n) => (n.id === ex.id ? { ...n, ...ef.node, status } : n)); else nodes.push({ ...ef.node, status });
      } else if (ef.op === 'add-edge' && ef.edge) {
        const ex = edges.find((e) => e.id === ef.edge!.id);
        if (ex) edges = edges.map((e) => (e.id === ex.id ? { ...e, status } : e)); else edges.push({ ...ef.edge, status });
      } else if (ef.op === 'update-node' && ef.node) {
        nodes = nodes.map((n) => (n.id === ef.node!.id ? { ...n, ...ef.node, status } : n));
      } else if (ef.op === 'remove-edge' && ef.edge) {
        const t = ef.edge;
        edges = edges.filter((e) => !(e.id === t.id || (e.src === t.src && e.dst === t.dst && e.type === t.type)));
      } else if (ef.op === 'remove-node' && ef.node) {
        const id = ef.node.id;
        nodes = nodes.filter((n) => n.id !== id); edges = edges.filter((e) => e.src !== id && e.dst !== id);
      }
    }
    graph.value = { nodes, edges };
  }

  // ── gaps ──────────────────────────────────────────────────────────────
  function openGap(kind: string, parentId: string | null, question: string) {
    const g = { kind, parentId, question };
    if (!gapListeners.size) toast('Open question', { description: question });
    gapListeners.forEach((cb) => cb(g));
  }
  function onGap(cb: GapCb) { gapListeners.add(cb); return () => { gapListeners.delete(cb); }; }

  // ── route sync ────────────────────────────────────────────────────────
  async function ensureProject(id: string) {
    if (project.value?.id === id && ready.value) return;
    const projects = useProjects();
    loadingProject.value = id; ready.value = false;
    await projects.load();
    const g = await projects.graph(id);
    project.value = projects.byId(id) ?? { id, name: id, purpose: '', summary: '', counts: {} as ProjectSummary['counts'], nodeCount: g.nodes.length, edgeCount: g.edges.length, openCount: 0, updatedAt: '' };
    graph.value = structuredClone(g);
    ghost.value = null; filterIds.value = null; highlightIds.value = []; previewId.value = null; undoStack.length = 0;
    for (const k of Object.keys(derivedPicks)) delete derivedPicks[k];
    const tl = await projects.timeline(id);
    fixtureChangesets.value = (tl?.entries ?? []).flatMap((e) => (e.type === 'changeset' ? [e.changeset] : []));
    view.value = { ...view.value, project: id };
    loadingProject.value = null; ready.value = true;
  }
  async function sync(route: RouteLocationNormalizedLoaded) {
    const pid = route.params.project as string | undefined;
    currentQuery.value = (route.query.q as string) ?? '';
    if (!pid) { return; }
    await ensureProject(pid);
    if (route.name !== 'traversal') return;
    const p = route.params.persp as string;
    const raw = ([] as string[]).concat((route.params.path as string[] | string | undefined) ?? []);
    const segs = parseSegments(raw);
    segments.value = segs;
    const lastAcross = [...segs].reverse().find((s) => s.via);
    view.value = { project: pid, persp: isPersp(p) ? p : 'domain', path: segs.map((s) => s.id), across: lastAcross ? { edge: lastAcross.via!.edge, id: lastAcross.id } : undefined };
    useProjects().touch(pid, { persp: view.value.persp, path: serializeSegments(segs) });
    if (lastMove.value && lastMove.value.path !== route.path) lastMove.value = null;
  }
  function setRouter(r: Router) { router = r; }

  // waypoints=collapse: a waypoint column with one row auto-selects
  watch(columns, (cols) => {
    if (flags.waypoints !== 'collapse' || flags.nav !== 'columns') return;
    const last = cols[cols.length - 1];
    if (last && last.waypoint && !last.selectedId && last.items.length === 1) select(last.index, last.items[0].node.id, true);
  });

  const api = {
    project, graph, view, selection, perspectives: PERSPECTIVES, byId, neighbours, resolvePath, dispatch, undo, ghost, applyEffects, openGap, onGap,
    // extras
    ix, viewGraph, segments, columns, persp, chainless, ready, loadingProject, highlightIds, filterIds, previewId, lastMove, openChangesets,
    allChangesets, provideChangesets, pathsFor, rememberVia, hasVia, lensChips, select, across, popTo, up, switchPersp, go, buildUrl, confirmPreview,
    pinHop, unpinHop, repickHop, pinnedHops, ensureProject, sync, setRouter, viaToken, currentQuery,
  };
  return api satisfies GraphApi;
}

let inst: ReturnType<typeof create> | null = null;
export function useGraph() {
  if (!inst) inst = effectScope(true).run(create)!;
  return inst;
}
export type GraphStore = ReturnType<typeof useGraph>;
export type { Edge };
