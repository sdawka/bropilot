import { test, expect } from '@playwright/test';

const pinned = '/worlds/assistant-world/revisions/assistant-valid';

test('the default overview centers the ready assistant without form controls or an inspector', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page).toHaveURL(new RegExp(`${pinned}/overview`));
  await expect(page.getByRole('heading', { name: 'Personal assistant', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Explore this World', exact: true })).toBeVisible();
  await expect(page.locator('input, textarea')).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Shared inspector' })).toHaveCount(0);
  const hero = page.locator('.hero').first();
  const bounds = await hero.boundingBox();
  expect(bounds).not.toBeNull();
  expect(Math.abs((bounds!.x + bounds!.width / 2) - page.viewportSize()!.width / 2)).toBeLessThanOrEqual(2);
  await page.screenshot({ path: `.test-artifacts/overview-${testInfo.project.name}.png`, fullPage: true });
});

test('World context changes pinned model readiness and restores its trigger after Escape', async ({ page }) => {
  await page.goto(`${pinned}/overview`);
  const trigger = page.getByRole('button', { name: 'World context', exact: true });
  await trigger.focus();
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'World context' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  await trigger.click();
  await dialog.getByRole('button', { name: 'Missing evaluation plan', exact: true }).click();
  await expect(page).toHaveURL(/assistant-missing\/overview/);
  await expect(page.getByLabel('Model readiness')).toHaveText('blocked');

  await trigger.click();
  await dialog.getByRole('button', { name: 'Unknown assistant', exact: true }).click();
  await expect(page).toHaveURL(/assistant-unknown\/overview/);
  await expect(page.getByLabel('Model readiness')).toHaveText('unknown');
});

test('text map selection and format persist through every view and reload', async ({ page }) => {
  await page.goto(`${pinned}/map?map=text`);
  await expect(page.getByRole('heading', { name: 'Inside this World' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Text', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const hierarchy = page.locator('.tree');
  await hierarchy.getByRole('button', { name: /Planning service/ }).click();
  await hierarchy.getByRole('button', { name: /Goal-to-calendar planning/ }).click();
  await hierarchy.getByRole('button', { name: /Plan assistant-owned calendar block/ }).click();
  await expect(page.getByRole('complementary', { name: 'Shared inspector' })).toContainText('Plan assistant-owned calendar block');
  const selected = new URL(page.url()).searchParams.get('selected');
  expect(selected).toBeTruthy();

  for (const view of ['Overview', 'Map', 'Theory', 'Work', 'Evaluations', 'History']) {
    await page.getByRole('link', { name: view, exact: true }).click();
    expect(new URL(page.url()).searchParams.get('selected')).toBe(selected);
    expect(new URL(page.url()).searchParams.get('map')).toBe('text');
  }
  await page.getByRole('link', { name: 'Map', exact: true }).click();
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('map')).toBe('visual');
  expect(new URL(page.url()).searchParams.get('selected')).toBe(selected);
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  expect(new URL(page.url()).searchParams.get('map')).toBe('text');
  expect(new URL(page.url()).searchParams.get('selected')).toBe(selected);
  await page.reload();
  expect(new URL(page.url()).searchParams.get('map')).toBe('text');
  await expect(page.getByRole('complementary', { name: 'Shared inspector' })).toContainText('Plan assistant-owned calendar block');
});

test('visual map is the default, centers a selected peer, and exposes linked peers', async ({ page }, testInfo) => {
  if (testInfo.project.name === 'mobile') await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${pinned}/map`);
  const map = page.getByRole('region', { name: 'Visual World map', exact: true });
  await expect(map).toBeVisible();
  await expect(page.getByRole('button', { name: 'Visual', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => innerWidth)).toBe(testInfo.project.name === 'mobile' ? 390 : page.viewportSize()!.width);
  await page.screenshot({ path: `.test-artifacts/map-${testInfo.project.name}.png`, fullPage: true });
  const focus = map.getByLabel('Focus: Personal assistant', { exact: true });
  const peers = map.locator('.peer-node');
  await expect(peers).toHaveCount(8);
  const focusBox = await focus.boundingBox();
  expect(focusBox).not.toBeNull();
  const peerBoxes = [];
  for (let index = 0; index < await peers.count(); index++) {
    const peerBox = await peers.nth(index).boundingBox();
    expect(peerBox).not.toBeNull();
    peerBoxes.push(peerBox!);
    const overlaps = peerBox!.x < focusBox!.x + focusBox!.width
      && peerBox!.x + peerBox!.width > focusBox!.x
      && peerBox!.y < focusBox!.y + focusBox!.height
      && peerBox!.y + peerBox!.height > focusBox!.y;
    expect(overlaps).toBe(false);
  }
  for (let left = 0; left < peerBoxes.length; left++) {
    for (let right = left + 1; right < peerBoxes.length; right++) {
      const a = peerBoxes[left];
      const b = peerBoxes[right];
      expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false);
    }
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const peer = map.getByRole('button', { name: /Planning service/ });
  await expect(peer).toBeVisible();
  await peer.click();
  await expect(page.getByRole('complementary', { name: 'Shared inspector' })).toContainText('Planning service');
  expect(new URL(page.url()).searchParams.get('selected')).toBe('node-thing-planning');
  const selectedFocus = map.getByLabel('Focus: Planning service', { exact: true });
  await expect(selectedFocus).toBeVisible();
  await expect(selectedFocus).toBeFocused();
  expect(await map.locator('.peer-node').count()).toBeGreaterThan(0);
  await page.screenshot({ path: `.test-artifacts/focused-map-${testInfo.project.name}.png`, fullPage: true });
});

test('search moves to the visual map, focuses the field, and finds nested objects', async ({ page }) => {
  await page.goto(`${pinned}/overview`);
  await page.getByRole('button', { name: 'Search World', exact: true }).click();
  await expect(page).toHaveURL(/\/map$/);
  await expect(page.getByRole('region', { name: 'Visual World map', exact: true })).toBeVisible();
  const field = page.getByRole('searchbox', { name: 'Search World objects' });
  await expect(field).toBeFocused();
  await field.fill('Plan assistant-owned calendar block');
  await page.getByRole('button', { name: /Plan assistant-owned calendar block/ }).click();
  await expect(page.getByRole('complementary', { name: 'Shared inspector' })).toContainText('Plan assistant-owned calendar block');
});

test('unavailable revision and missing selection keep their pins until a valid selection replaces one', async ({ page }) => {
  await page.goto('/worlds/assistant-world/revisions/absent/map');
  await expect(page.getByRole('heading', { name: 'Pinned revision unavailable' })).toBeVisible();
  await expect(page).toHaveURL(/revisions\/absent\/map/);

  await page.goto(`${pinned}/map?map=text&selected=missing-object`);
  await expect(page.getByText('Pinned object unavailable.', { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('selected')).toBe('missing-object');
  await page.locator('.tree').getByRole('button', { name: /Planning service/ }).click();
  expect(new URL(page.url()).searchParams.get('selected')).toBe('node-thing-planning');
});

test('map representation survives revision navigation through World context', async ({ page }) => {
  await page.goto(`${pinned}/map?map=visual`);
  await page.getByRole('button', { name: 'World context', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'World context' });
  await dialog.getByRole('button', { name: 'Missing evaluation plan', exact: true }).click();
  await expect(page).toHaveURL(/assistant-missing\/map\?map=visual/);
  await expect(page.getByRole('button', { name: 'Visual', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('all six view links fit a strict 390px mobile viewport and keyboard selection opens the inspector', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${pinned}/map?map=text`);
  expect(await page.evaluate(() => innerWidth)).toBe(390);
  for (const view of ['Overview', 'Map', 'Theory', 'Work', 'Evaluations', 'History']) {
    const link = page.getByRole('link', { name: view, exact: true });
    await expect(link).toBeVisible();
    const bounds = await link.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  }
  expect(await page.locator('.nav').evaluate(nav => nav.scrollWidth <= nav.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const item = page.locator('.tree button').first();
  await item.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Shared inspector' })).toBeVisible();
});

test('short desktop centers overview actions without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await page.goto(`${pinned}/overview`);
  const action = page.locator('.hero .actions');
  const bounds = await action.boundingBox();
  expect(bounds).not.toBeNull();
  expect(Math.abs((bounds!.x + bounds!.width / 2) - 450)).toBeLessThanOrEqual(2);
  const primary = await page.getByRole('button', { name: 'Explore this World', exact: true }).boundingBox();
  expect(primary).not.toBeNull();
  expect(primary!.y + primary!.height).toBeLessThanOrEqual(700);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
