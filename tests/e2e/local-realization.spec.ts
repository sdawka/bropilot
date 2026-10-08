import { expect, test } from '@playwright/test';

const unique = () => `local-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

test('a local owner can verify and promote a working candidate', async ({ page }, testInfo) => {
  const worldId = unique();
  await page.goto('/');
  expect(await page.evaluate(() => innerWidth)).toBe(page.viewportSize()!.width);
  await page.getByLabel('New World id').fill(worldId);
  await page.getByLabel('New World title').fill('Local realization E2E');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(new RegExp(`/worlds/${worldId}/revisions/.+/work`));
  const createMove = page.getByRole('button', { name: 'Create Move' });
  if (await createMove.isVisible()) await createMove.click();
  await page.getByRole('button', { name: 'Working example' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.screenshot({ path: `.test-artifacts/local-work-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Submit immutable candidate' }).click();
  await page.getByRole('button', { name: 'Request verification' }).click();
  await page.getByRole('link', { name: 'Evaluations', exact: true }).click();
  await page.locator('details summary').first().click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await page.screenshot({ path: `.test-artifacts/local-evaluations-${testInfo.project.name}.png`, fullPage: true });
  await expect(page.getByText('artifact.exists', { exact: false })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Verification status')).toContainText('ready', { timeout: 30_000 });
  await page.getByRole('button', { name: 'Promote candidate' }).click();
  await expect(page).toHaveURL(new RegExp(`/worlds/${worldId}/revisions/.+/overview`));
});

test('a broken health candidate cannot be promoted', async ({ page }) => {
  const worldId = unique();
  await page.goto('/');
  await page.getByLabel('New World id').fill(worldId);
  await page.getByLabel('New World title').fill('Broken local realization E2E');
  await page.getByRole('button', { name: 'Create' }).click();
  const createMove = page.getByRole('button', { name: 'Create Move' });
  if (await createMove.isVisible()) await createMove.click();
  await page.getByRole('button', { name: 'Broken health example' }).click();
  await page.getByRole('button', { name: 'Submit immutable candidate' }).click();
  await page.getByRole('button', { name: 'Request verification' }).click();
  await page.getByRole('link', { name: 'Evaluations', exact: true }).click();
  await expect(page.getByLabel('Verification status')).toContainText('blocked', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Promote candidate' })).toHaveCount(0);
});
