// Shared utilities for the Playwright verification suite.
//
// Two hard constraints drive these helpers (see CLAUDE.md "Verifying UI
// changes"):
//   1. Synthetic PointerEvent dispatch does not trigger ForceGraph node
//      selection (pointer-capture semantics) — every interaction here goes
//      through real input (page.mouse / Locator.click), never page.evaluate
//      dispatching events by hand.
//   2. The app is a client:only Vue island that seeds SAMPLE_GRAPH the first
//      time it hydrates against empty localStorage. Every test needs a truly
//      fresh graph, so storage must be cleared *before* the app's first
//      script runs, not after.
import type { Page, Locator } from '@playwright/test';

// playwright.config.ts pins webServer to this port with no `use.baseURL`,
// so tests navigate with an absolute origin.
export const BASE_URL = 'http://localhost:4433';

/**
 * Navigate to a brand-new page with empty localStorage (via addInitScript,
 * so the clear runs before Studio's onMounted hydrate()) and land directly
 * on the given hash route. The sample graph seeds itself on this first load.
 */
export async function freshPage(page: Page, hash = '#/overview'): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${BASE_URL}/${hash}`);
  // The sidebar nav is rendered unconditionally (outside the `ready` gate),
  // so waiting on it confirms the Vue island has mounted.
  await page.getByRole('button', { name: 'Overview' }).waitFor({ state: 'visible' });
}

/** Switch the Inspector's Narrative/Details tab. */
export async function clickInspectorTab(page: Page, tab: 'Narrative' | 'Details'): Promise<void> {
  await page.getByRole('button', { name: tab, exact: true }).click();
}

/**
 * Wait for the d3-force simulation (and any queued fit()/relayout()) to
 * actually stop moving, rather than sleeping a fixed duration. Polls every
 * node circle's screen position (via a single page.evaluate over the SVG,
 * matching svgNodeCircle's "last circle in each node group" convention) at
 * ~250ms intervals, and resolves once the largest per-node position delta
 * between two consecutive samples stays under 0.5px for 2 samples in a row.
 *
 * A fixed wait either wastes time (most settles finish well under a second)
 * or — worse — under-waits on slow CI hardware, where the earlier
 * hard-coded ms values (1300/2200/4000) were tuned against local timing and
 * had no real margin. Polled convergence adapts to whatever the machine
 * actually needs, up to a generous overall cap so a graph that never
 * settles (a real bug) still fails fast instead of hanging.
 */
export async function waitForGraphSettle(page: Page, timeoutMs = 15_000): Promise<void> {
  const SAMPLE_INTERVAL_MS = 250;
  const STABLE_THRESHOLD_PX = 0.5;
  const REQUIRED_STABLE_SAMPLES = 2;

  async function samplePositions(): Promise<number[]> {
    return page.evaluate(() => {
      const out: number[] = [];
      for (const g of document.querySelectorAll('svg g.cursor-pointer')) {
        const circles = g.querySelectorAll('circle');
        const own = circles[circles.length - 1]; // last = node's own circle, not the selection halo
        if (!own) continue;
        const rect = own.getBoundingClientRect();
        out.push(rect.x, rect.y);
      }
      return out;
    });
  }

  const deadline = Date.now() + timeoutMs;
  let prev = await samplePositions();
  let stableStreak = 0;

  while (Date.now() < deadline) {
    await page.waitForTimeout(SAMPLE_INTERVAL_MS);
    const curr = await samplePositions();

    // A changed node count means the graph is still (re)rendering — not
    // settled yet, regardless of how still the current set looks.
    const comparable = curr.length > 0 && curr.length === prev.length;
    const maxDelta = comparable
      ? curr.reduce((max, v, i) => Math.max(max, Math.abs(v - prev[i]!)), 0)
      : Infinity;

    if (maxDelta < STABLE_THRESHOLD_PX) {
      stableStreak++;
      if (stableStreak >= REQUIRED_STABLE_SAMPLES) return;
    } else {
      stableStreak = 0;
    }
    prev = curr;
  }
  // Timed out without confirmed convergence. Throw rather than fall through:
  // tests whose assertions don't depend on positions (label counts, dash
  // arrays) would otherwise pass green over a permanently jittering graph,
  // hiding a ForceGraph re-heat regression behind a mysteriously slow run.
  throw new Error(
    `waitForGraphSettle: graph did not converge within ${timeoutMs}ms ` +
      `(max per-node delta stayed ≥ ${STABLE_THRESHOLD_PX}px between samples)`,
  );
}

/** Locate an SVG node's `<text>` label by (substring) title — read-only (see svgNodeCircle for interaction). */
export function svgNodeLabel(page: Page, text: string): Locator {
  return page.locator('svg text', { hasText: text });
}

/**
 * Locate an SVG force-graph node's clickable `<circle>` by its label text.
 * The label `<text>` is rendered with `pointer-events: none` (ForceGraph.vue)
 * and sits entirely below the circle, not overlapping it — clicking the
 * label's own bounding box misses the node's pointerdown handler entirely
 * and falls through to the pan/deselect background handler instead. The
 * circle is the real hit target; `.last()` picks the node's own circle over
 * the (optional, DOM-earlier) selection-halo circle rendered when selected.
 */
function svgNodeCircle(page: Page, text: string): Locator {
  return page
    .locator('svg g.cursor-pointer', { has: page.locator('text', { hasText: text }) })
    .first()
    .locator('circle')
    .last();
}

/**
 * Fail fast and clearly if the given screen point is covered by something
 * other than the SVG — e.g. a fixed corner overlay (title, mode toggle,
 * space-filter legend, KindCard). Fit() only fits the node set to the
 * canvas size; it has no idea those HTML overlays exist, so any node can
 * end up geometrically underneath one. Without this check a click there
 * silently hits the overlay and the resulting test failure is baffling.
 */
async function assertPointHitsSvg(page: Page, x: number, y: number, context: string): Promise<void> {
  const hitsSvg = await page.evaluate(
    ([px, py]) => !!document.elementFromPoint(px, py)?.closest('svg'),
    [x, y] as [number, number],
  );
  if (!hitsSvg) {
    throw new Error(
      `${context}: point (${x}, ${y}) is covered by a non-SVG overlay, not the graph canvas. ` +
        'Pick a node whose fitted position lands away from the four corners.',
    );
  }
}

/**
 * Click an SVG force-graph node by finding its circle and clicking its
 * bounding-box center with real mouse events. The click handler lives on
 * the enclosing `<g>` (pointerdown), which real mouse events bubble to
 * correctly — synthetic PointerEvent dispatch does not.
 */
export async function clickSvgNode(page: Page, text: string): Promise<void> {
  const circle = svgNodeCircle(page, text);
  await circle.waitFor({ state: 'visible' });
  const box = await circle.boundingBox();
  if (!box) throw new Error(`svg node circle for "${text}" has no bounding box`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await assertPointHitsSvg(page, x, y, `clickSvgNode("${text}")`);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.up();
}

/**
 * Drag an SVG force-graph node by (dx, dy) screen pixels using real mouse
 * down/move/move/up — ForceGraph's drag is hand-rolled off pointer events,
 * not d3-drag, so a deliberate multi-step move matters more than for
 * ordinary click targets. Must start on the circle, not the label — see
 * svgNodeCircle.
 */
export async function dragSvgNode(page: Page, text: string, dx: number, dy: number): Promise<void> {
  const circle = svgNodeCircle(page, text);
  await circle.waitFor({ state: 'visible' });
  const box = await circle.boundingBox();
  if (!box) throw new Error(`svg node circle for "${text}" has no bounding box`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await assertPointHitsSvg(page, x, y, `dragSvgNode("${text}")`);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 });
  await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up();
}

/** Click the "⤢ Fit" control to deterministically re-derive the pan/zoom transform. */
export async function clickFit(page: Page): Promise<void> {
  await page.getByRole('button', { name: '⤢ Fit' }).click();
  await page.waitForTimeout(200);
}

/** Read the clipboard via the permissions already granted in playwright.config.ts. */
export async function readClipboard(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}
