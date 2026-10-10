import { test, expect, type Page } from '@playwright/test';
import type { ChangeImpactApiResponse } from '@bropilot/contracts';

const endpoint = '/api/v1/worlds/assistant-world/analysis/change-impact';
async function open(page: Page) {
  await page.goto('/worlds/assistant-world/revisions/assistant-impact-baseline/map');
  await page.getByRole('button', { name: 'Analyze change', exact: true }).click();
  return page.getByRole('region', { name: 'Change impact analysis', exact: true });
}
for (const [scenario, answer, reviews] of [
  ['calendar-adapter', /stays at 60%/, 3],
  ['interface', /stays at 60%/, 0],
  ['completion', /60% to 40%/, 1],
  ['metric-definition', /not directly comparable/, 1],
  ['incomplete', /unknown/, 3],
] as const) {
  test(`usefulness leads with the real ${scenario} answer and review priorities`, async ({ page }, testInfo) => {
    const panel = await open(page);
    await panel.getByLabel('Comparison revision').selectOption(`assistant-impact-${scenario}`);
    const pending = page.waitForResponse(response => response.url().endsWith(endpoint));
    await panel.getByRole('button', { name: 'Analyze', exact: true }).click();
    const result = await (await pending).json() as ChangeImpactApiResponse;
    const summary = panel.getByLabel('Impact answer', { exact: true });
    await expect(summary).toContainText(answer);
    expect(await panel.locator('.impact-results > :first-child').getAttribute('aria-label')).toBe('Impact answer');
    await expect(panel.getByLabel('Checks needing review').locator('.impact-check')).toHaveCount(reviews);
    if (scenario === 'calendar-adapter') {
      await expect(panel.getByLabel('Changed inputs')).toContainText('calendar-adapter@1 → calendar-adapter@2');
      const effects = panel.getByLabel('Potential downstream effects');
      await effects.getByText('Planning service', { exact: false }).first().click();
      const scheduling = effects.locator('.impact-object').filter({ hasText: /^Scheduling/ }).first();
      await scheduling.getByRole('button', { name: /Proposed only$/ }).first().click();
      const trigger = page.getByLabel('Change that starts this path');
      await expect(trigger).toContainText('Managed calendar adapter');
      await expect(trigger).toContainText('calendar-adapter@1 → calendar-adapter@2');
      await expect(trigger).toContainText('Declared sample calendar availability');
      await expect(page.getByLabel('Explanation path graph')).toBeVisible();
      await page.getByRole('button', { name: 'Text', exact: true }).click();
      await expect(page.getByLabel('Exact explanation path')).toContainText('calendar-adapter@1 → calendar-adapter@2');
      await page.getByRole('button', { name: 'Visual', exact: true }).click();
      await page.setViewportSize(testInfo.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1221, height: 600 });
      await trigger.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `.test-artifacts/usefulness-proof-${testInfo.project.name}.png` });
    }
    if (scenario === 'interface') {
      await expect(panel.getByLabel('Potential downstream effects')).toContainText('No downstream effects were derived');
      expect(result.report.evidence.every(evidence => evidence.applicability === 'inputsMatch')).toBe(true);
    }
    if (scenario === 'incomplete') await expect(summary).toContainText('Coverage is incomplete');
    if (scenario === 'metric-definition') await expect(summary).not.toContainText('percentage points');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}

test('usefulness counts two edited inputs separately from generated metadata and preserves noncomparability', async ({ page }, testInfo) => {
  const panel = await open(page);
  await panel.getByRole('button', { name: 'What if', exact: true }).click();
  await panel.getByLabel('Draft object').selectOption('thing-calendar-adapter');
  await panel.getByLabel('Draft value').fill('calendar-adapter@novel');
  await panel.getByRole('button', { name: 'Add to draft', exact: true }).click();
  await panel.getByLabel('Draft change type').selectOption('setMetricDefinition');
  await panel.getByLabel('Draft object').selectOption('metric-completed-planned-work');
  await panel.getByLabel('Draft metric definition').selectOption('completedPlannedTasksIncludingCancelled');
  await panel.getByRole('button', { name: 'Add to draft', exact: true }).click();
  const pending = page.waitForResponse(response => response.url().endsWith(endpoint));
  await panel.getByRole('button', { name: 'Analyze', exact: true }).click();
  const result = await (await pending).json() as ChangeImpactApiResponse;
  expect(result.report.changes).toHaveLength(4);
  await expect(panel.locator('.impact-completeness')).toContainText('2 draft edits');
  await expect(panel.locator('.impact-completeness')).toContainText('4 model differences');
  await expect(panel.getByLabel('Changed inputs').locator('.impact-input')).toHaveCount(2);
  await expect(panel.getByLabel('Impact answer', { exact: true })).toContainText('50% proposed');
  await expect(panel.getByLabel('Impact answer', { exact: true })).toContainText('not directly comparable');
  await expect(panel.getByLabel('Impact answer', { exact: true })).not.toContainText('percentage points');
  await page.setViewportSize(testInfo.project.name === 'mobile' ? { width: 390, height: 844 } : { width: 1221, height: 600 });
  await panel.getByLabel('Impact answer', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: `.test-artifacts/usefulness-answer-${testInfo.project.name}.png` });
});
