import { expect, test } from '@playwright/test';

test('workspace creates node and runs local action', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('workspace')).toBeVisible();
  await expect(page.getByText('Starlight Agent Canvas')).toBeVisible();
  await expect(page.getByTestId('add-note')).toBeEnabled();

  await page.getByTestId('add-note').click();
  await expect(page.getByText('Added note node.')).toBeVisible();

  await page.getByRole('button', { name: 'Summarize' }).click();
  await expect(page.getByText('Ran summarize.')).toBeVisible();
  await expect(page.getByTestId('inspector')).toBeVisible();
});
