// Simulator-driven UI smoke test (Wave 2, spec §3 / plan §Wave 2). Generates
// the seed-7 op stream from the real sim core, filters it down to a short
// (~15-op) sequence that can be replayed deterministically through the real
// UI, replays it via part-view "add" forms / NodeForm / RelationshipEditor /
// a keyboard undo, then diffs the app's own Export-modal JSON against the
// model-level result of applying the identical sequence directly against the
// store in this file's Node process. The model and the UI are exercised as
// one system: if either the sim core's op semantics or the UI's editing
// affordances drift out of sync, this test is the one that notices.
//
// Node-id determinism (see "why two-step addNode" below): the store derives
// a node's id from its title *at creation time only* (`{kind}-{kebab(title)}`,
// store.ts `makeNodeId`) — renaming a node later never changes its id. The
// UI's "+ Add" button always creates with the kind's default title ("New
// {Label}") and has no way to set a title in the same call; NodeForm can
// only rename *after* creation. So for the UI run's node ids to match the
// model run's, the model run must mirror that same two-step sequence
// (addNode with no title, then updateNode to rename) rather than calling the
// sim core's single-step `addNode(kind, {title})` op semantics directly —
// otherwise the model would derive `kind-actual-title` while the UI derives
// `kind-new-label`. This is also why the op filter below allows at most one
// addNode per kind: a second default-titled add of the same kind would
// collide with the first's *id* (which never changed even though its title
// did), forcing the store's nanoid dedup suffix — a source of
// crypto-randomness with no seed, which would make the two runs diverge.
import { test, expect, type Page } from '@playwright/test';
import { BASE_URL, clickInspectorTab } from './helpers';
import { mulberry32 } from '../src/lib/sim/rng';
import { generateOps } from '../src/lib/sim/ops';
import { KIND_MAP, PARTS, EDGE_TYPE_SET, type Graph, type GraphNode, type GraphEdge } from '../src/lib/schema';
import { hydrate, clearGraph, addNode, updateNode, addEdge, undo, exportGraph } from '../src/lib/store';

// ── localStorage stub ───────────────────────────────────────────────────────
// This file computes the "expected" graph by driving ../src/lib/store.ts
// directly in this Node process (not via page.evaluate) — the same store
// module the sim core's tests/setup.ts stubs for Vitest. Playwright doesn't
// load that setupFile, so we install an equivalent tiny Map-backed
// localStorage here (store.ts only touches `localStorage` inside function
// bodies — hydrate/checkpoint/the autosave watch — never at module-eval
// time, so installing this before those functions are *called*, anywhere in
// this file, is sufficient regardless of import order).
class MemoryStorage implements globalThis.Storage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  get length(): number {
    return this.map.size;
  }
}
const existing = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
if (!existing || existing.value === undefined) {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    writable: true,
    configurable: true,
  });
}

// ── build the filtered seed-7 script ────────────────────────────────────────
// `generateOps` produces the full weighted op stream (adds, updates, edges,
// removes, undo/redo, import/export, hostile strings — see sim/ops.ts). Only
// a subset is deterministically UI-replayable:
//   - addNode: kind + title only (description/props dropped — the plan calls
//     this out explicitly as "addNode with kind+title"), title must be
//     plausible plain text (the WORDS-bank "word word" shape — hostile
//     strings like newlines/emoji/10k-char can't be reliably typed into a
//     single-line <input> and aren't the point of this test), and the kind
//     must not already be used (id-collision determinism, see file header).
//   - updateNode: title and/or description only (props dropped), target
//     must resolve to a node this filtered sequence already created.
//   - addEdge: type must be one of the 17 canonical EDGE_TYPES (the
//     RelationshipEditor <select> only offers those — off-ontology types
//     from the generator, which are legal at the store level, have no UI
//     affordance to pick), no label (label editing is a separate inline
//     flow not exercised here), and src/dst must both already exist in the
//     filtered sequence.
//   - everything else (removeNode/removeEdge/updateEdge/redo/importGraph/
//     clearGraph/resetToSample) is dropped: no UI affordance replays them
//     deterministically in this smoke test's scope.
// A single `undo` is appended at the end (not sourced from the generator —
// undo's effect depends on exactly what preceded it, so placing it last
// keeps the filtered index bookkeeping trivial and matches the plan's "one
// undo").
type UiOp =
  | { kind: 'addNode'; nodeKind: string; title: string }
  | { kind: 'updateNode'; targetTitle: string; patch: { title?: string; description?: string } }
  | { kind: 'addEdge'; srcTitle: string; dstTitle: string; edgeType: string }
  | { kind: 'undo' };

const PLAUSIBLE = /^[a-z]+ [a-z]+$/; // matches ops.ts's plausibleText() shape; excludes every HOSTILE_STRINGS entry

function mod(n: number, len: number): number {
  return ((n % len) + len) % len;
}

function buildScript(seed: number, contentOpCount: number): { script: UiOp[]; dropped: { rawIndex: number; type: string; reason: string }[] } {
  const rnd = mulberry32(seed);
  const raw = generateOps(rnd, 200); // generous pool; we stop once contentOpCount is reached

  const script: UiOp[] = [];
  const dropped: { rawIndex: number; type: string; reason: string }[] = [];
  const keptKinds = new Set<string>();
  const usedTitles = new Set<string>();
  const nodeRefs: { kind: string; currentTitle: string }[] = [];

  raw.forEach((op, rawIndex) => {
    if (script.length >= contentOpCount) return;

    if (op.type === 'addNode') {
      if (!PLAUSIBLE.test(op.title)) {
        dropped.push({ rawIndex, type: op.type, reason: `non-plausible/hostile title ${JSON.stringify(op.title)}` });
        return;
      }
      if (keptKinds.has(op.kind)) {
        dropped.push({ rawIndex, type: op.type, reason: `kind "${op.kind}" already used (id-collision determinism)` });
        return;
      }
      if (usedTitles.has(op.title)) {
        dropped.push({ rawIndex, type: op.type, reason: `title "${op.title}" already used (search ambiguity)` });
        return;
      }
      keptKinds.add(op.kind);
      usedTitles.add(op.title);
      nodeRefs.push({ kind: op.kind, currentTitle: op.title });
      script.push({ kind: 'addNode', nodeKind: op.kind, title: op.title });
    } else if (op.type === 'updateNode') {
      if (!nodeRefs.length) {
        dropped.push({ rawIndex, type: op.type, reason: 'no UI-created nodes yet' });
        return;
      }
      const patch: { title?: string; description?: string } = {};
      if (op.patch.title !== undefined && PLAUSIBLE.test(op.patch.title) && !usedTitles.has(op.patch.title)) {
        patch.title = op.patch.title;
      }
      if (op.patch.description !== undefined && PLAUSIBLE.test(op.patch.description)) {
        patch.description = op.patch.description;
      }
      if (patch.title === undefined && patch.description === undefined) {
        dropped.push({ rawIndex, type: op.type, reason: 'no plausible title/description in patch (props always dropped)' });
        return;
      }
      const target = nodeRefs[mod(op.targetIndex, nodeRefs.length)]!;
      script.push({ kind: 'updateNode', targetTitle: target.currentTitle, patch });
      if (patch.title) {
        usedTitles.delete(target.currentTitle);
        usedTitles.add(patch.title);
        target.currentTitle = patch.title;
      }
    } else if (op.type === 'addEdge') {
      if (nodeRefs.length < 2) {
        dropped.push({ rawIndex, type: op.type, reason: 'fewer than 2 UI-created nodes' });
        return;
      }
      if (!EDGE_TYPE_SET.has(op.edgeType)) {
        dropped.push({ rawIndex, type: op.type, reason: `off-ontology type "${op.edgeType}" has no <select> option` });
        return;
      }
      if (op.label !== undefined) {
        dropped.push({ rawIndex, type: op.type, reason: 'has a label (not exercised by this test)' });
        return;
      }
      const srcIdx = mod(op.srcIndex, nodeRefs.length);
      const dstIdx = mod(op.dstIndex, nodeRefs.length);
      if (srcIdx === dstIdx) {
        dropped.push({ rawIndex, type: op.type, reason: 'src === dst' });
        return;
      }
      const src = nodeRefs[srcIdx]!;
      const dst = nodeRefs[dstIdx]!;
      script.push({ kind: 'addEdge', srcTitle: src.currentTitle, dstTitle: dst.currentTitle, edgeType: op.edgeType });
    } else {
      dropped.push({ rawIndex, type: op.type, reason: 'op type not selected for UI replay in this smoke test' });
    }
  });

  if (script.length) script.push({ kind: 'undo' });
  return { script, dropped };
}

const SEED = 7;
const { script: SCRIPT, dropped: DROPPED } = buildScript(SEED, 14);

// ── UI replay ────────────────────────────────────────────────────────────
async function freshEmptyPage(page: Page, hash = '#/foundations'): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('bropilot:graph:v1', JSON.stringify({ nodes: [], edges: [] }));
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${BASE_URL}/${hash}`);
  await page.getByRole('button', { name: 'Overview' }).waitFor({ state: 'visible' });
}

async function addFirstNodeViaUi(page: Page, nodeKind: string, title: string): Promise<void> {
  const def = KIND_MAP[nodeKind]!;
  const partLabel = PARTS.find((p) => p.id === def.part)!.label;
  await page.getByRole('button', { name: partLabel }).click();
  await page.getByRole('button', { name: `+ Add the first ${def.label.toLowerCase()}` }).click();
  await clickInspectorTab(page, 'Details');
  await page.getByPlaceholder('Name this node…').fill(title);
}

/** Open the search palette and pick the node whose title/description/kind matches `query` uniquely. */
async function selectNodeViaSearch(page: Page, query: string): Promise<void> {
  await page.locator('button[title="Search nodes (⌘K or /)"]').click();
  const palette = page.locator('div.rounded-2xl.glass-strong');
  await palette.getByPlaceholder('Search nodes by title, description or kind…').fill(query);
  const results = palette.locator('button', { hasText: query });
  await expect(results.first()).toBeVisible();
  await results.first().click();
}

async function updateNodeViaUi(page: Page, targetTitle: string, patch: { title?: string; description?: string }): Promise<void> {
  await selectNodeViaSearch(page, targetTitle);
  await clickInspectorTab(page, 'Details');
  if (patch.title !== undefined) {
    await page.getByPlaceholder('Name this node…').fill(patch.title);
  }
  if (patch.description !== undefined) {
    await page.getByPlaceholder('What is it, in plain language?').fill(patch.description);
  }
}

async function addEdgeViaUi(page: Page, srcTitle: string, dstTitle: string, edgeType: string): Promise<void> {
  await selectNodeViaSearch(page, srcTitle);
  await clickInspectorTab(page, 'Details');
  const targetInput = page.getByPlaceholder('Search for a target node…');
  const typeSelect = targetInput.locator('xpath=preceding-sibling::select[1]');
  await typeSelect.selectOption(edgeType);
  await targetInput.fill(dstTitle);
  const results = page.locator('ul.max-h-44 li button', { hasText: dstTitle });
  await expect(results.first()).toBeVisible();
  await results.first().click();
}

async function replayScriptInUi(page: Page, script: UiOp[]): Promise<void> {
  for (const step of script) {
    if (step.kind === 'addNode') {
      await addFirstNodeViaUi(page, step.nodeKind, step.title);
    } else if (step.kind === 'updateNode') {
      await updateNodeViaUi(page, step.targetTitle, step.patch);
    } else if (step.kind === 'addEdge') {
      await addEdgeViaUi(page, step.srcTitle, step.dstTitle, step.edgeType);
    } else {
      // undo — the app preventDefaults Meta/Ctrl+Z at the window level and
      // routes it to the store's undo() regardless of focus (Studio.vue
      // onKeydown), so no particular element needs focus first.
      await page.keyboard.press('Meta+z');
    }
  }
}

// ── model computation (store, in this Node process) ────────────────────────
function computeExpectedGraph(script: UiOp[]): Graph {
  hydrate();
  clearGraph(); // mirror the UI's cleared start (sim/run.ts's simulate() uses the same hydrate()+clearGraph() pattern)

  const idByTitle = new Map<string, string>();
  for (const step of script) {
    if (step.kind === 'addNode') {
      // Two-step, matching the UI: create with the kind's default title
      // (fixes the id), then rename — see the file-header note on why.
      const node = addNode(step.nodeKind);
      updateNode(node.id, { title: step.title });
      idByTitle.set(step.title, node.id);
    } else if (step.kind === 'updateNode') {
      const id = idByTitle.get(step.targetTitle);
      if (!id) throw new Error(`model run: no known node titled "${step.targetTitle}"`);
      updateNode(id, step.patch);
      if (step.patch.title) {
        idByTitle.delete(step.targetTitle);
        idByTitle.set(step.patch.title, id);
      }
    } else if (step.kind === 'addEdge') {
      const srcId = idByTitle.get(step.srcTitle);
      const dstId = idByTitle.get(step.dstTitle);
      if (!srcId || !dstId) throw new Error(`model run: unknown edge endpoint (${step.srcTitle} -> ${step.dstTitle})`);
      addEdge(srcId, dstId, step.edgeType);
    } else {
      undo();
    }
  }
  return JSON.parse(exportGraph()) as Graph;
}

// ── comparison ───────────────────────────────────────────────────────────
interface NodeCompare {
  id: string;
  kind: string;
  title: string;
  description: string;
  props: Record<string, unknown>;
}
interface EdgeCompare {
  srcId: string;
  dstId: string;
  type: string;
  label?: string;
}

function normalizeNodes(nodes: GraphNode[]): NodeCompare[] {
  return nodes
    .map((n) => ({ id: n.id, kind: n.kind, title: n.title, description: n.description, props: n.props ?? {} }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
// Edge ids are random nanoids (never reproducible across two independent
// runs) and sourceRefs/unset props aren't exercised by this script — both
// explicitly excluded from comparison per the plan.
function normalizeEdges(edges: GraphEdge[]): EdgeCompare[] {
  return edges
    .map((e) => ({ srcId: e.srcId, dstId: e.dstId, type: e.type, label: e.label }))
    .sort((a, b) => `${a.srcId}|${a.type}|${a.dstId}`.localeCompare(`${b.srcId}|${b.type}|${b.dstId}`));
}

test.describe('simulator-driven UI smoke', () => {
  test(`seed ${SEED}: UI replay matches the sim core's model-level result`, async ({ page }) => {
    test.setTimeout(120_000);
    expect(SCRIPT.length, 'buildScript produced no usable ops for this seed/pool').toBeGreaterThan(1);

    await freshEmptyPage(page);
    await replayScriptInUi(page, SCRIPT);

    await page.getByRole('button', { name: 'Export JSON' }).click();
    const exportedText = await page.locator('textarea[readonly]').inputValue();
    const actual = JSON.parse(exportedText) as Graph;

    const expected = computeExpectedGraph(SCRIPT);

    const context = `seed ${SEED}, script: ${JSON.stringify(SCRIPT)}`;
    expect(normalizeNodes(actual.nodes), context).toEqual(normalizeNodes(expected.nodes));
    expect(normalizeEdges(actual.edges), context).toEqual(normalizeEdges(expected.edges));
  });
});

// Surfaced for `wave2-report.md` / future maintainers — not asserted on,
// since dropping generator ops that have no deterministic UI affordance is
// expected behaviour, not a failure.
void DROPPED;
