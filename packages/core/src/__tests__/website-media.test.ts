import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { FileCanvasStore } from '../store.js';
import { websiteDirectionDemo } from '../website-demo.js';
import { parseWebsiteDraft, parseWebsitePlan, websitePlanGaps } from '../website.js';
import { checkWebsiteMedia, WEBSITE_MEDIA_MAX_BYTES, WEBSITE_MEDIA_RECORD_MAX_BYTES, websiteMediaReportMatches } from '../website-media.js';

const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const encoded = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
function input() {
  const fileName = 'mobile-supported-input-first-viewport.png';
  const media = readFileSync(new URL(`../../../../docs/visual-qa/${fileName}`, import.meta.url));
  const asset = { id: 'media-proof', sectionId: 'hero', kind: 'image' as const, reference: `evidence/${fileName}`, why: 'Show the existing source-to-artifact workspace.', responsive: 'Use a text alternative on narrow screens.', alt: 'Existing Canvas source and artifact controls.', status: 'reference' as const, provenance: { sidecar: `evidence/${fileName}.vis.provenance.json`, generationLedger: 'evidence/generation.jsonl', tasteLedger: 'evidence/taste.jsonl' } };
  const sidecar = { asset: { id: 'fixture-capture', sha256: sha(media), media_type: 'image/png', relative_path: fileName }, generation: { provider: 'Synthetic fixture record for owned browser capture', model: null, seed: null, prompt: 'Existing owned screenshot; fixture metadata is not original generation proof.' }, agent: { harness: 'test', session: 'synthetic-fixture' }, ignored: 'must-not-export-raw-source' };
  const generationRecord = { ...sidecar, record_id: 'fixture:media-proof' };
  const tasteRecord = { record_id: generationRecord.record_id, sha256: sha(media), preference: null, note: 'No human preference asserted.' };
  return { asset, fileName, media, sidecar: encoded(sidecar), generationRecord: encoded(generationRecord), tasteRecord: encoded(tasteRecord), now: Date.parse('2026-10-07T08:00:00.000Z') };
}

it('compares an actual owned PNG and records raw-byte evidence without readiness or source content', async () => {
  const source = input(), report = await checkWebsiteMedia(source);
  expect(report.assetSha256).toBe(sha(source.media));
  expect(report.sidecarSha256).toBe(sha(source.sidecar));
  expect(report.scope).toBe('reported_local_match');
  expect(report.formatCheck).toBe('signature_only');
  expect(websiteMediaReportMatches(source.asset, report)).toBe(true);
  expect(JSON.stringify(report)).not.toContain('must-not-export');
  expect(JSON.stringify(report)).not.toContain('prompt');
  expect(report).not.toHaveProperty('ready');
  expect(source.asset.status).toBe('reference');
  const withBOM = { ...source, sidecar: new Uint8Array([239, 187, 191, ...source.sidecar]) };
  expect((await checkWebsiteMedia(withBOM)).sidecarSha256).toBe(sha(withBOM.sidecar));
});

it('holds changed media bytes, wrong names and conflicting provenance records', async () => {
  const source = input();
  const altered = new Uint8Array(source.media); altered[altered.length - 1] ^= 1;
  await expect(checkWebsiteMedia({ ...source, media: altered })).rejects.toThrow('media_sidecar_mismatch');
  await expect(checkWebsiteMedia({ ...source, fileName: 'another.png' })).rejects.toThrow('media_file_name_mismatch');
  const record = JSON.parse(new TextDecoder().decode(source.generationRecord));
  for (const change of [() => { record.generation.prompt += ' changed'; }, () => { record.agent.session = 'other-session'; }, () => { record.generation.seed = 4; }]) {
    const copy = structuredClone(record); change();
    await expect(checkWebsiteMedia({ ...source, generationRecord: encoded(record) })).rejects.toThrow('media_generation_mismatch');
    Object.assign(record, copy);
  }
  await expect(checkWebsiteMedia({ ...source, tasteRecord: encoded({ record_id: 'other', sha256: sha(source.media) }) })).rejects.toThrow('media_taste_mismatch');
});

it('bounds raw input, rejects corrupt or multi-record evidence and never echoes rejected values', async () => {
  const source = input();
  for (const sidecar of [new Uint8Array([255]), encoded({ rejectedPrivatePath: 'C:/private/secret' }), new TextEncoder().encode('{}\n{}')]) await expect(checkWebsiteMedia({ ...source, sidecar })).rejects.toThrow(/^media_sidecar_unreadable$/);
  await expect(checkWebsiteMedia({ ...source, media: new Uint8Array(WEBSITE_MEDIA_MAX_BYTES + 1) })).rejects.toThrow('media_input_bounds');
  await expect(checkWebsiteMedia({ ...source, sidecar: new Uint8Array(WEBSITE_MEDIA_RECORD_MAX_BYTES + 1) })).rejects.toThrow('media_input_bounds');
  await expect(checkWebsiteMedia({ ...source, asset: { ...source.asset, provenance: undefined } })).rejects.toThrow('media_provenance_missing');
  await expect(checkWebsiteMedia({ ...source, now: NaN })).rejects.toThrow('media_clock_invalid');
});

it('rejects unsupported signatures and wrong declared media kind without decoding files', async () => {
  const source = input();
  await expect(checkWebsiteMedia({ ...source, media: encoded('<svg>untrusted</svg>') })).rejects.toThrow('media_format_unsupported');
  await expect(checkWebsiteMedia({ ...source, asset: { ...source.asset, kind: 'video' } })).rejects.toThrow('media_format_unsupported');
});

it('snapshots mutable byte views and placement binding before awaiting hashing', async () => {
  const source = input(), original = sha(source.sidecar);
  const pending = checkWebsiteMedia(source);
  source.sidecar.fill(0); source.media.fill(0); source.asset.reference = 'changed/elsewhere.png';
  const report = await pending;
  expect(report.sidecarSha256).toBe(original);
  expect(report.reference).not.toBe(source.asset.reference);
  expect(websiteMediaReportMatches(source.asset, report)).toBe(false);
});

it('keeps declaration, missing rights and location explicit in plans and recoverable partial placement text', async () => {
  const source = input(), plan = websiteDirectionDemo();
  plan.assets = [{ ...source.asset, mediaCheckReport: await checkWebsiteMedia(source) }];
  expect(parseWebsitePlan(plan).assets[0]!.status).toBe('reference');
  expect(websitePlanGaps(plan).join(' ')).toContain('licensing');
  expect(websitePlanGaps(plan).join(' ')).toContain('local declarations');
  const withoutAlternative = structuredClone(plan); delete withoutAlternative.assets[0]!.alt;
  expect(websitePlanGaps(withoutAlternative).join(' ')).toContain('supply alt text');
  const transcriptPlan = structuredClone(plan); transcriptPlan.assets[0]!.kind = 'video'; delete transcriptPlan.assets[0]!.alt; delete transcriptPlan.assets[0]!.mediaCheckReport;
  expect(websitePlanGaps(transcriptPlan).join(' ')).toContain('supply transcript');
  const changed = structuredClone(plan); changed.assets[0]!.reference = 'changed/file.png';
  expect(() => parseWebsitePlan(changed)).toThrow();
  expect(() => parseWebsiteDraft(changed)).toThrow('needs reconciliation');
  delete changed.assets[0]!.mediaCheckReport;
  changed.assets[0]!.reference = ''; changed.assets[0]!.alt = ''; changed.assets[0]!.provenance!.sidecar = '';
  expect(parseWebsiteDraft(changed).assets[0]!.reference).toBe('');
  expect(() => parseWebsitePlan(changed)).toThrow();
});

it('persists the report through actual save, checkpoint choice and export without moving media or granting readiness', async () => {
  const home = await mkdtemp(path.join(tmpdir(), 'canvas-media-report-'));
  try {
    const store = new FileCanvasStore(home), canvas = await store.createCanvas({ title: 'Media report', template: 'blank' });
    const source = input(), plan = websiteDirectionDemo();
    plan.assets = [{ ...source.asset, mediaCheckReport: await checkWebsiteMedia(source) }];
    const saved = await store.saveWebsitePlan(canvas.id, plan);
    await store.selectWebsiteDirection(canvas.id, plan.options[0]!.id, saved.record!.planHash);
    const exported = await store.exportWebsiteImplementation(canvas.id);
    expect(exported.assets[0]!.mediaCheckReport?.assetSha256).toBe(sha(source.media));
    expect(exported.assets[0]!.status).toBe('reference');
    expect(exported.gaps.join(' ')).toContain('licensing');
    expect(exported.boundary).toContain('not release authorization');
    expect((await store.getWebsitePlan(canvas.id))?.selectionVerified).toBe(true);
  } finally {
    // Only the exact directory created by this test is removed.
    if (!path.resolve(home).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Unexpected test home.');
    await rm(home, { recursive: true, force: true });
  }
});
