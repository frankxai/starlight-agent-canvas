import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('website directions preserve edits, record a choice and export a source-backed brief', async ({ page }, testInfo) => {
  const created = await page.request.post('/api/canvases', { data: { title: `Website ${testInfo.project.name} ${Date.now()}`, template: 'blank' } });
  await expect(created).toBeOK(); const { canvas } = await created.json();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/website/${canvas.id}`);
  await page.getByRole('button', { name: 'Load authored example' }).click();
  await expect(page.getByRole('status')).toContainText('Authored example');
  await expect(page.getByRole('button', { name: 'Choose The open workshop', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Edit The open workshop', exact: true }).click();
  await page.getByLabel('The open workshop: headline', { exact: true }).fill('Make the next version worth keeping.');
  await expect.poll(async () => page.evaluate((id) => sessionStorage.getItem(`starlight.website.draft.v1:${id}`), canvas.id)).toContain('Make the next version worth keeping.');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Recovered an unsaved draft');
  await expect(page.getByRole('heading', { name: 'Make the next version worth keeping.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save website plan', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Plan saved locally');
  const choose = page.getByRole('button', { name: 'Choose The open workshop', exact: true });
  await choose.focus(); await page.keyboard.press('Enter');
  await expect(page.getByTestId('selected-website-direction')).toContainText('The open workshop');
  await expect(page.getByRole('button', { name: 'Selected direction', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const packetResponse = await page.request.get(`/api/canvases/${canvas.id}/website/export`); await expect(packetResponse).toBeOK();
  const packet = await packetResponse.json();
  expect(packet.direction.headline).toBe('Make the next version worth keeping.');
  expect(packet.selected.checkpointId).toMatch(/^checkpoint-/);
  expect(packet.gaps.join(' ')).toContain('mobile');
  const markdown = await page.request.get(`/api/canvases/${canvas.id}/website/export?format=markdown`);
  expect(await markdown.text()).toContain(packet.selected.checkpointId);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const capture = testInfo.outputPath('website-directions.png');
  await page.getByTestId('direction-options').screenshot({ path: capture });
  const bytes = await readFile(capture);
  const sidecar = {
    $schema: 'https://frankx.ai/schemas/vis-provenance-sidecar.schema.json', schema_version: '1.0.0',
    asset: { id: `website-directions-${testInfo.project.name}`, version: 1, media_type: 'image/png', sha256: createHash('sha256').update(bytes).digest('hex'), relative_path: 'website-directions.png' },
    generation: { provider: 'Playwright browser capture / GitHub Actions', model: null, seed: null, prompt: 'Capture the real reduced-motion website direction workbench after a custom headline edit, save, keyboard choice and successful checkpoint-linked export. Authored synthetic fixture; no model generation or customer approval.', settings: { revision: process.env.GITHUB_SHA ?? null, project: testInfo.project.name, reduced_motion: true }, created_at: new Date().toISOString(), output_paths: ['website-directions.png'] },
    agent: { harness: 'Codex', session: '01a113ec-1c95-70a0-84eb-ae2b8aae03a3' },
    evaluation: { schema_validation: 'Endpoint unavailable locally; structure follows existing sidecars. No schema validation claimed.', visual_inspection: 'Pending actual capture inspection.' },
    rights: { source: 'Owned authored synthetic test fixture', public_release: false },
  };
  await writeFile(`${capture}.vis.provenance.json`, JSON.stringify(sidecar, null, 2));
  await testInfo.attach('website-directions', { path: capture, contentType: 'image/png' });

  await page.reload();
  await expect(page.getByTestId('selected-website-direction')).toContainText(packet.selected.checkpointId);
  await page.getByRole('link', { name: 'Return to canvas' }).click();
  await expect(page.getByRole('link', { name: 'Shape website directions' })).toBeVisible();
  const storedCanvas = await page.request.get(`/api/canvases/${canvas.id}`);
  const stored = (await storedCanvas.json()).canvas;
  expect(stored.nodes.filter((node: { metadata: { entityType?: string } }) => node.metadata.entityType === 'design_option')).toHaveLength(3);
});

test('conflicts and invalid imports keep the draft and deny cross-origin changes', async ({ page }, testInfo) => {
  const created = await page.request.post('/api/canvases', { data: { title: `Conflict ${testInfo.project.name} ${Date.now()}`, template: 'blank' } });
  const { canvas } = await created.json();
  await page.goto(`/website/${canvas.id}`);
  await page.getByRole('button', { name: 'Load authored example' }).click();
  await page.getByRole('button', { name: 'Save website plan', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Plan saved locally');
  const saved = await page.request.get(`/api/canvases/${canvas.id}/website`); const { record } = await saved.json();
  await page.getByLabel('Plan title', { exact: true }).fill('My retained draft');
  const otherPlan = { ...record.plan, title: 'Another writer saved this' };
  const otherSave = await page.request.put(`/api/canvases/${canvas.id}/website`, { data: { plan: otherPlan, expectedHash: record.planHash } }); await expect(otherSave).toBeOK();
  await page.getByRole('button', { name: 'Save website plan', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed in another client');
  await expect(page.getByLabel('Plan title', { exact: true })).toHaveValue('My retained draft');
  await page.getByRole('button', { name: 'Inspect saved version' }).click();
  await page.getByText('Compare with the saved plan', { exact: true }).click();
  await expect(page.getByText(/Another writer saved this:/)).toBeVisible();
  await page.getByLabel('Import website plan').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":"starlight.websitePlan.v1","options":[],"sections":[],"brief":{},"snapshot":{}}') });
  await expect(page.getByRole('alert')).toContainText('not a valid website plan');
  await expect(page.getByLabel('Plan title', { exact: true })).toHaveValue('My retained draft');
  const denied = await page.request.put(`/api/canvases/${canvas.id}/website`, { headers: { Origin: 'https://untrusted.example' }, data: { plan: record.plan, expectedHash: record.planHash } }); expect(denied.status()).toBe(403);
  const oversized = await page.request.put(`/api/canvases/${canvas.id}/website`, { data: { plan: 'x'.repeat(120_001) } }); expect(oversized.status()).toBe(413);
  expect((await (await page.request.get(`/api/canvases/${canvas.id}/website`)).json()).record.plan.title).toBe('Another writer saved this');
});
