import { rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const modeFile = path.resolve('.continuity-fixture-mode');

test('session continuity shows recovered work, unknowns and recovers from a refused read', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Only the desktop project changes the shared fixture mode.');
  await rm(modeFile, { force: true });

  await page.goto('/');
  await page.getByRole('link', { name: 'Session continuity' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Session continuity' })).toBeVisible();
  await expect(page.getByText('Nothing here resumes work.')).toBeVisible();

  const paused = page.getByRole('article', { name: 'work:session-continuity' });
  await expect(paused.getByText('Needs owner')).toBeVisible();
  await expect(paused.getByText('paused')).toBeVisible();
  await expect(paused.getByText('(operator-supplied)')).toBeVisible();
  await expect(paused.getByText('Has uncommitted work; preserve it')).toBeVisible();
  await expect(paused.getByText('Not admitted')).toBeVisible();

  const partial = page.getByRole('article', { name: 'work:partial-capture' });
  await expect(partial.getByText('Admitted. Still missing proof: artifact, checks, verification.')).toBeVisible();
  await expect(partial.getByText('Partial record. Unknown: owner, checkout, reported state, capture completeness.')).toBeVisible();
  await expect(page.getByText(/observed .* · 2 imports/)).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/resum(e|ing) (the )?work automatically/i);

  // A refused read keeps a visible, recoverable state; fixing it and refreshing recovers.
  await writeFile(modeFile, 'refuse');
  const refresh = page.getByRole('button', { name: /refresh/i });
  await refresh.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Continuity is not available yet' })).toBeVisible();
  await expect(page.getByText('SIS refused the status request.')).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Session continuity is unavailable.');
  await expect(refresh).toBeFocused();

  await writeFile(modeFile, 'ready');
  await refresh.click();
  await expect(page.getByRole('status')).toHaveText('Updated. 2 recovered work items.');
  await expect(page.getByRole('heading', { name: 'Continuity is not available yet' })).toHaveCount(0);
  await rm(modeFile, { force: true });
});

test('session continuity fits a phone with touch-sized controls and rapid refresh', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Phone layout check.');
  await page.goto('/continuity');
  const refresh = page.getByRole('button', { name: /refresh/i });
  await expect(async () => {
    await refresh.click();
    await expect(page.getByRole('article', { name: 'work:session-continuity' })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });

  const box = await refresh.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  // Interrupted refreshes: only the last response renders and the page settles.
  await refresh.tap();
  await refresh.tap();
  await refresh.tap();
  await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('article', { name: 'work:session-continuity' })).toHaveCount(1);
});

test('session continuity respects reduced motion on the refresh control', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One project is enough for the media check.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/continuity');
  const duration = await page.getByRole('button', { name: /refresh/i }).evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(parseFloat(duration)).toBeLessThanOrEqual(0.01);
});
