import { test, expect } from '@playwright/test';
import { freshPage, waitForGraphSettle, clickSvgNode, BASE_URL } from './helpers';

test.describe('slice tabs', () => {
  test('the tab strip renders all five tabs on the graph view', async ({ page }) => {
    await freshPage(page, '#/graph');
    for (const name of ['All', 'Foundations', 'Domain', 'Implementation', 'Thread']) {
      await expect(page.getByRole('tab', { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('tab', { name: 'All', exact: true })).toHaveAttribute('aria-selected', 'true');
  });

  test('the Foundations tab shows its own nodes plus ghosts, but not unrelated nodes', async ({ page }) => {
    await freshPage(page, '#/graph');
    await waitForGraphSettle(page);
    await page.getByRole('tab', { name: 'Foundations', exact: true }).click();
    await waitForGraphSettle(page);

    // a foundations node is present
    await expect(page.locator('svg g.cursor-pointer', { has: page.locator('text', { hasText: 'System architect' }) }).first()).toBeVisible();
    // a ghost (module-store) is present in the DOM (its label may be opacity-hidden until hover)
    await expect(page.locator('svg g.cursor-pointer', { has: page.locator('text', { hasText: 'Graph store' }) }).first()).toBeAttached();
    // module-schema ("Schema") is neither a foundations node nor a ghost → absent
    await expect(page.locator('svg g.cursor-pointer', { has: page.locator('text', { hasText: 'Schema' }) })).toHaveCount(0);
  });

  test('clicking a ghost jumps to its home part tab and selects it', async ({ page }) => {
    await freshPage(page, '#/graph');
    await waitForGraphSettle(page);
    await page.getByRole('tab', { name: 'Foundations', exact: true }).click();
    await waitForGraphSettle(page);

    await clickSvgNode(page, 'Graph store'); // ghost module-store

    // jumped to Implementation tab, node selected → hash reflects selection
    await expect(page.getByRole('tab', { name: 'Implementation', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/#\/graph\/module-store$/);
  });

  test('the active tab survives a reload', async ({ page }) => {
    // Fresh Playwright context ⇒ empty storage, so the app seeds the sample
    // graph on first load. We deliberately do NOT use freshPage here (its
    // addInitScript clears storage on every navigation, including reloads),
    // so the persisted tab pref survives page.reload().
    await page.goto(`${BASE_URL}/#/graph`);
    await page.getByRole('button', { name: 'Overview' }).waitFor({ state: 'visible' });
    await page.getByRole('tab', { name: 'Domain', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Domain', exact: true })).toHaveAttribute('aria-selected', 'true');

    await page.reload();
    await page.getByRole('button', { name: 'Overview' }).waitFor({ state: 'visible' });
    await expect(page.getByRole('tab', { name: 'Domain', exact: true })).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('thread tab', () => {
  test('shows three columns and the anchor for a selected node', async ({ page }) => {
    await freshPage(page, '#/graph/screen-studio'); // selects screen-studio
    await page.getByRole('tab', { name: 'Thread', exact: true }).click();

    const view = page.locator('.thread-view');
    await expect(view.getByText('Foundations', { exact: true })).toBeVisible();
    await expect(view.getByText('Domain', { exact: true })).toBeVisible();
    await expect(view.getByText('Implementation', { exact: true })).toBeVisible();

    const anchor = view.locator('g.thread-card[data-anchor="true"]');
    await expect(anchor).toHaveCount(1);
    await expect(anchor).toHaveAttribute('data-node-id', 'screen-studio');
  });

  test('re-anchoring re-roots the thread on the newly selected card', async ({ page }) => {
    await freshPage(page, '#/graph/screen-studio');
    await page.getByRole('tab', { name: 'Thread', exact: true }).click();

    const view = page.locator('.thread-view');
    // select a different card (component-force-graph, implementation column)
    await view.locator('g.thread-card[data-node-id="component-force-graph"]').click();
    // selecting alone does not move the anchor
    await expect(view.locator('g.thread-card[data-anchor="true"]')).toHaveAttribute('data-node-id', 'screen-studio');

    await page.getByRole('button', { name: '⚓ Anchor here' }).click();
    await expect(view.locator('g.thread-card[data-anchor="true"]')).toHaveAttribute('data-node-id', 'component-force-graph');
  });

  test('shows the empty state when nothing is selected', async ({ page }) => {
    await freshPage(page, '#/graph'); // no node selected
    await page.getByRole('tab', { name: 'Thread', exact: true }).click();
    await expect(page.getByText('Select a node to trace its thread.')).toBeVisible();
  });
});
