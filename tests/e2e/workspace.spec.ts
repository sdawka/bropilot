import { test, expect } from '@playwright/test';

const pinned = '/worlds/assistant-world/revisions/assistant-valid';
test('pinned workspace reads Rust readiness and preserves object selection across views', async ({ page }) => {
  await page.goto(`${pinned}/overview`);
  await expect(page.getByText('Read-only example.', { exact: true })).toBeVisible();
  await expect(page.getByText('Model readiness', { exact: true })).toBeVisible();
  await expect(page.getByText('ready', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Map', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Focused map' })).toBeVisible();
  const hierarchy = page.locator('.tree');
  await hierarchy.getByRole('button', { name: /Planning service/ }).click();
  await hierarchy.getByRole('button', { name: /Goal-to-calendar planning/ }).click();
  await hierarchy.getByRole('button', { name: /Plan assistant-owned calendar block/ }).click();
  await expect(page.getByRole('complementary', { name: 'Shared inspector' })).toContainText('Plan assistant-owned calendar block');
  const selected = new URL(page.url()).searchParams.get('selected');
  expect(selected).toBeTruthy();
  await page.getByRole('link', { name: 'Theory', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/theory.*selected=${selected}`));
  await page.reload();
  await expect(page.getByRole('complementary', { name: 'Shared inspector' })).toContainText('Plan assistant-owned calendar block');
});

test('revision choices expose blocked and unknown model states, without replacing missing pins', async ({ page }) => {
  await page.goto(`${pinned}/overview`);
  const revision = page.getByRole('combobox', { name: 'Revision', exact: true });
  await expect(revision.locator('option')).toHaveCount(4);
  await revision.selectOption('assistant-world/assistant-missing');
  await expect(page.getByText('blocked', { exact: true })).toBeVisible();
  await revision.selectOption('assistant-world/assistant-unknown');
  await expect(page.getByText('unknown', { exact: true })).toBeVisible();
  await page.goto('/worlds/assistant-world/revisions/absent/map');
  await expect(page.getByRole('heading', { name: 'Pinned revision unavailable' })).toBeVisible();
  await expect(page).toHaveURL(/revisions\/absent\/map/);
});

test('controls fit phone and desktop widths and keyboard reaches hierarchy', async ({ page }) => {
  await page.goto(`${pinned}/map`);
  await expect(page.getByRole('heading', { name: 'Focused map' })).toBeVisible();
  for (const view of ['Overview', 'Map', 'Theory', 'Work', 'Evaluations', 'History']) {
    const link = page.getByRole('link', { name: view, exact: true });
    await expect(link).toBeVisible();
    const bounds = await link.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  }
  expect(await page.locator('.nav').evaluate(nav => nav.scrollWidth <= nav.clientWidth)).toBe(true);
  await expect(page.getByRole('combobox', { name: 'World', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Revision', exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  expect(overflow).toBe(false);
  const item = page.locator('.tree button').first();
  await item.focus();
  await expect(item).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('complementary', { name: 'Shared inspector' })).toBeVisible();
});


test('a missing selected object stays pinned until the user selects a valid object', async ({ page }) => {
  await page.goto(`${pinned}/map?selected=missing-object`);
  await expect(page.getByText(/missing-object/).last()).toBeVisible();
  expect(new URL(page.url()).searchParams.get('selected')).toBe('missing-object');
  await page.locator('.tree').getByRole('button', { name: /Planning service/ }).click();
  await expect(page.getByText('Pinned object unavailable.', { exact: true })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get('selected')).toBe('node-thing-planning');
});
