import { expect, test } from '@playwright/test';

async function createRealization(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Try a realization', exact: true }).click();
  await expect(page).toHaveURL(/\/worlds\/worker-app-[^/]+\/revisions\/[^/]+\/work/);
  return new URL(page.url()).pathname.split('/')[2]!;
}

test('a local owner verifies a preloaded working candidate, reloads it, and promotes server truth', async ({ page }, testInfo) => {
  const worldId = await createRealization(page);
  await expect(page.getByRole('button', { name: 'Working example', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Submit candidate', exact: true })).toBeVisible();
  await page.screenshot({ path: `.test-artifacts/local-work-${testInfo.project.name}.png`, fullPage: true });

  await page.getByRole('button', { name: 'Submit candidate', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Run checks', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Run checks', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Run checks', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/worlds/${worldId}/revisions/[^/]+/evaluations`));
  await expect(page.getByText('Source exists', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('pass', { exact: true }).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByLabel('Verification status')).toContainText('ready', { timeout: 30_000 });
  const evidence = page.locator('.evidence-details').filter({ has: page.locator('dl.metadata') }).first();
  await expect(evidence.locator('dd').first()).toBeHidden();
  await evidence.getByText('Inspect evidence', { exact: true }).click();
  await expect(evidence.locator('dd').first()).toBeVisible();
  await page.screenshot({ path: `.test-artifacts/local-evaluations-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Promote candidate', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/worlds/${worldId}/revisions/[^/]+/overview`));
  await expect(page.getByText('Canonical version', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Canonical version', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'World context', exact: true }).click();
  const context = page.getByRole('dialog', { name: 'World context' });
  await context.getByRole('button', { name: 'Desired model', exact: true }).click();
  await page.getByRole('link', { name: 'Evaluations', exact: true }).click();
  await expect(page.getByText('Source exists', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Promote candidate', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Work', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start a Move', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Submit candidate', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Run checks', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open current revision', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/worlds/${worldId}/revisions/[^/]+/work`));
  await expect(page.getByRole('button', { name: 'Start a Move', exact: true })).toBeVisible();
});

test('a broken health candidate remains blocked and cannot be promoted', async ({ page }) => {
  await createRealization(page);
  await page.getByRole('button', { name: 'Broken health example', exact: true }).click();
  await page.getByRole('button', { name: 'Submit candidate', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Broken health example', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Run checks', exact: true }).click();
  await expect(page.getByLabel('Verification status')).toContainText('blocked', { timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Promote candidate', exact: true })).toHaveCount(0);
});
