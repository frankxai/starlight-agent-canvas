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
  await expect(paused.getByText(/^paused \(operator-supplied\)$/)).toBeVisible();
  await expect(paused.getByText('Has uncommitted work; preserve it')).toBeVisible();
  await expect(paused.getByText('Not admitted')).toBeVisible();

  const partial = page.getByRole('article', { name: 'work:partial-capture' });
  await expect(partial.getByText('Admitted. Still missing proof: artifact, checks, verification.')).toBeVisible();
  await expect(partial.getByText('Partial record. Unknown: owner, checkout, reported state, capture completeness.')).toBeVisible();
  const workspace = page.getByRole('article', { name: 'work:home-workspace' });
  await expect(workspace.getByText(/^No checkout/)).toBeVisible();
  await expect(workspace.getByText(/^blocked \(native-goal-store\)$/)).toBeVisible();
  await expect(workspace.getByText(/Partial record/)).toHaveCount(0);
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
  await expect(page.getByRole('status')).toHaveText('Updated. 74 recovered work items.');
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
  const chip = await page.getByRole('button', { name: 'Needs owner 41' }).evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(Math.max(...chip.split(',').map(parseFloat))).toBeLessThanOrEqual(0.01);
});

const FILTER_COUNTS = [['All', 74], ['Needs owner', 41], ['Awaiting admission', 12], ['Admitted', 10], ['Blocked', 6], ['Delivered', 5]] as const;

test('74 recovered works filter, search, group, sort and copy an exact reconcile command', async ({ page, context, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Desktop drives the full flow; the phone test covers layout.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
  const methods: string[] = [];
  page.on('request', (request) => { if (new URL(request.url()).pathname.startsWith('/api/')) methods.push(request.method()); });

  await page.goto('/continuity?shell=posix');
  const filters = page.getByRole('group', { name: 'Filter by attention' });
  for (const [label, count] of FILTER_COUNTS) await expect(filters.getByRole('button', { name: `${label} ${count}`, exact: true })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(74);

  // Filter by keyboard; the polite live region reports the result.
  const needsOwner = filters.getByRole('button', { name: 'Needs owner 41' });
  await needsOwner.focus();
  await page.keyboard.press('Enter');
  await expect(needsOwner).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('article')).toHaveCount(41);
  await expect(page.getByRole('status')).toHaveText('Showing 41 of 74 work items.');
  await expect(page).toHaveURL(/show=needs-owner/);

  // Newest first by default, oldest first on request.
  await expect(page.getByRole('article').first()).toHaveAccessibleName("work:frank's-notes");
  await page.getByLabel('Sort by last observed').selectOption('oldest');
  await expect(page.getByRole('article').first()).toHaveAccessibleName('work:goal-01');
  await page.getByLabel('Sort by last observed').selectOption('newest');

  // Search covers work ID and branch; counts follow the search.
  const search = page.getByLabel('Search work ID or branch');
  await search.fill('agent/claude/notes');
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(filters.getByRole('button', { name: 'All 1', exact: true })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText('Showing 1 of 74 work items.');
  await search.fill('no-such-work');
  await expect(page.getByText('No work matches these filters.')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByRole('article')).toHaveCount(74);
  await expect(search).toHaveValue('');

  // Grouping by checkout keeps workspace sessions apart; grouping by project names each project.
  await page.getByLabel('Group by').selectOption('checkout');
  await expect(page.getByRole('heading', { level: 2, name: /^frankxai\/starlight-agent-canvas · agent\/claude\/notes/ })).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: /^Workspace · C:\/Users\/frank / })).toBeVisible();
  await expect(page.getByRole('list', { name: 'frankxai/agentic-ops · agent/codex/lane' }).getByRole('article', { name: 'work:session-continuity' })).toBeVisible();
  await page.getByLabel('Group by').selectOption('project');
  for (const project of ['project:sis', 'project:agentic-ops', 'project:canvas', 'project:frankx']) {
    await expect(page.getByRole('heading', { level: 2, name: new RegExp(`^${project} `) })).toBeVisible();
  }
  await page.getByLabel('Group by').selectOption('none');

  // Only input-required cards with an owner get the copy button; the ownerless one explains why.
  await expect(page.getByRole('button', { name: 'Copy reconcile command' })).toHaveCount(40);
  await expect(page.getByRole('article', { name: 'work:goal-08' }).getByText(/No owner is registered/)).toBeVisible();

  const card = page.getByRole('article', { name: "work:frank's-notes" });
  const copy = card.getByRole('button', { name: 'Copy reconcile command' });
  await copy.click();
  await expect(page.getByRole('status')).toHaveText('Add a reason first.');
  await expect(card.getByLabel(/^Reason/)).toBeFocused();
  await expect(card.getByLabel(/^Reason/)).toHaveAttribute('aria-invalid', 'true');

  await card.getByLabel(/^Reason/).fill('Checked "dirty" files; keep them');
  await copy.click();
  await expect(card.getByRole('button', { name: 'Copied' })).toBeVisible();
  await expect(page.getByRole('status')).toHaveText("Copied the reconcile command for work:frank's-notes. Paste it into a terminal in your SIS checkout.");
  const posix = "node dist/continuity-cli.js reconcile --work 'work:frank'\\''s-notes' --actor actor:frank --decision admit --reason 'Checked \"dirty\" files; keep them' --acknowledge-paused";
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(posix);
  await expect(card.getByLabel("Reconcile command for work:frank's-notes")).toHaveText(posix);

  await page.getByLabel('Command shell').selectOption('powershell');
  await card.getByRole('radio', { name: 'Block' }).check();
  await card.getByRole('button', { name: /^(Copy reconcile command|Copied)$/ }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
    "node dist/continuity-cli.js reconcile --work 'work:frank''s-notes' --actor actor:frank --decision block --reason 'Checked \"dirty\" files; keep them'",
  );

  // Read-only: the page only ever issued GET requests.
  expect(methods.length).toBeGreaterThan(0);
  expect(new Set(methods)).toEqual(new Set(['GET']));
});

test('74 recovered works stay usable on a phone: filter, group, search and copy', async ({ page, context, baseURL }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', 'Phone flow.');
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseURL });
  await page.goto('/continuity?shell=posix');
  const filters = page.getByRole('group', { name: 'Filter by attention' });
  await expect(filters.getByRole('button', { name: 'All 74', exact: true })).toBeVisible();

  await filters.getByRole('button', { name: 'Needs owner 41' }).tap();
  await page.getByLabel('Group by').selectOption('checkout');
  await page.getByLabel('Search work ID or branch').fill('frank');
  await expect(page.getByRole('article')).toHaveCount(1);
  const card = page.getByRole('article', { name: "work:frank's-notes" });
  await card.getByLabel(/^Reason/).fill('Reviewed on phone');
  await card.getByRole('button', { name: 'Copy reconcile command' }).tap();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(
    "node dist/continuity-cli.js reconcile --work 'work:frank'\\''s-notes' --actor actor:frank --decision admit --reason 'Reviewed on phone' --acknowledge-paused",
  );

  // Widest state: every needs-owner group and reconcile panel rendered at once.
  await page.getByLabel('Search work ID or branch').fill('');
  await expect(page.getByRole('article')).toHaveCount(41);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);

  const targets = [
    ...await filters.getByRole('button').all(),
    page.getByLabel('Search work ID or branch'),
    page.getByLabel('Group by'),
    page.getByLabel('Sort by last observed'),
    page.getByLabel('Command shell'),
    card.getByRole('button', { name: /^(Copy reconcile command|Copied)$/ }),
    card.locator('label').filter({ hasText: 'Admit' }),
    card.getByLabel(/^Reason/),
  ];
  for (const target of targets) {
    const box = await target.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
});
