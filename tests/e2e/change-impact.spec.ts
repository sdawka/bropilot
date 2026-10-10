import { test, expect, type Page } from '@playwright/test';
import type { ChangeImpactApiResponse } from '@bropilot/contracts';

const baseline = 'assistant-impact-baseline';
const mapPath = `/worlds/assistant-world/revisions/${baseline}/map`;
const analysisUrl = '/api/v1/worlds/assistant-world/analysis/change-impact';
let commands: string[];
test.beforeEach(async ({ page }) => {
  commands = [];
  page.on('request', request => { if (request.method() === 'POST' && /\/commands(?:\?|$)/.test(request.url())) commands.push(request.url()); });
});
test.afterEach(() => { expect(commands, 'Analysis must never issue canonical World commands').toEqual([]); });

async function openAnalysis(page: Page, path = mapPath) {
  await page.goto(path);
  await page.getByRole('button', { name: 'Analyze change', exact: true }).click();
  return page.getByRole('region', { name: 'Change impact analysis', exact: true });
}
async function compare(page: Page, revisionId: string) {
  const panel = page.getByRole('region', { name: 'Change impact analysis', exact: true });
  await panel.getByLabel('Comparison revision').selectOption(revisionId);
  const responsePromise = page.waitForResponse(response => response.url().endsWith(analysisUrl) && response.request().method() === 'POST');
  await panel.getByRole('button', { name: 'Analyze', exact: true }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const result = await response.json() as ChangeImpactApiResponse;
  await expect(panel.getByLabel('Change impact results')).toBeVisible();
  return result;
}

for (const scenario of ['calendar-adapter', 'completion', 'interface', 'removed-dependency', 'metric-definition', 'incomplete']) {
  test(`saved ${scenario} comparison returns real bounded impact and explicit identities`, async ({ page }) => {
    const panel = await openAnalysis(page);
    const target = `assistant-impact-${scenario}`;
    const result = await compare(page, target);
    expect(result.report.baseline.revisionId).toBe(baseline);
    expect(result.report.target.revisionId).toBe(target);
    expect(result.report.origin).toBe('saved');
    await expect(panel.locator('.comparison-identities')).toContainText(baseline);
    await expect(panel.locator('.comparison-identities')).toContainText(target);
    if (scenario === 'incomplete') { expect(result.report.complete).toBe(false); await expect(panel.locator('.impact-completeness')).toContainText('Incomplete'); }
    if (scenario === 'metric-definition') { expect(result.report.metrics.some(metric => metric.comparability === 'definitionChanged')).toBe(true); await expect(panel).toContainText('Definition changed'); }
    if (scenario === 'completion') await expect(panel).toContainText('percentage points');
    if (result.report.metrics.length) { await expect(panel).toContainText('synthetic sample data'); await expect(panel).toContainText('completed /'); }
    const buttons = panel.getByRole('button', { name: /^Show why/ });
    if (await buttons.count()) {
      await buttons.first().click();
      await expect(page.getByLabel('Explanation path graph')).toBeVisible();
      await expect(page.getByRole('complementary', { name: 'Shared inspector' })).toContainText('Rule');
      expect(await page.locator('.proof-node').count()).toBeGreaterThan(0);
      if (scenario === 'interface') {
        await panel.locator('.impact-object').filter({ hasText: 'Assistant interface' }).first().getByRole('button', { name: /Proposed only$/ }).first().click();
        await page.locator('.proof-node').filter({ hasText: 'Assistant interface' }).first().click();
        await expect(page.getByRole('complementary', { name: 'Shared inspector' })).toContainText('Compact progress review layout');
      }
    }
  });
}

test('older pinned models state that analysis is not configured', async ({ page }) => {
  const panel = await openAnalysis(page, '/worlds/assistant-world/revisions/assistant-valid/map');
  await expect(panel).toContainText('Analysis not configured');
  await expect(panel.getByRole('button', { name: 'Analyze', exact: true })).toHaveCount(0);
});

test('unknown saved comparison pins remain visible with endpoint diagnostics', async ({ page }) => {
  await page.goto(`${mapPath}?compare=missing-impact-revision`);
  const panel = page.getByRole('region', { name: 'Change impact analysis', exact: true });
  await expect(panel).toBeVisible();
  await expect(panel.getByLabel('Comparison revision')).toHaveValue('missing-impact-revision');
  await panel.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect(panel.getByLabel('Comparison revision')).toHaveValue('missing-impact-revision');
});

test('hypothetical Thing revision has a distinct draft identity and resets explicitly', async ({ page }) => {
  const panel = await openAnalysis(page);
  await panel.getByRole('button', { name: 'What if', exact: true }).click();
  const object = panel.getByLabel('Draft object');
  await object.selectOption({ index: 1 });
  await panel.getByLabel('Draft value').fill('hypothetical-calendar-v2');
  await panel.getByRole('button', { name: 'Add to draft', exact: true }).click();
  await expect(panel.locator('.draft-operations')).toContainText('hypothetical-calendar-v2');
  const pending = page.waitForResponse(response => response.url().endsWith(analysisUrl));
  await panel.getByRole('button', { name: 'Analyze', exact: true }).click();
  const result = await (await pending).json() as ChangeImpactApiResponse;
  expect(result.report.origin).toBe('hypothetical');
  expect(result.report.target.revisionId).toMatch(/^draft:/);
  expect(result.report.target.snapshotHash).not.toBe(result.report.baseline.snapshotHash);
  await expect(panel.locator('.comparison-identities')).toContainText('Hypothetical draft');
  await panel.getByRole('button', { name: 'Reset draft', exact: true }).click();
  await expect(panel.locator('.draft-operations')).toHaveCount(0);
  await expect(panel).toContainText('Results are outdated');
  await expect(panel.getByRole('button', { name: 'Analyze', exact: true })).toBeDisabled();
});

test('invalid semantic patch preserves draft edits and shows server diagnostics', async ({ page }) => {
  const panel = await openAnalysis(page);
  await panel.getByRole('button', { name: 'What if', exact: true }).click();
  await panel.getByLabel('Draft change type').selectOption('setProperty');
  await panel.getByLabel('Draft object').selectOption('plan-task-1');
  await panel.getByLabel('Draft property').selectOption('plannedAt');
  await panel.getByLabel('Draft value').fill('invalid-date');
  await panel.getByRole('button', { name: 'Add to draft', exact: true }).click();
  await panel.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(panel.getByRole('alert')).toBeVisible();
  await expect(panel.locator('.draft-operations')).toContainText('invalid-date');
});

test('drafts survive workspace navigation in memory and reload clears them', async ({ page }) => {
  let panel = await openAnalysis(page);
  await panel.getByRole('button', { name: 'What if', exact: true }).click();
  await panel.getByLabel('Draft object').selectOption({ index: 1 });
  await panel.getByLabel('Draft value').fill('remembered-draft');
  await panel.getByRole('button', { name: 'Add to draft', exact: true }).click();
  await page.getByRole('link', { name: 'Overview', exact: true }).click();
  await page.getByRole('link', { name: 'Map', exact: true }).click();
  await page.getByRole('button', { name: 'Analyze change', exact: true }).click();
  panel = page.getByRole('region', { name: 'Change impact analysis', exact: true });
  await panel.getByRole('button', { name: 'What if', exact: true }).click();
  await expect(panel.locator('.draft-operations')).toContainText('remembered-draft');
  await page.reload();
  await page.getByRole('button', { name: 'Analyze change', exact: true }).click();
  await panel.getByRole('button', { name: 'What if', exact: true }).click();
  await expect(panel.locator('.draft-operations')).toHaveCount(0);
  await expect(panel).toContainText('reloading resets them');
});

test('changing target fences an in-flight report and requires explicit analysis', async ({ page }) => {
  const panel = await openAnalysis(page);
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${analysisUrl}`, async route => {
    const response = await route.fetch();
    await released;
    try { await route.fulfill({ response }); } catch { /* fetch was deliberately aborted by the changed input */ }
  });
  await panel.getByLabel('Comparison revision').selectOption('assistant-impact-interface');
  await panel.getByRole('button', { name: 'Analyze', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Analyzing…', exact: true })).toBeDisabled();
  await panel.getByLabel('Comparison revision').selectOption('assistant-impact-completion');
  release();
  await expect(panel.getByRole('button', { name: 'Analyze', exact: true })).toBeEnabled();
  await expect(panel.getByLabel('Change impact results')).toHaveCount(0);
  await page.unroute(`**${analysisUrl}`);
  const result = await compare(page, 'assistant-impact-completion');
  expect(result.report.target.revisionId).toBe('assistant-impact-completion');
});

test('changing pinned baseline discards an in-flight response from the previous baseline', async ({ page }) => {
  const panel = await openAnalysis(page);
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  await page.route(`**${analysisUrl}`, async route => {
    const response = await route.fetch();
    await released;
    try { await route.fulfill({ response }); } catch { /* previous baseline request was cancelled */ }
  });
  await panel.getByLabel('Comparison revision').selectOption('assistant-impact-interface');
  await panel.getByRole('button', { name: 'Analyze', exact: true }).click();
  await page.getByRole('button', { name: 'World context', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'World context' });
  await dialog.locator('button').filter({ hasText: 'Calendar adapter' }).first().click();
  await expect(page).toHaveURL(/assistant-impact-calendar-adapter\/map/);
  release();
  await expect(page.getByLabel('Change impact results')).toHaveCount(0);
  await expect(page.getByLabel('Explanation path graph')).toHaveCount(0);
});

test('exact explanation persists through Visual and Text map representations', async ({ page }) => {
  const panel = await openAnalysis(page);
  await compare(page, 'assistant-impact-calendar-adapter');
  await panel.getByRole('button', { name: /^Show why/ }).first().click();
  await expect(page.getByLabel('Explanation path graph')).toBeVisible();
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(page.getByLabel('Exact explanation path')).toBeVisible();
  await expect(page.getByRole('complementary', { name: 'Shared inspector' })).toBeVisible();
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await expect(page.getByLabel('Explanation path graph')).toBeVisible();
});

test('removed relations remain explicit baseline-only ghosts in exact proof geometry', async ({ page }) => {
  const panel = await openAnalysis(page);
  const result = await compare(page, 'assistant-impact-removed-dependency');
  const missing = result.baselineSnapshot.relations.filter(relation => !result.targetSnapshot.relations.some(target => target.id === relation.id));
  expect(missing.length).toBeGreaterThan(0);
  const closedGroups = panel.locator('.impact-group:not([open]) > summary');
  while (await closedGroups.count()) await closedGroups.first().click();
  const buttons = panel.locator('.proof-button:visible');
  let found = false;
  for (let index = 0; index < await buttons.count(); index++) {
    await buttons.nth(index).click();
    if (await page.locator('.connectors path.baseline-only').count()) { found = true; break; }
  }
  expect(found, 'Removed baseline relation must appear on the selected exact graph').toBe(true);
  await page.locator('.proof-relations summary').click();
  await expect(page.locator('.proof-relations')).toContainText('Baseline only');
});

for (const viewport of [{ width: 1440, height: 900 }, { width: 1221, height: 900 }, { width: 1221, height: 600 }, { width: 390, height: 844 }]) {
  test(`change analysis preserves centered map and readable controls at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    const panel = await openAnalysis(page);
    await compare(page, 'assistant-impact-calendar-adapter');
    await panel.getByRole('button', { name: /^Show why/ }).first().click();
    const graph = page.getByLabel('Explanation path graph');
    const box = await graph.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    for (const node of await page.locator('.proof-node').all()) {
      const nodeBox = await node.boundingBox();
      expect(nodeBox).not.toBeNull();
      expect(nodeBox!.x).toBeGreaterThanOrEqual(0);
      expect(nodeBox!.x + nodeBox!.width).toBeLessThanOrEqual(viewport.width);
    }
    await page.screenshot({ path: `.test-artifacts/impact-${viewport.width}x${viewport.height}-${testInfo.project.name}.png`, fullPage: true });
  });
}
