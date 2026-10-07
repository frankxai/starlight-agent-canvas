import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { AtlasContext } from '@starlight-agent-canvas/core/atlas-context';

function packet(): AtlasContext {
  return {
    version: 'starlight.atlasContext.v1', privacy: 'local_context', source: { system: 'starlight-command-center' },
    entity: { id: 'product:synthetic-context', label: 'A more considered creation journey', type: 'product' },
    observedAt: new Date().toISOString(), owner: { id: 'owner:fixture', ttlSeconds: 3600 }, evidence: 'record_only',
    sources: ['https://github.com/frankxai/starlight-agent-canvas/issues/27'],
    claims: [
      { id: 'claim:first', property: 'release_gate', value: 'Creator validation is pending.', evidence: 'record_only' },
      { id: 'claim:second', property: 'release_gate', value: 'A separate source calls the workflow approved.', evidence: 'observed' },
    ],
    relationships: [{ id: 'edge:open-work', targetId: 'issue:canvas-27', relation: 'requires', evidence: 'source', sourceUrl: 'https://github.com/frankxai/starlight-agent-canvas/issues/27' }],
  };
}
const fixtureFile = (value: unknown) => ({ name: 'atlas-context.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });

test('source context opens through an opaque reference and preserves conflicts without writes', async ({ page }, testInfo) => {
  const external: string[] = [];
  const writes: string[] = []; const transmittedContext: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://github.com/')) external.push(request.url());
    if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push(request.method());
    if (`${request.url()} ${request.postData() || ''}`.includes('synthetic-context') || `${request.url()} ${request.postData() || ''}`.includes('A more considered creation journey')) transmittedContext.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/context');
  await page.getByLabel('Import Atlas context', { exact: true }).setInputFiles(fixtureFile(packet()));
  await expect(page).toHaveURL(/\/context\/[a-f0-9-]{36}$/);
  await expect(page.getByRole('heading', { name: 'A more considered creation journey', exact: true })).toBeFocused();
  await expect(page.getByText('Conflicting evidence is retained below.', { exact: false })).toBeVisible();
  await expect(page.getByText(/Conflicting claim · producer evidence:/)).toHaveCount(2);
  await expect(page.getByRole('status')).toContainText('opaque reference');
  await expect(page.getByText('Source-reported relationship · target unresolved', { exact: true })).toBeVisible();
  expect(page.url()).not.toContain('synthetic');
  expect(new URL(page.url()).search).toBe('');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A more considered creation journey', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  if (testInfo.project.name === 'mobile') expect((await page.getByLabel('Import Atlas context', { exact: true }).boundingBox())!.width).toBeGreaterThan(250);
  expect(external).toEqual([]);
  expect(writes).toEqual([]);
  expect(transmittedContext).toEqual([]);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download context brief', exact: true }).click()]);
  const exported = await readFile((await download.path())!, 'utf8');
  expect(exported).toContain('product:synthetic-context'); expect(exported).toContain('grants no approval');

  const capture = testInfo.outputPath('atlas-context.png');
  await page.screenshot({ path: capture, fullPage: true });
  const bytes = await readFile(capture);
  await writeFile(`${capture}.vis.provenance.json`, JSON.stringify({
    $schema: 'https://frankx.ai/schemas/vis-provenance-sidecar.schema.json', schema_version: '1.0.0',
    asset: { id: `atlas-context-${testInfo.project.name}`, version: 1, media_type: 'image/png', sha256: createHash('sha256').update(bytes).digest('hex'), relative_path: 'atlas-context.png' },
    generation: { provider: 'Playwright browser capture / GitHub Actions', model: null, seed: null, prompt: 'Capture the actual reduced-motion Atlas receiving view with one imported synthetic entity, unresolved source-linked relationship and retained conflicting claims. Context lives in tab storage under an opaque reference; no customer evidence or model generation.', settings: { revision: process.env.GITHUB_SHA ?? null, project: testInfo.project.name, reduced_motion: true }, created_at: new Date().toISOString(), output_paths: ['atlas-context.png'] },
    agent: { harness: 'GitHub Actions / Playwright', session: process.env.GITHUB_RUN_ID ? `github-actions:${process.env.GITHUB_RUN_ID}` : 'local-browser-test:unknown' },
    evaluation: { schema_validation: 'Schema endpoint unavailable locally; validation not claimed.', visual_inspection: 'Pending inspection of actual capture.' },
    rights: { source: 'Owned synthetic fixture', public_release: false },
  }, null, 2));
  await testInfo.attach('atlas-context', { path: capture, contentType: 'image/png' });
});

test('invalid and oversized imports preserve context; opaque URLs have an honest unavailable state', async ({ page, context }) => {
  await page.goto('/context');
  const original = packet(); original.observedAt = '2020-01-01T00:00:00Z';
  await page.getByLabel('Import Atlas context', { exact: true }).setInputFiles(fixtureFile(original));
  await expect(page).toHaveURL(/\/context\/[a-f0-9-]{36}$/);
  const url = page.url();
  await expect(page.getByRole('heading', { name: /Freshness: stale/ })).toBeVisible();
  for (const invalid of [{ ...original, activate: true }, { ...original, sources: ['file:///home/user/private'] }, 'x'.repeat(64_001)]) {
    await page.getByLabel('Import Atlas context', { exact: true }).setInputFiles(fixtureFile(invalid));
    await expect(page.getByTestId('atlas-context').getByRole('alert')).toContainText('Import held');
    expect(page.url()).toBe(url);
    await expect(page.getByRole('heading', { name: original.entity.label, exact: true })).toBeVisible();
  }
  const otherTab = await context.newPage(); await otherTab.goto(url);
  await expect(otherTab.getByTestId('atlas-context').getByRole('alert')).toContainText('unavailable in this tab'); await otherTab.close();
  await page.getByRole('button', { name: 'Forget this context', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/context$/);
  await expect(page.getByRole('status')).toContainText('removed from tab storage');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.goto(url);
  await expect(page.getByTestId('atlas-context').getByRole('alert')).toContainText('unavailable in this tab');
});

test('storage failure holds the existing context and corrupt recovery never overwrites evidence', async ({ page }) => {
  await page.goto('/context'); await page.getByLabel('Import Atlas context', { exact: true }).setInputFiles(fixtureFile(packet()));
  await expect(page).toHaveURL(/\/context\/[a-f0-9-]{36}$/);
  const url = page.url(); const reference = new URL(url).pathname.split('/').pop()!;
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('Synthetic quota failure', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: 'Open public-source example', exact: true }).click();
  await expect(page.getByTestId('atlas-context').getByRole('alert')).toContainText('previous context is retained');
  expect(page.url()).toBe(url); await expect(page.getByRole('heading', { name: packet().entity.label, exact: true })).toBeVisible();
  await page.reload();
  await page.evaluate((id) => sessionStorage.setItem(`starlight.atlas.context.v1:${id}`, '{invalid-original'), reference);
  await page.reload();
  await expect(page.getByTestId('atlas-context').getByRole('alert')).toContainText('original record was retained');
  expect(await page.evaluate((id) => sessionStorage.getItem(`starlight.atlas.context.v1:${id}`), reference)).toBe('{invalid-original');
});

test('cancelled reads and back navigation retain earlier imports; explicit clear has a confirmation', async ({ page }) => {
  await page.goto('/context');
  await page.evaluate(() => { File.prototype.text = () => new Promise<string>((resolve) => { (window as unknown as { resolveAtlasRead: (value: string) => void }).resolveAtlasRead = resolve; }); });
  await page.getByLabel('Import Atlas context', { exact: true }).setInputFiles(fixtureFile(packet()));
  await expect(page.getByRole('button', { name: 'Cancel import', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel import', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('cancelled');
  await expect(page.getByLabel('Import Atlas context', { exact: true })).toBeFocused();
  await page.evaluate(async (value) => { (window as unknown as { resolveAtlasRead: (value: string) => void }).resolveAtlasRead(value); await Promise.resolve(); }, JSON.stringify(packet()));
  await expect(page).toHaveURL(/\/context$/);
  await expect(page.getByText('Retained contexts: 0', { exact: true })).toBeVisible();
  await page.reload();
  await page.getByLabel('Import Atlas context', { exact: true }).setInputFiles(fixtureFile(packet()));
  await expect(page).toHaveURL(/\/context\/[a-f0-9-]{36}$/);
  const first = page.url(); const second = packet(); second.entity.label = 'A second retained context';
  await page.getByLabel('Import Atlas context', { exact: true }).setInputFiles(fixtureFile(second));
  await expect(page.getByRole('heading', { name: second.entity.label, exact: true })).toBeFocused();
  await page.goBack(); await expect(page).toHaveURL(first);
  await expect(page.getByRole('heading', { name: packet().entity.label, exact: true })).toBeVisible();
  await expect(page.getByText('Retained contexts: 2', { exact: true })).toBeVisible();
  await page.locator('summary').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Forget all retained contexts', exact: true }).click();
  await expect(page).toHaveURL(/\/context$/);
  await expect(page.getByRole('status')).toContainText('All retained Atlas contexts were removed');
  await expect(page.getByText('Retained contexts: 0', { exact: true })).toBeVisible();
});

const savedFirst = '00000000-0000-4000-8000-000000000101';
const savedSecond = '00000000-0000-4000-8000-000000000102';
const savedInvalid = '00000000-0000-4000-8000-000000000103';
const savedKey = (id: string) => `starlight.atlas.context.v1:${id}`;

test('saved contexts reopen by keyboard with distinct references and unchanged source claims', async ({ page }, testInfo) => {
  // Manually assembled from the reviewed public PR/issue, not a live Command
  // export or customer workflow. The schema's producer literal is declarative.
  const runtime = packet();
  runtime.entity = { id: 'product:agent-canvas', label: 'Starlight Agent Canvas', type: 'product' };
  runtime.sources = ['https://github.com/frankxai/starlight-agent-canvas/pull/42', 'https://github.com/frankxai/starlight-agent-canvas/issues/41'];
  runtime.claims = [{ id: 'claim:runtime-adoption', property: 'release_gate', value: 'The pinned Windows package passes file and dependency verification. Native activation remains pending.', evidence: 'record_only' }];
  runtime.relationships = [{ id: 'edge:native-adoption', targetId: 'issue:canvas-41', relation: 'requires', evidence: 'source', sourceUrl: 'https://github.com/frankxai/starlight-agent-canvas/issues/41' }];
  const earlier = packet(); earlier.entity = { ...runtime.entity }; earlier.observedAt = '2020-01-01T00:00:00Z';
  const transmitted: string[] = [];
  page.on('request', (request) => {
    if (`${request.url()} ${request.postData() || ''}`.includes(runtime.claims[0]!.value) || request.url().startsWith('https://github.com/')) transmitted.push(request.url());
  });
  await page.goto('/context');
  await page.evaluate(({ first, second, invalid, runtime, earlier }) => {
    sessionStorage.setItem(`starlight.atlas.context.v1:${first}`, JSON.stringify(runtime));
    sessionStorage.setItem(`starlight.atlas.context.v1:${second}`, JSON.stringify(earlier));
    sessionStorage.setItem(`starlight.atlas.context.v1:${invalid}`, '{untrusted-private-original');
  }, { first: savedFirst, second: savedSecond, invalid: savedInvalid, runtime, earlier });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.reload();
  const saved = page.getByRole('region', { name: 'Saved contexts', exact: true });
  await expect(saved.getByRole('link', { name: runtime.entity.label, exact: true })).toHaveCount(2);
  await expect(saved.getByText('product · Observation fresh', { exact: true })).toBeVisible();
  await expect(saved.getByText('product · Observation stale', { exact: true })).toBeVisible();
  await expect(saved.getByText('2 conflicting claims retained', { exact: true })).toBeVisible();
  await expect(saved.getByText('Saved context unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText('untrusted-private-original', { exact: false })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const capture = testInfo.outputPath('atlas-saved-contexts.png');
  await page.screenshot({ path: capture, fullPage: true });
  const bytes = await readFile(capture);
  await writeFile(`${capture}.vis.provenance.json`, JSON.stringify({
    $schema: 'https://frankx.ai/schemas/vis-provenance-sidecar.schema.json', schema_version: '1.0.0',
    asset: { id: `atlas-saved-contexts-${testInfo.project.name}`, version: 1, media_type: 'image/png', sha256: createHash('sha256').update(bytes).digest('hex'), relative_path: 'atlas-saved-contexts.png' },
    generation: { provider: 'Playwright browser capture / GitHub Actions', model: null, seed: null, prompt: 'Capture the actual reduced-motion saved-context list. One manually assembled public-source packet describes the reviewed Canvas PR42 and open native-adoption issue41; a synthetic older packet retains conflicting claims under the same entity label, and an invalid record stays opaque. This is receiving-side fixture QA, not a live Command export, customer result or model-generated visual.', settings: { revision: process.env.GITHUB_SHA ?? null, project: testInfo.project.name, reduced_motion: true }, created_at: new Date().toISOString(), output_paths: ['atlas-saved-contexts.png'] },
    agent: { harness: 'GitHub Actions / Playwright', session: process.env.GITHUB_RUN_ID ? `github-actions:${process.env.GITHUB_RUN_ID}` : 'local-browser-test:unknown' },
    evaluation: { schema_validation: 'Schema endpoint unavailable locally; validation not claimed.', visual_inspection: 'Pending inspection of actual capture.' },
    rights: { source: 'Manually assembled reviewed public-source fixture plus explicitly synthetic recovery fixtures', public_release: false },
  }, null, 2));
  await testInfo.attach('atlas-saved-contexts', { path: capture, contentType: 'image/png' });

  const selected = saved.locator(`a[href="/context/${savedFirst}"]`);
  await selected.focus(); await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/context/${savedFirst}$`));
  await expect(page.getByRole('heading', { name: runtime.entity.label, exact: true })).toBeFocused();
  await expect(page.getByRole('status')).toContainText('Opened the saved context');
  await expect(page.getByText(runtime.claims[0]!.value, { exact: true })).toBeVisible();
  await page.locator('summary').click();
  await expect(saved.locator(`a[href="/context/${savedFirst}"]`)).toHaveAttribute('aria-current', 'page');
  await saved.locator(`a[href="/context/${savedSecond}"]`).click();
  await expect(page).toHaveURL(new RegExp(`/context/${savedSecond}$`));
  await expect(page.getByRole('heading', { name: /Freshness: stale/ })).toBeVisible();
  await expect(page.getByText(/Conflicting claim · producer evidence:/)).toHaveCount(2);
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/context/${savedFirst}$`));
  await expect(page.getByText(runtime.claims[0]!.value, { exact: true })).toBeVisible();
  expect(await page.evaluate((id) => sessionStorage.getItem(`starlight.atlas.context.v1:${id}`), savedInvalid)).toBe('{untrusted-private-original');
  expect(transmitted).toEqual([]);
});

test('stale saved-list entries are revalidated and damaged copies can be removed separately', async ({ page }) => {
  await page.goto('/context');
  await page.getByLabel('Import Atlas context', { exact: true }).setInputFiles(fixtureFile(packet()));
  await expect(page).toHaveURL(/\/context\/[a-f0-9-]{36}$/);
  const current = page.url(); const next = packet(); next.entity.label = 'Another saved context';
  await page.evaluate(({ id, next }) => {
    sessionStorage.setItem(`starlight.atlas.context.v1:${id}`, JSON.stringify(next));
    sessionStorage.setItem('starlight.website.draft.v1:unrelated', 'retained-other-work');
  }, { id: savedSecond, next });
  await page.locator('summary').click();
  const refresh = page.getByRole('button', { name: 'Refresh saved contexts', exact: true });
  await refresh.click();
  const selected = page.getByRole('region', { name: 'Saved contexts', exact: true }).locator(`a[href="/context/${savedSecond}"]`);
  await expect(selected).toBeVisible();
  await page.evaluate((id) => sessionStorage.setItem(`starlight.atlas.context.v1:${id}`, '{rejected-private-payload'), savedSecond);
  await selected.click();
  await expect(page.getByTestId('atlas-context').getByRole('alert')).toContainText('no longer passes validation');
  expect(page.url()).toBe(current);
  await expect(page.getByRole('heading', { name: packet().entity.label, exact: true })).toBeVisible();
  expect(await page.evaluate((id) => sessionStorage.getItem(`starlight.atlas.context.v1:${id}`), savedSecond)).toBe('{rejected-private-payload');
  await expect(page.getByText('rejected-private-payload', { exact: false })).toHaveCount(0);
  const forget = page.getByRole('button', { name: `Forget saved copy, reference ${savedSecond}`, exact: true });
  page.once('dialog', (dialog) => dialog.dismiss()); await forget.click();
  await expect(forget).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept()); await forget.click();
  await expect(refresh).toBeFocused();
  await expect(page.getByRole('status')).toContainText('current view is unchanged');
  expect(await page.evaluate((id) => sessionStorage.getItem(`starlight.atlas.context.v1:${id}`), savedSecond)).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('starlight.website.draft.v1:unrelated'))).toBe('retained-other-work');

  await page.evaluate(({ id, next }) => sessionStorage.setItem(`starlight.atlas.context.v1:${id}`, JSON.stringify(next)), { id: savedSecond, next });
  await refresh.click(); await expect(selected).toBeVisible();
  await page.evaluate((id) => sessionStorage.removeItem(`starlight.atlas.context.v1:${id}`), savedSecond);
  await selected.click();
  await expect(page.getByTestId('atlas-context').getByRole('alert')).toContainText('no longer in tab storage');
  expect(page.url()).toBe(current);

  await page.evaluate(({ id, next }) => sessionStorage.setItem(`starlight.atlas.context.v1:${id}`, JSON.stringify(next)), { id: savedSecond, next });
  await refresh.click(); await expect(selected).toBeVisible();
  await page.evaluate(() => {
    const read = Storage.prototype.getItem;
    Object.assign(window, { restoreAtlasRead: () => { Storage.prototype.getItem = read; } });
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith('starlight.atlas.context.v1:')) throw new DOMException('Synthetic denied storage', 'SecurityError');
      return read.call(this, key);
    };
  });
  await selected.click();
  await expect(page.getByTestId('atlas-context').getByRole('alert')).toContainText('could not be opened safely');
  expect(page.url()).toBe(current);
  await expect(page.getByRole('heading', { name: packet().entity.label, exact: true })).toBeVisible();
  await expect(page.getByText('Retained contexts: unavailable', { exact: true })).toBeVisible();
  await page.evaluate(() => (window as unknown as { restoreAtlasRead: () => void }).restoreAtlasRead());
  await refresh.click(); await expect(selected).toBeVisible();
  await expect(page.getByText('Retained contexts: 2', { exact: true })).toBeVisible();
});

test('an interrupted native saved-context navigation keeps the previous view and supports retry', async ({ page }) => {
  await page.goto('/context');
  await page.getByLabel('Import Atlas context', { exact: true }).setInputFiles(fixtureFile(packet()));
  await expect(page).toHaveURL(/\/context\/[a-f0-9-]{36}$/);
  const current = page.url(); const next = packet(); next.entity.label = 'Retry this saved context';
  await page.evaluate(({ id, next }) => sessionStorage.setItem(`starlight.atlas.context.v1:${id}`, JSON.stringify(next)), { id: savedSecond, next });
  await page.locator('summary').click();
  await page.getByRole('button', { name: 'Refresh saved contexts', exact: true }).click();
  const selected = page.getByRole('link', { name: next.entity.label, exact: true });
  await page.route(`**/context/${savedSecond}`, (route) => route.abort('aborted'));
  await selected.click({ noWaitAfter: true });
  await expect(page.getByRole('heading', { name: packet().entity.label, exact: true })).toBeVisible();
  expect(page.url()).toBe(current);
  await expect(page.getByLabel('Import Atlas context', { exact: true })).toBeEnabled();
  await page.unroute(`**/context/${savedSecond}`);
  // Reload must consume the abandoned focus receipt without replaying it.
  await page.reload();
  await expect(page.getByRole('heading', { name: packet().entity.label, exact: true })).not.toBeFocused();
  await expect(page.getByRole('status')).toContainText('Recovered the local context');
  expect(await page.evaluate(() => sessionStorage.getItem('starlight.atlas.notice.v1'))).toBeNull();
  await page.locator('summary').click();
  await selected.click();
  await expect(page).toHaveURL(new RegExp(`/context/${savedSecond}$`));
  await expect(page.getByRole('heading', { name: next.entity.label, exact: true })).toBeFocused();
});

test('saved-context reading stays bounded and long labels fit without pruning records', async ({ page }) => {
  await page.goto('/context');
  await expect(page.getByRole('button', { name: 'Refresh saved contexts', exact: true })).toBeEnabled();
  const long = packet(); long.entity.label = 'L'.repeat(500); long.entity.id = `product:${'i'.repeat(120)}`;
  await page.evaluate((value) => {
    for (let index = 0; index < 33; index++) sessionStorage.setItem(`starlight.atlas.context.v1:00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, JSON.stringify(value));
    const read = Storage.prototype.getItem;
    Object.assign(window, { atlasPayloadReads: 0 });
    Storage.prototype.getItem = function (key: string) {
      if (key.startsWith('starlight.atlas.context.v1:')) (window as unknown as { atlasPayloadReads: number }).atlasPayloadReads++;
      return read.call(this, key);
    };
  }, long);
  // A client-side refresh preserves the instrumented Storage prototype.
  await page.getByRole('button', { name: 'Refresh saved contexts', exact: true }).click();
  const saved = page.getByRole('region', { name: 'Saved contexts', exact: true });
  await expect(saved.getByRole('listitem')).toHaveCount(32);
  expect(await page.evaluate(() => (window as unknown as { atlasPayloadReads: number }).atlasPayloadReads)).toBe(32);
  await expect(saved.getByText(/Only 32 records are listed/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('starlight.atlas.context.v1:')).length)).toBe(33);
  // Oversized inventories hold all payload reads and keep the records intact.
  await page.evaluate(() => { for (let index = 0; index < 2001; index++) sessionStorage.setItem(`unrelated:${index}`, 'retained'); });
  await page.getByRole('button', { name: 'Refresh saved contexts', exact: true }).click();
  await expect(page.getByTestId('atlas-context').getByRole('alert')).toContainText('could not be read');
  await expect(saved.getByText(/Tab storage has more than 2000 keys/)).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { atlasPayloadReads: number }).atlasPayloadReads)).toBe(32);
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('starlight.atlas.context.v1:')).length)).toBe(33);
  await page.getByRole('button', { name: 'Open public-source example', exact: true }).click();
  await expect(page.getByTestId('atlas-context').getByRole('alert')).toContainText('more than 2000 keys');
  await page.getByLabel('Import Atlas context', { exact: true }).setInputFiles(fixtureFile(packet()));
  await expect(page.getByTestId('atlas-context').getByRole('alert')).toContainText('more than 2000 keys');
  expect(await page.evaluate(() => (window as unknown as { atlasPayloadReads: number }).atlasPayloadReads)).toBe(32);
});

test('cosmetic receipt quota failures do not block packet reads, imports or removal', async ({ page }) => {
  await page.goto('/context');
  await page.getByLabel('Import Atlas context', { exact: true }).setInputFiles(fixtureFile(packet()));
  await expect(page).toHaveURL(/\/context\/[a-f0-9-]{36}$/);
  const next = packet(); next.entity.label = 'Open without a UI receipt';
  await page.evaluate(({ id, next }) => sessionStorage.setItem(`starlight.atlas.context.v1:${id}`, JSON.stringify(next)), { id: savedSecond, next });
  await page.locator('summary').click();
  await page.getByRole('button', { name: 'Refresh saved contexts', exact: true }).click();
  const denyNotice = () => {
    const write = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'starlight.atlas.notice.v1') throw new DOMException('Synthetic cosmetic-receipt quota', 'QuotaExceededError');
      write.call(this, key, value);
    };
  };
  await page.evaluate(denyNotice);
  await page.getByRole('link', { name: next.entity.label, exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/context/${savedSecond}$`));
  await expect(page.getByRole('heading', { name: next.entity.label, exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('Recovered the local context');
  await page.evaluate(denyNotice);
  await page.getByRole('button', { name: 'Forget this context', exact: true }).click();
  await expect(page).toHaveURL(/\/context$/);
  expect(await page.evaluate((id) => sessionStorage.getItem(`starlight.atlas.context.v1:${id}`), savedSecond)).toBeNull();
  await expect(page.getByText('Retained contexts: 1', { exact: true })).toBeVisible();
  await page.getByLabel('Import Atlas context', { exact: true }).setInputFiles(fixtureFile(next));
  await expect(page).toHaveURL(/\/context\/[a-f0-9-]{36}$/);
  await expect(page.getByRole('heading', { name: next.entity.label, exact: true })).toBeVisible();
  await expect(page.getByText('Retained contexts: 2', { exact: true })).toBeVisible();
  await page.locator('summary').click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Forget all retained contexts', exact: true }).click();
  await expect(page).toHaveURL(/\/context$/);
  await expect(page.getByText('Retained contexts: 0', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.keys(sessionStorage).filter((key) => key.startsWith('starlight.atlas.context.v1:')).length)).toBe(0);
});

test('a repaired packet can reopen at the same reference from an unavailable view', async ({ page }) => {
  await page.goto('/context');
  await expect(page.getByRole('button', { name: 'Refresh saved contexts', exact: true })).toBeEnabled();
  await page.evaluate((id) => sessionStorage.setItem(`starlight.atlas.context.v1:${id}`, '{damaged-original'), savedFirst);
  await page.goto(`/context/${savedFirst}`);
  await expect(page.getByTestId('atlas-context').getByRole('alert')).toContainText('original record was retained');
  await page.evaluate(({ id, value }) => sessionStorage.setItem(`starlight.atlas.context.v1:${id}`, JSON.stringify(value)), { id: savedFirst, value: packet() });
  await page.locator('summary').click();
  await page.getByRole('button', { name: 'Refresh saved contexts', exact: true }).click();
  await page.getByRole('link', { name: packet().entity.label, exact: true }).click();
  await expect(page.getByRole('heading', { name: packet().entity.label, exact: true })).toBeFocused();
  await expect(page.getByRole('status')).toContainText('Opened the saved context');
  await expect(page.getByTestId('atlas-context').getByRole('alert')).toHaveCount(0);
});

test('an unhydrated saved-context view reports pending access rather than an unattempted failure', async ({ page }) => {
  await page.route('**/_next/static/**', (route) => new URL(route.request().url()).pathname.endsWith('.js') ? route.abort('aborted') : route.continue());
  await page.goto('/context');
  await expect(page.getByText('Opening saved contexts…', { exact: true })).toBeVisible();
  await expect(page.getByText('Checking this tab for saved contexts…', { exact: true })).toBeVisible();
  await expect(page.getByText(/The saved list could not be read/)).toHaveCount(0);
  await expect(page.getByLabel('Import Atlas context', { exact: true })).toBeDisabled();
});

test('the retention cap holds import and root removal leaves unrelated tab state intact', async ({ page }) => {
  await page.goto('/context');
  await page.evaluate((value) => {
    sessionStorage.setItem('starlight.website.draft.v1:unrelated', 'retained-other-work');
    for (let index = 0; index < 32; index++) sessionStorage.setItem(`starlight.atlas.context.v1:00000000-0000-4000-8000-${String(index).padStart(12, '0')}`, JSON.stringify(value));
  }, packet());
  await page.reload();
  await expect(page.getByText('Retained contexts: 32', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open public-source example', exact: true }).click();
  await expect(page.getByTestId('atlas-context').getByRole('alert')).toContainText('32-context limit');
  expect(new URL(page.url()).pathname).toBe('/context');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Forget all retained contexts', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('All retained Atlas contexts were removed');
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  expect(await page.evaluate(() => sessionStorage.getItem('starlight.website.draft.v1:unrelated'))).toBe('retained-other-work');
  expect(await page.evaluate(() => sessionStorage.getItem('starlight.atlas.notice.v1'))).toBeNull();
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).not.toBeFocused();
  await expect(page.getByRole('status')).toContainText('Ready for a source-backed context');
});
