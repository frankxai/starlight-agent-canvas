import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

function packet() {
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
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith('https://github.com/')) external.push(request.url());
    if (new URL(request.url()).pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) writes.push(request.method());
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/context');
  await page.getByLabel('Import Atlas context', { exact: true }).setInputFiles(fixtureFile(packet()));
  await expect(page).toHaveURL(/\/context\/[a-f0-9-]{36}$/);
  await expect(page.getByRole('heading', { name: 'A more considered creation journey', exact: true })).toBeFocused();
  await expect(page.getByText('Conflicting evidence is retained below.', { exact: false })).toBeVisible();
  await expect(page.getByText('Conflicting claim', { exact: true })).toHaveCount(2);
  await expect(page.getByText('Source-reported relationship · target unresolved', { exact: true })).toBeVisible();
  expect(page.url()).not.toContain('synthetic');
  expect(new URL(page.url()).search).toBe('');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'A more considered creation journey', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(external).toEqual([]);
  expect(writes).toEqual([]);

  const capture = testInfo.outputPath('atlas-context.png');
  await page.screenshot({ path: capture, fullPage: true });
  const bytes = await readFile(capture);
  await writeFile(`${capture}.vis.provenance.json`, JSON.stringify({
    $schema: 'https://frankx.ai/schemas/vis-provenance-sidecar.schema.json', schema_version: '1.0.0',
    asset: { id: `atlas-context-${testInfo.project.name}`, version: 1, media_type: 'image/png', sha256: createHash('sha256').update(bytes).digest('hex'), relative_path: 'atlas-context.png' },
    generation: { provider: 'Playwright browser capture / GitHub Actions', model: null, seed: null, prompt: 'Capture the actual reduced-motion Atlas receiving view with one imported synthetic entity, unresolved source-linked relationship and retained conflicting claims. Context lives in tab storage under an opaque reference; no customer evidence or model generation.', settings: { revision: process.env.GITHUB_SHA ?? null, project: testInfo.project.name, reduced_motion: true }, created_at: new Date().toISOString(), output_paths: ['atlas-context.png'] },
    agent: { harness: 'Codex', session: '01a113ec-1c95-70a0-84eb-ae2b8aae03a3' },
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
  await expect(page.getByTestId('atlas-context').getByRole('alert')).toContainText('stored record was retained');
  expect(await page.evaluate((id) => sessionStorage.getItem(`starlight.atlas.context.v1:${id}`), reference)).toBe('{invalid-original');
});
