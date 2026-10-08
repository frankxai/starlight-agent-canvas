import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { applyWebsiteGeneration, type WebsitePlan } from '@starlight-agent-canvas/core';
import { pagePreviewHtml, type PageLayout } from '../lib/website-page-preview';

test('generated proposals preserve newer edits, recover, and export the chosen editable page', async ({ page }, testInfo) => {
  const created = await page.request.post('/api/canvases', { data: { title: `Generation fixture ${testInfo.project.name} ${Date.now()}`, template: 'blank' } });
  const { canvas } = await created.json();
  const endpoint = `/api/canvases/${canvas.id}/website/generate`;
  expect((await page.request.post(endpoint, { data: { plan: {} } })).status()).toBe(503);
  expect((await page.request.post(endpoint, { headers: { Origin: 'https://untrusted.example' }, data: { plan: {} } })).status()).toBe(403);
  expect((await page.request.post(endpoint, { headers: { 'Content-Type': 'text/plain' }, data: '{}' })).status()).toBe(415);
  let release: (() => void) | undefined; let held = true; let sent: WebsitePlan | undefined;
  await page.route(`**${endpoint}`, async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { enabled: true, provider: 'openai', model: 'synthetic-browser-fixture', boundary: 'Synthetic response fixture; no provider call or customer proof.' } });
    const { plan } = route.request().postDataJSON() as { plan: WebsitePlan }; sent = plan;
    const output = { options: plan.options.map((option, index) => ({ ...option, title: `Fixture approach ${index + 1}`, headline: `Fixture whole-page direction ${index + 1}`, sectionCopy: plan.sections.map((section) => ({ sectionId: section.id, copy: `Fixture approach ${index + 1}: ${section.copy}`, action: `Fixture action ${index + 1}` })), sourceQuotes: [plan.snapshot.notes.slice(0, 60)] })) };
    const proposal = applyWebsiteGeneration(plan, output, { version: 'starlight.websiteGeneration.v1', provider: 'openai', requestedModel: 'fixture-model', returnedModel: 'fixture-model', generatedAt: '2026-10-07T10:00:00Z', inputHash: '1'.repeat(64), outputHash: '2'.repeat(64), promptHash: '3'.repeat(64), authority: 'local_assertion' });
    if (held) await new Promise<void>((resolve) => { release = resolve; });
    await route.fulfill({ json: { plan: proposal } });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.goto(`/website/${canvas.id}`);
  await page.getByRole('button', { name: 'Load authored example' }).click();
  const region = page.getByRole('heading', { name: 'Explore three complete page directions', exact: true }).locator('..');
  await region.getByRole('button', { name: 'Send source and generate directions', exact: true }).click();
  await expect.poll(() => Boolean(release)).toBe(true);
  await page.getByLabel('Plan title', { exact: true }).fill('Newer draft retained'); release!();
  await expect(region.getByRole('button', { name: 'Use proposal as draft', exact: true })).toBeDisabled();
  await expect(region).toContainText('Your draft changed'); await expect(page.getByLabel('Plan title', { exact: true })).toHaveValue('Newer draft retained');
  await page.reload(); await expect(region).toContainText('Recovered a generated proposal');
  await expect(page.getByLabel('Plan title', { exact: true })).toHaveValue('Newer draft retained');
  await region.getByRole('button', { name: 'Dismiss proposal', exact: true }).click(); held = false;
  await page.getByLabel('Plan title', { exact: true }).fill('  Whitespace remains my draft  ');
  await region.getByRole('button', { name: 'Send source and generate directions', exact: true }).click();
  await expect(region.getByRole('button', { name: 'Use proposal as draft', exact: true })).toBeEnabled();
  await region.getByRole('button', { name: 'Use proposal as draft', exact: true }).click();
  await page.getByRole('button', { name: 'Edit Fixture approach 2', exact: true }).click();
  const sectionId = sent!.sections[0]!.id;
  await page.getByRole('textbox', { name: `Fixture approach 2: ${sectionId} copy`, exact: true }).fill('Human-revised full-page section.');
  await page.reload(); await page.getByRole('button', { name: 'Edit Fixture approach 2', exact: true }).click();
  await expect(page.getByRole('textbox', { name: `Fixture approach 2: ${sectionId} copy`, exact: true })).toHaveValue('Human-revised full-page section.');
  await page.getByRole('button', { name: 'Save website plan', exact: true }).click();
  await page.getByRole('button', { name: 'Choose Fixture approach 2', exact: true }).click();
  await expect(page.getByTestId('selected-website-direction')).toContainText('Fixture approach 2');
  await expect(page.getByRole('combobox', { name: 'Page direction', exact: true })).toHaveValue(sent!.options[1]!.id);
  await expect(page.getByTestId('direction-page-sections')).toContainText('Human-revised full-page section.');
  const packet = await (await page.request.get(`/api/canvases/${canvas.id}/website/export`)).json();
  expect(packet.sections[0].copy).toBe('Human-revised full-page section.'); expect(packet.origin).toBe('edited_model_generated');
  expect(packet.generation.authority).toBe('local_assertion');
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await region.getByRole('button', { name: 'Download generated plan' }).scrollIntoViewIfNeeded();
    const capture = testInfo.outputPath(`website-generation-${width}.png`); await region.screenshot({ path: capture });
    const sha256 = createHash('sha256').update(await readFile(capture)).digest('hex');
    await writeFile(`${capture}.vis.provenance.json`, JSON.stringify({ $schema: 'https://frankx.ai/schemas/vis-provenance-sidecar.schema.json', schema_version: '1.0.0', asset: { id: `website-generation-${testInfo.project.name}-${width}`, version: 1, media_type: 'image/png', sha256, relative_path: `website-generation-${width}.png` }, generation: { provider: 'Playwright browser capture / GitHub Actions', model: null, seed: null, prompt: 'Capture actual website generation review, source-matched synthetic fixture, newer edit preservation, proposal recovery, human section revision and verified chosen export. No live provider generation or customer acceptance.', settings: { revision: process.env.GITHUB_SHA ?? null, project: testInfo.project.name, width, reduced_motion: true }, created_at: new Date().toISOString(), output_paths: [`website-generation-${width}.png`] }, agent: { harness: 'Codex', session: '01a113ec-1c95-70a0-84eb-ae2b8aae03a3' }, evaluation: { visual_inspection: 'Pending', schema_validation: 'Not claimed' }, rights: { source: 'Owned synthetic browser fixture', public_release: false } }, null, 2));
    const selectedPage = testInfo.outputPath(`website-selected-page-${width}.png`);
    await page.getByTestId('direction-page-sections').locator('..').screenshot({ path: selectedPage });
    const pageSidecar = JSON.parse(await readFile(`${capture}.vis.provenance.json`, 'utf8'));
    pageSidecar.asset.id = `website-selected-page-${testInfo.project.name}-${width}`;
    pageSidecar.asset.sha256 = createHash('sha256').update(await readFile(selectedPage)).digest('hex');
    pageSidecar.asset.relative_path = `website-selected-page-${width}.png`;
    pageSidecar.generation.prompt = 'Capture the actual selected-direction page editor after human copy revision, saved choice and canonical export; preserved route/files/constraints. Source-matched synthetic provider fixture, no live API or customer acceptance.';
    pageSidecar.generation.created_at = new Date().toISOString(); pageSidecar.generation.output_paths = [`website-selected-page-${width}.png`];
    await writeFile(`${selectedPage}.vis.provenance.json`, JSON.stringify(pageSidecar, null, 2));
  }
});

test('website directions preserve edits, record a choice and export a source-backed brief', async ({ page }, testInfo) => {
  const created = await page.request.post('/api/canvases', { data: { title: `Website ${testInfo.project.name} ${Date.now()}`, template: 'blank' } });
  await expect(created).toBeOK(); const { canvas } = await created.json();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/website/${canvas.id}`);
  await page.getByRole('button', { name: 'Load authored example' }).click();
  await expect(page.getByRole('status')).toContainText('Authored example');
  await expect(page.getByRole('button', { name: 'Choose The open workshop', exact: true })).toHaveAttribute('aria-disabled', 'true');
  const studio = page.getByTestId('website-page-preview');
  await studio.getByRole('button', { name: 'Preview The connected studio', exact: true }).click();
  await expect(studio.locator('article')).toHaveAttribute('data-layout', 'connected');
  await expect(studio.locator('article')).toContainText('See the sources behind a direction');
  await expect(page.getByTestId('selected-website-direction')).toHaveCount(0);
  await studio.getByRole('button', { name: 'Narrow view', exact: true }).click();
  await expect(studio.locator('article')).toHaveAttribute('data-size', 'narrow');
  const pageDirection = page.getByRole('combobox', { name: 'Page direction', exact: true });
  const heroCopy = page.getByTestId('direction-page-sections').locator('li').first().locator('p').first();
  await pageDirection.selectOption('constellation');
  await expect(heroCopy).toHaveText(/See the sources behind a direction/);
  await pageDirection.selectOption('field-notes');
  await expect(heroCopy).toHaveText(/Pick up the direction you saved/);
  await page.getByRole('button', { name: 'Edit The open workshop', exact: true }).click();
  await expect(heroCopy).toHaveText(/Edit a direction with the sources beside it/);
  await page.getByLabel('The open workshop: headline', { exact: true }).fill('Make the next version worth keeping.');
  await expect.poll(async () => page.evaluate((id) => sessionStorage.getItem(`starlight.website.draft.v1:${id}`), canvas.id)).toContain('Make the next version worth keeping.');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Recovered an unsaved draft');
  await expect(page.getByTestId('direction-options').getByRole('heading', { name: 'Make the next version worth keeping.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Save website plan', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Plan saved locally');
  const choose = page.getByRole('button', { name: 'Choose The open workshop', exact: true });
  await choose.focus(); await page.keyboard.press('Enter');
  await expect(page.getByTestId('selected-website-direction')).toContainText('The open workshop');
  await expect(page.getByRole('button', { name: 'Choose The open workshop', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Choose The open workshop', exact: true })).toBeFocused();
  const packetResponse = await page.request.get(`/api/canvases/${canvas.id}/website/export`); await expect(packetResponse).toBeOK();
  const packet = await packetResponse.json();
  expect(packet.direction.headline).toBe('Make the next version worth keeping.');
  expect(packet.sections[0].copy).toMatch(/Edit a direction with the sources beside it/);
  expect(packet.direction.sourceQuotes.length).toBeGreaterThan(0);
  expect(packet.generation).toBeUndefined();
  expect(packet.selected.checkpointId).toMatch(/^checkpoint-/);
  expect(packet.gaps.join(' ')).toContain('mobile');
  const markdown = await page.request.get(`/api/canvases/${canvas.id}/website/export?format=markdown`);
  expect(await markdown.text()).toContain(packet.selected.checkpointId);
  await studio.getByRole('button', { name: 'Preview The founder’s field notes', exact: true }).click();
  await expect(studio.locator('article')).toHaveAttribute('data-layout', 'editorial');
  await expect(page.getByTestId('selected-website-direction')).toContainText('The open workshop');
  const studyDownload = page.waitForEvent('download');
  await studio.getByRole('button', { name: 'Download page study HTML', exact: true }).click();
  const downloadedStudy = await studyDownload;
  const html = await readFile((await downloadedStudy.path())!, 'utf8');
  expect(html).toContain('Pick up the direction you saved.');
  expect(html).toContain('Keep a reviewed state you can refer to.');
  expect(html).toContain('default-src'); expect(html).not.toContain('<script');
  expect((await (await page.request.get(`/api/canvases/${canvas.id}/website/export`)).json()).selected.optionId).toBe('workshop');
  await studio.getByRole('button', { name: 'Preview The open workshop', exact: true }).click();
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

  const previousViewport = page.viewportSize()!;
  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const direction of ['workshop', 'constellation', 'field-notes']) {
      await pageDirection.selectOption(direction);
      await expect(pageDirection).toHaveValue(direction);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await expect(studio.locator('article')).toContainText(direction === 'workshop' ? 'Make the next version worth keeping.' : direction === 'constellation' ? 'See the sources behind a direction.' : 'Pick up the direction you saved.');
      const name = `website-authored-page-${direction}-${width}.png`;
      const authoredCapture = testInfo.outputPath(name);
      await studio.screenshot({ path: authoredCapture });
      const authoredSidecar = structuredClone(sidecar);
      authoredSidecar.asset.id = `website-authored-page-${direction}-${width}-${testInfo.project.name}`;
      authoredSidecar.asset.relative_path = name;
      authoredSidecar.asset.sha256 = createHash('sha256').update(await readFile(authoredCapture)).digest('hex');
      authoredSidecar.generation.prompt = `Capture the actual authored ${direction} page inspector at ${width}px under reduced motion. The test edited a headline and checkpointed workshop; this selector changes the viewed direction only, not the fixture choice. No model generation, actual about-page deployment or customer approval.`;
      authoredSidecar.generation.created_at = new Date().toISOString();
      authoredSidecar.generation.output_paths = [name];
      authoredSidecar.generation.settings = { ...authoredSidecar.generation.settings, ...{ width, direction, content_origin: 'edited_authored_example', choice_scope: 'View selector only; existing workshop fixture checkpoint unchanged.' } };
      await writeFile(`${authoredCapture}.vis.provenance.json`, JSON.stringify(authoredSidecar, null, 2));
    }
  }
  await page.setViewportSize(previousViewport);

  await page.reload();
  await expect(page.getByTestId('selected-website-direction')).toContainText(packet.selected.checkpointId);
  await page.getByRole('link', { name: 'Return to canvas' }).click();
  await expect(page.getByRole('link', { name: 'Shape website directions' })).toBeVisible();
  const storedCanvas = await page.request.get(`/api/canvases/${canvas.id}`);
  const stored = (await storedCanvas.json()).canvas;
  expect(stored.nodes.filter((node: { metadata: { entityType?: string } }) => node.metadata.entityType === 'design_option')).toHaveLength(3);
});

test('page study editing updates the projection and treats imported markup as text', async ({ page }, testInfo) => {
  const created = await page.request.post('/api/canvases', { data: { title: `Page study ${testInfo.project.name} ${Date.now()}`, template: 'blank' } });
  const { canvas } = await created.json();
  await page.goto(`/website/${canvas.id}`);
  await page.getByRole('button', { name: 'Load authored example', exact: true }).click();
  const studio = page.getByTestId('website-page-preview');
  await studio.getByRole('button', { name: 'Edit section: A useful first promise', exact: true }).click();
  const copy = page.getByLabel('A useful first promise: copy', { exact: true });
  await expect(copy).toBeFocused();
  const hostile = '<img src="https://untrusted.example/pixel" onerror="window.stolen=true">\n</style><script>window.stolen=true</script>';
  await copy.fill(hostile);
  await expect(studio.locator('.study-copy').first()).toHaveText(hostile);
  expect(await studio.locator('img,script,iframe').count()).toBe(0);
  await page.reload();
  await expect(studio.locator('.study-copy').first()).toHaveText(hostile);
  const raw = JSON.parse((await page.evaluate((id) => sessionStorage.getItem(`starlight.website.draft.v1:${id}`), canvas.id))!);
  const html = pagePreviewHtml(raw.plan, 'workshop', 'workshop');
  expect(html).toContain('&lt;img'); expect(html).toContain('&lt;/style&gt;&lt;script&gt;');
  expect(html).not.toContain('<img'); expect(html).not.toContain('<script');
  expect(() => pagePreviewHtml(raw.plan, 'workshop', '" onclick="bad' as PageLayout)).toThrow('supported');
  expect(() => pagePreviewHtml(raw.plan, 'removed', 'workshop')).toThrow('no longer');
});

async function mediaFixture(page: Page, testInfo: TestInfo) {
  const created = await page.request.post('/api/canvases', { data: { title: `Media ${testInfo.project.name} ${Date.now()}`, template: 'blank' } });
  await expect(created).toBeOK(); const { canvas } = await created.json();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(`/website/${canvas.id}`);
  await page.getByRole('button', { name: 'Load authored example' }).click();
  await page.getByRole('button', { name: 'Save website plan', exact: true }).click();
  await expect(page.getByRole('status').first()).toContainText('Plan saved locally');
  const { record } = await (await page.request.get(`/api/canvases/${canvas.id}/website`)).json();
  const fileName = 'mobile-supported-input-first-viewport.png';
  const media = await readFile(new URL(`../../../docs/visual-qa/${fileName}`, import.meta.url));
  const asset = { id: 'browser-media', sectionId: 'hero', kind: 'image', reference: `evidence/${fileName}`, why: 'Show the source and artifact workspace.', responsive: 'Keep a text alternative on narrow screens.', alt: 'Existing Canvas source and artifact controls.', status: 'reference', provenance: { sidecar: `evidence/${fileName}.vis.provenance.json`, generationLedger: 'evidence/generation.jsonl', tasteLedger: 'evidence/taste.jsonl' } };
  // These matching records test comparison only. They are not original capture
  // provenance, a canonical ledger lookup or a human preference.
  const sidecar = { asset: { id: 'owned-capture-fixture', sha256: createHash('sha256').update(media).digest('hex'), media_type: 'image/png', relative_path: fileName }, generation: { provider: 'Synthetic fixture for an existing owned capture', model: null, seed: null, prompt: 'Fixture comparison; no original generation proof asserted.' }, agent: { harness: 'test', session: 'synthetic-fixture' } };
  const generation = { ...sidecar, record_id: 'fixture:browser-media' };
  const taste = { record_id: generation.record_id, sha256: sidecar.asset.sha256, preference: null };
  await page.getByLabel('Import website plan').setInputFiles({ name: 'media-plan.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...record.plan, assets: [asset] })) });
  const section = page.getByRole('heading', { name: 'Media with a reason to be here', exact: true }).locator('..');
  await section.getByText('Check local media evidence', { exact: true }).click();
  const files = {
    'Existing image or video': { name: fileName, mimeType: 'image/png', buffer: media },
    'Provenance sidecar': { name: 'sidecar.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(sidecar)) },
    'One generation-ledger record': { name: 'generation.jsonl', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(generation)) },
    'One taste-ledger record': { name: 'taste.jsonl', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(taste)) },
  };
  for (const [label, file] of Object.entries(files)) await section.getByLabel(label, { exact: true }).setInputFiles(file);
  return { canvas, section, files, sidecar };
}

test('local media reports preserve edits, reject mismatches and travel through saved choice and export', async ({ page }, testInfo) => {
  const { canvas, section, files, sidecar } = await mediaFixture(page, testInfo);
  await section.getByText('Edit placement text and references', { exact: true }).click();
  await section.getByRole('textbox', { name: 'browser-media: image alternative', exact: true }).fill('The source list beside an editable artifact.');
  await section.getByRole('button', { name: 'Check selected files', exact: true }).click();
  await expect(section.getByTestId('local-media-report')).toContainText(sidecar.asset.sha256);
  await expect(section.getByTestId('local-media-report')).toContainText('publication remain unverified');
  await expect(section).toContainText('Reference only');
  await page.getByRole('button', { name: 'Save website plan', exact: true }).click();
  await expect(page.getByRole('status').first()).toContainText('Plan saved locally');
  const choose = page.getByRole('button', { name: 'Choose The open workshop', exact: true });
  await choose.focus(); await page.keyboard.press('Enter'); await expect(choose).toBeFocused();
  await expect(page.getByTestId('selected-website-direction')).toBeVisible();
  const exported = await page.request.get(`/api/canvases/${canvas.id}/website/export`); await expect(exported).toBeOK();
  const packet = await exported.json();
  expect(packet.assets[0].mediaCheckReport.assetSha256).toBe(sidecar.asset.sha256);
  expect(packet.assets[0].alt).toBe('The source list beside an editable artifact.');
  expect(packet.assets[0].status).toBe('reference');
  expect(packet.gaps.join(' ')).toContain('licensing');
  expect(JSON.stringify(packet)).not.toContain(sidecar.generation.prompt);
  const markdown = await page.request.get(`/api/canvases/${canvas.id}/website/export?format=markdown`);
  expect(await markdown.text()).toContain(sidecar.asset.sha256);

  await section.getByLabel('Provenance sidecar', { exact: true }).setInputFiles({ ...files['Provenance sidecar'], buffer: Buffer.from(JSON.stringify({ ...sidecar, asset: { ...sidecar.asset, sha256: '0'.repeat(64) } })) });
  await section.getByRole('button', { name: 'Check selected files', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('does not match the sidecar');
  await expect(section.getByTestId('local-media-report')).toContainText(sidecar.asset.sha256);
  await expect(page.getByTestId('selected-website-direction')).toBeVisible();
  await section.getByLabel('Provenance sidecar', { exact: true }).setInputFiles([]);
  await section.getByRole('button', { name: 'Check selected files', exact: true }).click();
  await expect(section.getByRole('alert')).toContainText('Choose the media, sidecar');
  await page.reload();
  await expect(section.getByTestId('local-media-report')).toContainText(sidecar.asset.sha256);
  await section.getByText('Check local media evidence', { exact: true }).click();
  expect(await section.getByLabel('Existing image or video', { exact: true }).evaluate((input: HTMLInputElement) => input.files?.length)).toBe(0);

  for (const width of [375, 768, 1440]) {
    await page.setViewportSize({ width, height: 950 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const capture = testInfo.outputPath(`website-media-${width}.png`);
    await section.screenshot({ path: capture });
    const bytes = await readFile(capture);
    await writeFile(`${capture}.vis.provenance.json`, JSON.stringify({
      $schema: 'https://frankx.ai/schemas/vis-provenance-sidecar.schema.json', schema_version: '1.0.0',
      asset: { id: `website-media-${testInfo.project.name}-${width}`, version: 1, media_type: 'image/png', sha256: createHash('sha256').update(bytes).digest('hex'), relative_path: `website-media-${width}.png` },
      generation: { provider: 'Playwright browser capture / GitHub Actions', model: null, seed: null, prompt: 'Capture the actual media evidence inspector after local byte comparison, saved checkpoint-linked export, mismatch rejection and reload. Synthetic comparison metadata; no model generation, customer approval or original media provenance asserted.', settings: { revision: process.env.GITHUB_SHA ?? null, project: testInfo.project.name, width, reduced_motion: true }, created_at: new Date().toISOString(), output_paths: [`website-media-${width}.png`] },
      agent: { harness: 'Codex', session: '01a113ec-1c95-70a0-84eb-ae2b8aae03a3' },
      evaluation: { schema_validation: 'No external schema validation claimed.', visual_inspection: 'Pending actual capture inspection.' }, rights: { source: 'Owned authored synthetic test fixture', public_release: false },
    }, null, 2));
    await testInfo.attach(`website-media-${width}`, { path: capture, contentType: 'image/png' });
  }
});

test('cancelled and late media checks retain the latest draft and discard changed placement results', async ({ page }, testInfo) => {
  const { canvas, section, sidecar } = await mediaFixture(page, testInfo);
  // A finite controlled digest delay exercises actual component cleanup and
  // attachment. No application test hook or replacement checker is introduced.
  await page.evaluate(() => {
    const state = window as unknown as { holdMediaDigest?: boolean; releaseMediaDigest?: () => void; mediaDigestWaiting?: boolean };
    const original = crypto.subtle.digest.bind(crypto.subtle);
    Object.defineProperty(crypto.subtle, 'digest', { value: async (...args: Parameters<SubtleCrypto['digest']>) => {
      if (state.holdMediaDigest) {
        state.holdMediaDigest = false; state.mediaDigestWaiting = true;
        await new Promise<void>((resolve) => { state.releaseMediaDigest = () => { state.mediaDigestWaiting = false; resolve(); }; });
      }
      return original(...args);
    } });
  });
  const hold = async () => page.evaluate(() => { (window as unknown as { holdMediaDigest: boolean }).holdMediaDigest = true; });
  const waiting = async () => expect.poll(() => page.evaluate(() => Boolean((window as unknown as { mediaDigestWaiting: boolean }).mediaDigestWaiting))).toBe(true);
  const release = async () => page.evaluate(() => (window as unknown as { releaseMediaDigest: () => void }).releaseMediaDigest());
  await hold(); await section.getByRole('button', { name: 'Check selected files', exact: true }).click(); await waiting();
  await page.getByLabel('Plan title', { exact: true }).fill('Latest title survives cancellation');
  await section.getByRole('button', { name: 'Cancel check', exact: true }).click(); await release();
  await expect(section.getByRole('alert')).toContainText('Check cancelled');
  await expect(section.getByTestId('local-media-report')).toHaveCount(0);
  await expect(page.getByLabel('Plan title', { exact: true })).toHaveValue('Latest title survives cancellation');
  await hold(); await section.getByRole('button', { name: 'Check selected files', exact: true }).click(); await waiting();
  await page.getByLabel('Plan title', { exact: true }).fill('Copy edited while hashing'); await release();
  await expect(section.getByTestId('local-media-report')).toContainText(sidecar.asset.sha256);
  await expect(page.getByLabel('Plan title', { exact: true })).toHaveValue('Copy edited while hashing');
  await hold(); await section.getByRole('button', { name: 'Check selected files', exact: true }).click(); await waiting();
  await section.getByText('Edit placement text and references', { exact: true }).click();
  await section.getByLabel('browser-media: media reference', { exact: true }).fill(''); await release();
  await expect(section.getByTestId('local-media-report')).toHaveCount(0);
  await expect(section.getByLabel('Existing image or video', { exact: true })).toBeVisible();
  expect(await section.getByLabel('Existing image or video', { exact: true }).evaluate((input: HTMLInputElement) => input.files?.length)).toBe(0);
  await expect.poll(() => page.evaluate((id) => sessionStorage.getItem(`starlight.website.draft.v1:${id}`), canvas.id)).toContain('Copy edited while hashing');
  await page.reload();
  await expect(page.getByRole('status').first()).toContainText('Recovered an unsaved draft');
  await section.getByText('Edit placement text and references', { exact: true }).click();
  await expect(section.getByLabel('browser-media: media reference', { exact: true })).toHaveValue('');
  await expect(page.getByLabel('Plan title', { exact: true })).toHaveValue('Copy edited while hashing');
  await page.getByRole('button', { name: 'Save website plan', exact: true }).click();
  await expect(page.getByTestId('site-directions').getByRole('alert')).toContainText('reference');
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
  await expect(page.getByTestId('site-directions').getByRole('alert')).toContainText('changed in another client');
  await expect(page.getByLabel('Plan title', { exact: true })).toHaveValue('My retained draft');
  await page.getByRole('button', { name: 'Inspect saved version' }).click();
  await page.getByText('Compare with the saved plan', { exact: true }).click();
  await expect(page.getByText(/Another writer saved this:/)).toBeVisible();
  await page.getByLabel('Import website plan').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"version":"starlight.websitePlan.v1","options":[],"sections":[],"brief":{},"snapshot":{}}') });
  await expect(page.getByTestId('site-directions').getByRole('alert')).toContainText('not a valid website plan');
  await expect(page.getByLabel('Plan title', { exact: true })).toHaveValue('My retained draft');
  const denied = await page.request.put(`/api/canvases/${canvas.id}/website`, { headers: { Origin: 'https://untrusted.example' }, data: { plan: record.plan, expectedHash: record.planHash } }); expect(denied.status()).toBe(403);
  const oversized = await page.request.put(`/api/canvases/${canvas.id}/website`, { data: { plan: 'x'.repeat(120_001) } }); expect(oversized.status()).toBe(413);
  expect((await (await page.request.get(`/api/canvases/${canvas.id}/website`)).json()).record.plan.title).toBe('Another writer saved this');
  await page.getByRole('button', { name: 'Use saved version', exact: true }).click();
  await page.reload();
  await page.getByText('Previous drafts retained in this tab (1)', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download draft 1: My retained draft' })).toBeVisible();
  await page.getByLabel('Plan title', { exact: true }).fill('Draft before example');
  await page.getByRole('button', { name: 'Load authored example', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Authored example');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Recovered an unsaved draft');
  await page.getByText('Previous drafts retained in this tab (2)', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download draft 2: Draft before example' })).toBeVisible();
  await page.getByLabel('Plan title', { exact: true }).fill('');
  await page.reload();
  await expect(page.getByRole('status')).toContainText('Recovered an unsaved draft');
  await expect(page.getByLabel('Plan title', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Save website plan', exact: true }).click();
  await expect(page.getByTestId('site-directions').getByRole('alert')).toContainText('title');
});
