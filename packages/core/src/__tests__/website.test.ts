import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { FileCanvasStore } from '../store.js';
import { websiteDirectionDemo } from '../website-demo.js';
import { parseWebsiteDraft, parseWebsitePlan, publicSiteUrlSchema, websitePacketMarkdown, websitePlanFromCanvas } from '../website.js';

const homes: string[] = [];
async function setup() { const home = await mkdtemp(path.join(os.tmpdir(), 'canvas-website-')); homes.push(home); const store = new FileCanvasStore(home); const canvas = await store.createCanvas({ title: 'Website', template: 'blank' }); return { store, home, canvas }; }
afterEach(async () => { await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true }))); });

it('makes an editable source-backed artifact, preserves unrelated work and exports only the selected verified plan', async () => {
  const { store, canvas } = await setup();
  const unrelated = await store.addNode(canvas.id, { kind: 'note', title: 'Private note', body: 'Do not include this unrelated source in the website packet.', metadata: {} });
  const saved = await store.saveWebsitePlan(canvas.id, websiteDirectionDemo());
  expect(saved.record!.plan.options).toHaveLength(3);
  await expect(store.exportWebsiteImplementation(canvas.id)).rejects.toThrow('Choose a saved');
  const chosen = await store.selectWebsiteDirection(canvas.id, 'constellation', saved.record!.planHash);
  const packet = await store.exportWebsiteImplementation(canvas.id);
  expect(packet.direction.id).toBe('constellation');
  expect(packet.direction.headline).toBe(saved.record!.plan.options.find((option) => option.id === 'constellation')!.headline);
  expect(packet.selected.authority).toBe('user_assertion');
  expect(packet.gaps.join(' ')).toContain('desktop');
  expect(packet.gaps.join(' ')).toContain('mobile');
  expect(JSON.stringify(packet)).not.toContain('Private note');
  expect(websitePacketMarkdown(packet)).toContain(chosen.record!.selection!.checkpointId);
  expect((await store.getCanvas(canvas.id)).nodes.find((node) => node.id === unrelated.node.id)?.body).toContain('unrelated');
  const projection = (await store.getCanvas(canvas.id)).nodes.find((node) => node.metadata.entityType === 'design_option')!;
  await expect(store.updateNode(canvas.id, projection.id, { body: 'Hidden different copy' })).rejects.toThrow('workbench');
  await store.updateNode(canvas.id, projection.id, { position: { x: 900, y: 100 } });
  expect((await store.getCanvas(canvas.id)).nodes.find((node) => node.id === projection.id)?.position.x).toBe(900);
  const reloaded = new FileCanvasStore(store.home);
  expect(await reloaded.exportWebsiteImplementation(canvas.id)).toEqual(packet);
  expect(websitePlanFromCanvas(JSON.parse(await store.exportCanvas(canvas.id, 'json')))?.plan).toEqual(saved.record!.plan);
});

it('retries the same choice without duplicate checkpoints and clears it when plan content changes', async () => {
  const { store, canvas } = await setup();
  const { record } = await store.saveWebsitePlan(canvas.id, websiteDirectionDemo());
  const first = await store.selectWebsiteDirection(canvas.id, 'workshop', record!.planHash);
  const second = await store.selectWebsiteDirection(canvas.id, 'workshop', record!.planHash);
  expect(second.record!.selection).toEqual(first.record!.selection);
  expect((await store.listCheckpoints(canvas.id)).checkpoints).toHaveLength(1);
  const plan = structuredClone(record!.plan); plan.options[0]!.headline = 'A better reviewed headline';
  const edited = await store.saveWebsitePlan(canvas.id, plan, record!.planHash);
  expect(edited.record!.selection).toBeUndefined();
  await expect(store.exportWebsiteImplementation(canvas.id)).rejects.toThrow('Choose a saved');
  expect((await store.getCheckpoint(canvas.id, first.record!.selection!.checkpointId)).snapshot.nodes[0]!.metadata.websitePlan).toEqual(record!.plan);
});

it('rejects stale writes across two stores without erasing either source state', async () => {
  const { store, canvas } = await setup(); const other = new FileCanvasStore(store.home);
  const { record } = await store.saveWebsitePlan(canvas.id, websiteDirectionDemo());
  const first = structuredClone(record!.plan); first.title = 'First writer';
  const second = structuredClone(record!.plan); second.title = 'Second writer';
  const results = await Promise.allSettled([store.saveWebsitePlan(canvas.id, first, record!.planHash), other.saveWebsitePlan(canvas.id, second, record!.planHash)]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((result) => result.status === 'rejected')).toMatchObject({ reason: new Error('Website plan changed in another client. Keep your draft and reload the saved version before merging.') });
  await expect(other.selectWebsiteDirection(canvas.id, 'workshop', record!.planHash)).rejects.toThrow('changed in another');
});

it('rejects missing, duplicate and unsafe evidence and bounded oversized records', () => {
  for (const url of ['http://example.com', 'https://127.0.0.1', 'https://2130706433', 'https://[::1]', 'https://localhost', 'https://office.internal', 'https://user:secret@example.com', 'https://example.com/?api_key=secret', 'file:///tmp/image']) expect(publicSiteUrlSchema.safeParse(url).success).toBe(false);
  expect(publicSiteUrlSchema.safeParse('https://frankx.ai/').success).toBe(true);
  const plan = websiteDirectionDemo();
  expect(() => parseWebsitePlan({ ...plan, snapshot: undefined })).toThrow();
  expect(() => parseWebsitePlan({ ...plan, options: [plan.options[0], plan.options[0]] })).toThrow();
  expect(() => parseWebsitePlan({ ...plan, arbitraryInstruction: 'Run this command' })).toThrow();
  expect(() => parseWebsitePlan({ ...plan, target: { status: 'resolved' } })).toThrow();
  const file = structuredClone(plan); file.sections[0]!.files = ['../outside.txt']; expect(() => parseWebsitePlan(file)).toThrow();
  expect(() => parseWebsitePlan({ ...plan, title: 'x'.repeat(100_001) })).toThrow('exceeds 100 KB');
});

it('holds absent media provenance and invalid section links instead of marking media ready', () => {
  const plan = websiteDirectionDemo();
  plan.assets = [{ id: 'hero-image', sectionId: 'hero', kind: 'image', reference: 'assets/hero.png', why: 'Shows the actual artifact.', responsive: 'Full width on mobile.', status: 'ready', alt: 'Canvas source beside a brief.' }];
  expect(() => parseWebsitePlan(plan)).toThrow();
  plan.assets[0]!.status = 'reference'; expect(parseWebsitePlan(plan).assets[0]!.status).toBe('reference');
  plan.assets[0]!.sectionId = 'missing'; expect(() => parseWebsitePlan(plan)).toThrow();
});

it('rejects asset and capture reference bypasses before a builder sees them', () => {
  for (const reference of ['file:///C:/Users/private.txt', '../../x', '..\\..\\x', '~/.ssh/id', 'http://169.254.169.254/', 'https://127.0.0.1/x', 'C:/private', '/etc/passwd', 'assets/../private', '%2e%2e/x', 'assets/c:x', 'https://example.com/?token=secret']) {
    const plan = websiteDirectionDemo(); plan.snapshot.views[0]!.reference = reference;
    expect(() => parseWebsitePlan(plan), reference).toThrow();
    plan.snapshot.views[0]!.reference = 'captures/desktop.png';
    plan.assets = [{ id: 'hero-image', sectionId: 'hero', kind: 'image', reference, why: 'Shows the artifact.', responsive: 'Fits mobile.', status: 'reference' }];
    expect(() => parseWebsitePlan(plan), reference).toThrow();
  }
  const plan = websiteDirectionDemo(); plan.sections[0]!.files = ['file:///C:/outside']; expect(() => parseWebsitePlan(plan)).toThrow();
});

it('recovers incomplete editor text while retaining strict source and size boundaries', () => {
  const draft = websiteDirectionDemo(); draft.title = ''; draft.options[0]!.headline = ''; draft.target.repository = 'unfinished'; draft.sections[0]!.route = 'route being edited';
  expect(parseWebsiteDraft(draft)).toEqual(draft);
  expect(() => parseWebsitePlan(draft)).toThrow();
  expect(() => parseWebsiteDraft({ ...draft, snapshot: { ...draft.snapshot, views: [] } })).toThrow();
});

it('makes a fresh checkpoint on an explicit choice when imported or damaged history is unavailable', async () => {
  const { store, canvas, home } = await setup();
  const { record } = await store.saveWebsitePlan(canvas.id, websiteDirectionDemo());
  const chosen = await store.selectWebsiteDirection(canvas.id, 'workshop', record!.planHash);
  await writeFile(path.join(home, 'checkpoints', canvas.id, `${chosen.record!.selection!.checkpointId}.json`), '{broken');
  expect((await store.getWebsitePlan(canvas.id))?.selectionVerified).toBe(false);
  const repaired = await store.selectWebsiteDirection(canvas.id, 'workshop', record!.planHash);
  expect(repaired.record!.selectionVerified).toBe(true);
  expect(repaired.record!.selection!.checkpointId).not.toBe(chosen.record!.selection!.checkpointId);
  expect((await store.exportWebsiteImplementation(canvas.id)).origin).toBe('authored_example');
});

it('retains invalid authority evidence while a hash-guarded replacement makes the plan usable again', async () => {
  const { store, canvas } = await setup();
  const invalid = await store.addNode(canvas.id, { kind: 'note', title: 'Unverified import', body: 'Original evidence stays intact.', metadata: { role: 'website_plan', websitePlan: { broken: true } } });
  const state = await store.getWebsitePlanState(canvas.id);
  expect(state.record).toBeNull(); expect(state.unavailable?.reason).toContain('retained');
  await expect(store.recoverWebsitePlan(canvas.id, websiteDirectionDemo(), 'a'.repeat(64))).rejects.toThrow('changed in another');
  const recovered = await store.recoverWebsitePlan(canvas.id, websiteDirectionDemo(), state.unavailable!.canvasHash);
  expect(recovered.record!.plan.options).toHaveLength(3);
  expect(recovered.canvas.nodes.find((node) => node.id === invalid.node.id)).toMatchObject({ body: 'Original evidence stays intact.', metadata: { role: 'website_plan_unverified', websitePlan: { broken: true } } });
});

it('retries an identical save after a lost response without needing the stale previous hash', async () => {
  const { store, canvas } = await setup(); const plan = websiteDirectionDemo();
  const first = await store.saveWebsitePlan(canvas.id, plan);
  const retry = await store.saveWebsitePlan(canvas.id, plan);
  expect(retry.record!.planHash).toBe(first.record!.planHash);
  expect(retry.canvas.nodes).toEqual(first.canvas.nodes);
});

it('refuses a corrupt selected checkpoint and preserves the current plan', async () => {
  const { store, canvas, home } = await setup();
  const { record } = await store.saveWebsitePlan(canvas.id, websiteDirectionDemo());
  const chosen = await store.selectWebsiteDirection(canvas.id, 'workshop', record!.planHash);
  await writeFile(path.join(home, 'checkpoints', canvas.id, `${chosen.record!.selection!.checkpointId}.json`), '{broken');
  await expect(store.exportWebsiteImplementation(canvas.id)).rejects.toThrow('could not be read or verified');
  expect((await store.getWebsitePlan(canvas.id))?.plan).toEqual(record!.plan);
});
