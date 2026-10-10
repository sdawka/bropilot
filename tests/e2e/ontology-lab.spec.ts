import { test, expect } from '@playwright/test';

test('ontology lab replays real draft checkpoints and highlights each processor', async ({ page }, testInfo) => {
  await page.goto('/lab/ontology');
  await expect(page.getByRole('heading', { name: 'From a rough thought to a testable World' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'exploring' })).toBeChecked();
  await page.getByRole('button', { name: 'Explore example', exact: true }).click();
  const log = page.getByRole('complementary', { name: 'Information flow log' });
  await expect(log.getByRole('button', { name: /Ontology run complete/ })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Criteria feedback' })).toContainText('unknown');
  const selection = page.getByRole('region', { name: 'Question selection detail' });
  await expect(selection).toContainText('candidate');
  await expect(selection).not.toContainText('No question selected');
  await expect(page.getByRole('region', { name: 'Recorded stage timings' })).toContainText('extraction');
  await expect(page.getByRole('region', { name: 'Provisional semantic review' })).toHaveCount(0);
  await log.getByRole('button', { name: /Description received/ }).click();
  await expect(page.locator('.message-bubble.highlighted')).toHaveCount(1);
  await page.getByRole('button', { name: 'Text', exact: true }).click();
  await expect(page.locator('.ontology-text-row')).toHaveCount(2);
  await log.getByRole('button', { name: /Load labeled example/ }).click();
  await expect(page.locator('.agent-card.active')).toContainText('extractor');
  const mapped = log.locator('button').filter({ hasText: /Object updated|Added.*|Map object/ }).first();
  await expect(mapped).toBeVisible();
  await mapped.click();
  expect(await page.locator('.ontology-text-row').count()).toBeGreaterThan(2);
  expect(await page.locator('.ontology-text-row.highlighted').count()).toBeGreaterThan(0);
  await log.getByRole('button', { name: /Criteria status:/ }).click();
  await expect(page.locator('.agent-card.active')).toContainText('Rust criteria');
  expect(await page.locator('.criteria-strip li.highlighted').count()).toBeGreaterThan(0);
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  const nodes = await page.locator('.ontology-map button').evaluateAll(elements => elements.map(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  }));
  for (let left = 0; left < nodes.length; left++) {
    for (let right = left + 1; right < nodes.length; right++) {
      const a = nodes[left], b = nodes[right];
      expect(a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y).toBe(false);
    }
  }
  await page.screenshot({ path: `.test-artifacts/ontology-lab-${testInfo.project.name}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.reload();
  const savedRuns = page.getByRole('combobox', { name: 'Saved ontology runs' });
  await expect(savedRuns).toBeVisible();
  const savedId = await savedRuns.locator('option').nth(1).getAttribute('value');
  await savedRuns.selectOption(savedId!);
  await expect(page.getByText(/Saved replay/)).toBeVisible();
  await expect(log.getByRole('button', { name: /Ontology run complete/ })).toBeVisible();
});

test('trace playback advances multiple steps and exports the recorded run', async ({ page }) => {
  await page.goto('/lab/ontology');
  await page.getByRole('button', { name: 'Explore example', exact: true }).click();
  const log = page.getByRole('complementary', { name: 'Information flow log' });
  await expect(log.getByRole('button', { name: /Ontology run complete/ })).toBeVisible();
  await log.getByRole('button', { name: /Description received/ }).click();
  await log.getByRole('button', { name: 'Play trace' }).click();
  await expect.poll(async () => Number(await log.locator('button.selected .trace-seq').textContent())).toBeGreaterThanOrEqual(2);
  await log.getByRole('button', { name: 'Previous', exact: true }).click();
  const selected = await log.locator('button.selected .trace-seq').textContent();
  await page.waitForTimeout(1100);
  await expect(log.locator('button.selected .trace-seq')).toHaveText(selected!);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export run', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/^ontology-lab.*\.json$/);
});

test('a thoughtful question explains its gap and preserves context for a short reply', async ({ page }) => {
  await page.route('**/api/v1/ontology-lab/capabilities', route => route.fulfill({ json: { available: true, provider: 'codex', message: 'Test provider; no live model call.' } }));
  await page.goto('/lab/ontology');
  await page.getByRole('button', { name: 'Explore example', exact: true }).click();
  const question = page.getByRole('region', { name: 'Next useful question' });
  await expect(question.getByRole('heading')).toContainText(/\?/);
  await expect(question).toContainText(/raised|unresolved|question/i);
  const text = await question.getByRole('heading').textContent();
  await question.getByRole('button', { name: 'Answer this', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Description or follow-up' });
  await expect(input).toBeFocused();
  await input.fill('60 minutes, reviewed each Friday.');
  let submitted: { messages: { role: string; text: string }[]; stage?: string } | undefined;
  await page.route('**/api/v1/ontology-lab/run', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 503, json: { message: 'Live model disabled in this browser test.' } });
  });
  await page.getByRole('button', { name: 'Run with Codex', exact: true }).click();
  await expect.poll(() => submitted?.messages.at(-1)?.text).toBe('60 minutes, reviewed each Friday.');
  expect(submitted?.stage).toBe('exploring');
  expect(submitted?.messages.at(-2)).toMatchObject({ role: 'assistant', text });
  await expect(page.getByRole('alert')).toContainText('Live model disabled');
});
