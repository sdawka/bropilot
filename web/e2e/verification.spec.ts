// Permanent Playwright codification of the 8-point manual verification pass
// (see CLAUDE.md "Verifying UI changes"), plus three regressions caught by
// earlier fix batches. Each test gets a fresh browser context (Playwright's
// default) and a freshly cleared localStorage (see helpers.freshPage), so
// SAMPLE_GRAPH reseeds identically every time — no shared state between
// tests.
import { test, expect } from '@playwright/test';
import {
  freshPage,
  clickInspectorTab,
  waitForGraphSettle,
  svgNodeLabel,
  clickSvgNode,
  dragSvgNode,
  clickFit,
  readClipboard,
} from './helpers';
import { KINDS, KIND_MAP } from '../src/lib/schema';
import { lintGraph } from '../src/lib/lint';
import { SAMPLE_GRAPH } from '../src/lib/sample';

// Ground the finding-count / finding-driven expectations in the same lint
// function the app runs, rather than hard-coding numbers that would silently
// drift if SAMPLE_GRAPH or the lint rules change.
const SAMPLE_FINDINGS = lintGraph(SAMPLE_GRAPH);

// First lint finding that points at a node — used to drive the health-card
// navigation and Inspector-badge tests without hard-coding a node id that
// depends on sample content.
const FINDING = SAMPLE_FINDINGS.find((f) => f.nodeId)!;
const FINDING_NODE = SAMPLE_GRAPH.nodes.find((n) => n.id === FINDING.nodeId)!;
const FINDING_PART = KIND_MAP[FINDING_NODE.kind].part;

test.describe('1 — editor chips add edges', () => {
  test('ontology suggestion chips are visible and clicking one adds an edge row', async ({ page }) => {
    await freshPage(page, '#/foundations/persona-architect');
    await clickInspectorTab(page, 'Details');

    const relationships = page.locator('section', {
      has: page.getByRole('heading', { level: 3, name: 'Relationships' }),
    });
    const chips = page.locator('button[title^="Suggested by the ontology"]');
    await expect(chips.first()).toBeVisible();
    const chipCountBefore = await chips.count();
    expect(chipCountBefore).toBeGreaterThan(0);

    const rowsBefore = await relationships.locator('ul li').count();
    await chips.first().click();
    const rowsAfter = relationships.locator('ul li');
    await expect(rowsAfter).toHaveCount(rowsBefore + 1);
  });
});

test.describe('2 — fits-ontology ranking', () => {
  test('target search results sort "fits ontology" matches first', async ({ page }) => {
    await freshPage(page, '#/foundations/persona-architect');
    await clickInspectorTab(page, 'Details');

    const targetInput = page.getByPlaceholder('Search for a target node…');
    const typeSelect = targetInput.locator('xpath=preceding-sibling::select[1]');
    await typeSelect.selectOption('motivates');

    await targetInput.click(); // focus alone reveals the full, sorted result list
    const results = page.locator('ul.max-h-44 li');
    await expect(results.first()).toBeVisible();

    const flags = await results.evaluateAll((items) =>
      items.map((li) => li.textContent?.includes('fits ontology') ?? false),
    );
    expect(flags.some(Boolean)).toBe(true); // sanity: at least one match exists
    const firstFalse = flags.indexOf(false);
    const lastTrue = flags.lastIndexOf(true);
    // every "fits ontology" row must appear before every non-matching row
    if (firstFalse !== -1) expect(lastTrue).toBeLessThan(firstFalse);
  });
});

test.describe('3 — ontology toggle', () => {
  test('graph renders all kind nodes with dash-coded strength', async ({ page }) => {
    await freshPage(page, '#/graph');
    await waitForGraphSettle(page);

    await page.getByRole('button', { name: 'ontology', exact: true }).click();
    await waitForGraphSettle(page);

    const kindLabels = page.locator('g.cursor-pointer text');
    await expect(kindLabels).toHaveCount(KINDS.length);

    const sample = await kindLabels.first().textContent();
    expect(sample).toMatch(/ · \d+$/); // titles carry the instance-count badge

    await expect(page.locator('svg line[stroke-dasharray="6 4"]').first()).toBeVisible(); // typical
    await expect(page.locator('svg line[stroke-dasharray="2 5"]').first()).toBeVisible(); // possible
    const solidCount = await page.locator('svg line:not([stroke-dasharray])').count();
    expect(solidCount).toBeGreaterThan(0); // canonical
  });
});

test.describe('4 — KindCard cross-layer', () => {
  test('ontology kind card lists instances and jumping selects one in instance mode', async ({ page }) => {
    await freshPage(page, '#/graph');
    await waitForGraphSettle(page);
    await page.getByRole('button', { name: 'ontology', exact: true }).click();
    await waitForGraphSettle(page); // full-energy layout (alpha 0.9) — polled, so this waits exactly as long as it takes
    await clickFit(page); // re-derive the view from current (settled) node positions before clicking

    await clickSvgNode(page, 'Persona');

    const card = page.locator('div.absolute.bottom-5.right-5.w-80');
    await expect(card).toBeVisible();
    await expect(card.getByText('Persona', { exact: false }).first()).toBeVisible();

    const personaCount = SAMPLE_GRAPH.nodes.filter((n) => n.kind === 'persona').length;
    expect(personaCount).toBeGreaterThan(0);
    const instanceButton = card.getByRole('button', { name: 'System architect' });
    await expect(instanceButton).toBeVisible();
    await instanceButton.click();

    // flips back to instance mode with the clicked node selected
    await expect(page.getByRole('button', { name: 'instance', exact: true })).toHaveClass(/text-ink-100/);
    await expect(page).toHaveURL(/#\/graph\/persona-architect$/);
  });
});

test.describe('5 — kind-chip deep link', () => {
  test('clicking the Inspector kind chip opens the graph in ontology mode with that card', async ({ page }) => {
    await freshPage(page, '#/foundations/persona-architect');
    await clickInspectorTab(page, 'Details');

    await page.getByTitle('View this kind in the ontology').click();
    await waitForGraphSettle(page);

    await expect(page).toHaveURL(/#\/graph$/);
    await expect(page.getByRole('button', { name: 'ontology', exact: true })).toHaveClass(/text-ink-100/);
    const card = page.locator('div.absolute.bottom-5.right-5.w-80');
    await expect(card).toBeVisible();
    await expect(card.getByText('Persona', { exact: false }).first()).toBeVisible();
  });
});

test.describe('6 — health card navigation', () => {
  test('clicking a finding navigates to and selects its node', async ({ page }) => {
    await freshPage(page, '#/overview');

    const health = page.locator('section', {
      has: page.getByRole('heading', { level: 3, name: 'Graph health' }),
    });
    await expect(health.locator('li')).toHaveCount(SAMPLE_FINDINGS.length);

    await health.locator('li button', { hasText: FINDING_NODE.title }).first().click();
    await expect(page).toHaveURL(new RegExp(`#/${FINDING_PART}/${FINDING_NODE.id}$`));

    await clickInspectorTab(page, 'Details');
    await expect(page.locator('code', { hasText: FINDING_NODE.id })).toBeVisible();
  });
});

test.describe('7 — Inspector badge', () => {
  test('a node with lint findings shows a warning badge', async ({ page }) => {
    await freshPage(page, `#/${FINDING_PART}/${FINDING_NODE.id}`);
    await clickInspectorTab(page, 'Details');

    const findingsForNode = SAMPLE_FINDINGS.filter((f) => f.nodeId === FINDING_NODE.id).length;
    expect(findingsForNode).toBeGreaterThan(0);
    await expect(page.getByText(`⚠ ${findingsForNode}`, { exact: true })).toBeVisible();
  });
});

test.describe('8 — copy context', () => {
  test('Copy context puts the expected markdown on the clipboard', async ({ page }) => {
    await freshPage(page, '#/implementation/module-store');
    await clickInspectorTab(page, 'Details');

    await page.getByRole('button', { name: '⧉ Copy context' }).click();
    const text = await readClipboard(page);
    expect(text.startsWith('# Graph store')).toBe(true);
    expect(text).toContain('## Context');
  });
});

test.describe('regression — relayout preserves dragged instance positions', () => {
  test('dragging a node, round-tripping through ontology mode, and relayouting leaves it in place', async ({
    page,
  }) => {
    await freshPage(page, '#/graph');
    // The fresh, unrestored layout runs at full alpha (0.9) and takes several
    // seconds of d3's default decay to actually stop moving — polling for
    // convergence (rather than a fixed sleep) waits exactly as long as this
    // machine needs before the drag fires, so it can't read as a missed drag.
    await waitForGraphSettle(page);
    await clickFit(page);
    // "ForceGraph"/"Graph store" (not "System architect"/"Builder"): the
    // layout is deterministic, and those two instance nodes happen to settle
    // right under the fixed bottom-left space-filter legend after Fit(),
    // which then swallows the click meant for the SVG circle beneath it.
    const draggedBefore = await svgNodeLabel(page, 'ForceGraph').first().boundingBox();
    const controlBefore = await svgNodeLabel(page, 'Graph store').first().boundingBox();
    expect(draggedBefore).not.toBeNull();
    expect(controlBefore).not.toBeNull();

    // Drag under the same (still-unfitted) view transform as the baseline, so
    // a position change here directly reflects the drag — proving the drag
    // itself moved the node, not just that some later position was stable.
    // A magnitude check (not an exact-delta check) because collide/link
    // forces keep nudging the released node for a few more reheated ticks
    // before it settles — the drop point isn't pixel-exact to the drag.
    // "Graph store" (module-store, never touched) is measured as a control:
    // if the drag actually missed the node and panned the background instead,
    // every node — including the control — would shift by the same amount,
    // which this rules out.
    await dragSvgNode(page, 'ForceGraph', 140, -90);
    // Deliberately NOT waitForGraphSettle here: onUp() releases fx/fy (the
    // node isn't pinned after a drag), so link/collide forces keep pulling it
    // back toward equilibrium — waiting for full convergence would erode the
    // very displacement this sanity check needs to observe. A short, fixed
    // wait (just enough for onUp()'s synchronous flush to reach the DOM) is
    // the right tool here, not the polled settle used for the DERIVED views
    // below (clickFit, ontology round-trip) after the position has been read.
    await page.waitForTimeout(300);
    const draggedRightAfter = await svgNodeLabel(page, 'ForceGraph').first().boundingBox();
    const controlRightAfter = await svgNodeLabel(page, 'Graph store').first().boundingBox();
    expect(draggedRightAfter).not.toBeNull();
    expect(controlRightAfter).not.toBeNull();
    const dragDistance = Math.hypot(
      draggedRightAfter!.x - draggedBefore!.x,
      draggedRightAfter!.y - draggedBefore!.y,
    );
    const controlDrift = Math.hypot(
      controlRightAfter!.x - controlBefore!.x,
      controlRightAfter!.y - controlBefore!.y,
    );
    expect(dragDistance).toBeGreaterThan(60); // the dragged node moved substantially
    expect(controlDrift).toBeLessThan(20); // an untouched node did not — this was a drag, not a pan

    // Now let the released node actually finish settling before treating its
    // position as "the" post-drag position: onUp() flushes positions to
    // storage periodically as the residual alpha decays, so a position read
    // too early (like draggedRightAfter above, taken deliberately early for
    // the sanity check) can still drift before the eventual unmount flush
    // below persists it — that drift was exactly what made this comparison
    // flaky. Settling first makes boxAfterDrag match what gets persisted.
    await waitForGraphSettle(page);
    await clickFit(page); // re-derive a view transform that accounts for the new position
    const boxAfterDrag = await svgNodeLabel(page, 'ForceGraph').first().boundingBox();
    expect(boxAfterDrag).not.toBeNull();

    await page.getByRole('button', { name: 'ontology', exact: true }).click();
    await waitForGraphSettle(page);
    await page.getByRole('button', { name: '↻ Relayout' }).click();
    await waitForGraphSettle(page);
    await page.getByRole('button', { name: 'instance', exact: true }).click();
    await waitForGraphSettle(page);
    await clickFit(page);

    const boxAfterRoundTrip = await svgNodeLabel(page, 'ForceGraph').first().boundingBox();
    expect(boxAfterRoundTrip).not.toBeNull();
    expect(Math.abs(boxAfterRoundTrip!.x - boxAfterDrag!.x)).toBeLessThan(4);
    expect(Math.abs(boxAfterRoundTrip!.y - boxAfterDrag!.y)).toBeLessThan(4);
  });
});

test.describe('regression — search escapes ontology mode', () => {
  test('picking a node from search while in ontology mode flips to instance mode and selects it', async ({
    page,
  }) => {
    await freshPage(page, '#/graph');
    await waitForGraphSettle(page);
    await page.getByRole('button', { name: 'ontology', exact: true }).click();
    await waitForGraphSettle(page);

    await page.keyboard.press('/');
    const searchInput = page.getByPlaceholder('Search nodes by title, description or kind…');
    await expect(searchInput).toBeVisible();
    await searchInput.fill('System architect');
    await page.keyboard.press('Enter');

    await expect(page.getByRole('button', { name: 'instance', exact: true })).toHaveClass(/text-ink-100/);
    await expect(page).toHaveURL(/#\/graph\/persona-architect$/);
  });
});

test.describe('regression — health card navigation works with a prior selection', () => {
  test('selecting a node, returning to overview, then clicking a finding still navigates correctly', async ({
    page,
  }) => {
    await freshPage(page, '#/implementation/module-store');
    // Scoped to the sidebar <nav> — the rich sample's interlinked
    // descriptions also render inline citation buttons/headings titled
    // "Overview" elsewhere on the page, which would otherwise collide.
    await page.locator('nav').getByRole('button', { name: 'Overview' }).click();

    const health = page.locator('section', {
      has: page.getByRole('heading', { level: 3, name: 'Graph health' }),
    });
    await expect(health.locator('li')).toHaveCount(SAMPLE_FINDINGS.length);

    await health.locator('li button', { hasText: FINDING_NODE.title }).first().click();
    await expect(page).toHaveURL(new RegExp(`#/${FINDING_PART}/${FINDING_NODE.id}$`));

    await clickInspectorTab(page, 'Details');
    await expect(page.locator('code', { hasText: FINDING_NODE.id })).toBeVisible();
  });
});
