import { writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('workspace maps sources and answers from the canvas', async ({ page }, testInfo) => {
  const title = `e2e ${testInfo.project.name} ${Date.now()}`;
  await page.request.post('/api/canvases', {
    data: { title, template: 'blank' },
  });

  await page.goto('/');
  await expect(page.getByTestId('workspace')).toBeVisible();
  await expect(page.getByText('Starlight Agent Canvas')).toBeVisible();
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await expect(page.getByTestId('intake-text')).toBeVisible();

  await page.getByTestId('intake-text').fill('My canvas note: collect the product gaps and turn them into a brief.');
  await expect(page.getByTestId('quick-note')).toBeEnabled();
  await page.getByTestId('quick-note').click();
  await expect(page.getByTestId('inspector-title')).toBeVisible();
  await expect(page.getByTestId('inspector-title')).toHaveValue('My canvas note: collect the product gaps and turn them into a brief.');
  await expect(page.getByTestId('save-node')).toBeEnabled();
  await page.getByTestId('inspector-title').fill('Edited canvas note');
  await page.getByTestId('inspector-body').fill('Edited note body with product gaps, source needs, and next actions.');
  await page.getByTestId('save-node').click();
  await expect(page.getByTestId('save-node')).toBeEnabled();

  await page.getByTestId('intake-text').fill('Nodeflow connects YouTube, PDFs, websites, and transcripts into visual AI workflows.');
  await expect(page.getByTestId('intake-ingest')).toBeEnabled();
  await page.getByTestId('intake-ingest').click();
  await expect(page.getByTestId('inspector-body')).toHaveValue(/Nodeflow connects YouTube/);
  await expect(page.getByTestId('intake-ingest')).toBeDisabled();
  await expect(page.getByTestId('quick-note')).toBeEnabled();

  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Pasted anywhere source: creators paste video notes directly onto the canvas for synthesis.');
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.getByTestId('inspector-body')).toHaveValue(/Pasted anywhere source/);
  await expect(page.getByTestId('quick-note')).toBeEnabled();

  await page.getByRole('button', { name: 'Summarize' }).click();
  await expect(page.getByTestId('inspector-title')).toHaveValue('summarize output');

  await page.getByTestId('ask-prompt').fill('What source types are supported?');
  await page.getByTestId('ask-canvas').click();
  await expect(page.getByTestId('inspector-title')).toHaveValue('answer question output');
  await expect(page.getByTestId('copy-context')).toBeEnabled();

  const exportHref = await page.getByLabel('Export JSON').getAttribute('href');
  expect(exportHref).toBeTruthy();
  const exportResponse = await page.request.get(exportHref!);
  await expect(exportResponse).toBeOK();
  expect(exportResponse.headers()['content-type']).toContain('application/json');
  const exportedCanvas = await exportResponse.json() as { id: string; title: string };
  expect(JSON.stringify(exportedCanvas)).toContain('Edited canvas note');

  const importTitle = `imported ${testInfo.project.name} ${Date.now()}`;
  exportedCanvas.id = `canvas-${importTitle.replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase()}`;
  exportedCanvas.title = importTitle;
  const importPath = testInfo.outputPath(`${importTitle.replace(/\s+/g, '-')}.json`);
  await writeFile(importPath, JSON.stringify(exportedCanvas, null, 2), 'utf8');

  await page.getByTestId('import-canvas-file').setInputFiles(importPath);
  await expect(page.getByRole('button', { name: new RegExp(importTitle) })).toBeVisible();
  await expect.poll(async () => {
    return await page.getByLabel('Export JSON').getAttribute('href') ?? '';
  }).toContain(exportedCanvas.id);
});
