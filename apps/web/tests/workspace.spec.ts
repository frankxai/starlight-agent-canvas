import { expect, test } from '@playwright/test';

test('workspace maps sources and answers from the canvas', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('workspace')).toBeVisible();
  await expect(page.getByText('Starlight Agent Canvas')).toBeVisible();
  await expect(page.getByTestId('add-note')).toBeEnabled();

  await page.getByTestId('add-note').click();
  await expect(page.getByText('Added note node.')).toBeVisible();

  await page.getByTestId('intake-text').fill('Nodeflow connects YouTube, PDFs, websites, and transcripts into visual AI workflows.');
  await page.getByTestId('intake-ingest').click();
  await expect(page.getByText(/Mapped 1 source item/)).toBeVisible();

  await page.getByRole('button', { name: 'Summarize' }).click();
  await expect(page.getByText('Ran summarize.')).toBeVisible();

  await page.getByTestId('ask-prompt').fill('What source types are supported?');
  await page.getByTestId('ask-canvas').click();
  await expect(page.getByText('Ran answer question.')).toBeVisible();
  await expect(page.getByTestId('inspector')).toBeVisible();
});
