import { z } from 'zod';

export const WEBSITE_MEDIA_MAX_BYTES = 25 * 1024 * 1024;
export const WEBSITE_MEDIA_RECORD_MAX_BYTES = 128 * 1024;
export const WEBSITE_MEDIA_REPORT_BOUNDARY = 'Local file match report. Source location, generator, licensing, playback and publication remain unverified.' as const;
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const name = z.string().min(1).max(255).refine((value) => !/[\\/\u0000-\u001f\u007f]/.test(value));
const short = z.string().min(1).max(512);
const generation = z.object({ provider: short, model: short.nullable(), seed: z.union([z.number().finite(), short]).nullable(), prompt: z.string().min(1).max(40_000) });
const agent = z.object({ harness: short, session: short });
const mediaType = z.enum(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'video/mp4', 'video/webm']);
const sidecarSchema = z.object({
  asset: z.object({ id: short, sha256: hash, media_type: mediaType, relative_path: short }), generation, agent,
});
const generationRecordSchema = sidecarSchema.extend({ record_id: z.string().min(1).max(2000) });
const tasteRecordSchema = z.object({ record_id: z.string().min(1).max(2000), sha256: hash });

export const websiteMediaReportSchema = z.object({
  version: z.literal('starlight.websiteMediaCheck.v1'), scope: z.literal('reported_local_match'),
  assetId: z.string().min(1).max(128), reference: short,
  sidecarReference: short, generationLedgerReference: short, tasteLedgerReference: short,
  fileName: name, mediaType, bytes: z.number().int().positive().max(WEBSITE_MEDIA_MAX_BYTES),
  assetSha256: hash, sidecarSha256: hash, generationRecordSha256: hash, tasteRecordSha256: hash,
  checkedAt: z.string().datetime(), formatCheck: z.literal('signature_only'), boundary: z.literal(WEBSITE_MEDIA_REPORT_BOUNDARY),
}).strict();
export type WebsiteMediaReport = z.infer<typeof websiteMediaReportSchema>;
export type WebsiteMediaPlacement = {
  id: string; kind: 'image' | 'video'; reference: string;
  provenance?: { sidecar: string; generationLedger: string; tasteLedger: string };
};

/** Binds a reported comparison to its placement. This does not authenticate it. */
export function websiteMediaReportMatches(asset: WebsiteMediaPlacement, report: WebsiteMediaReport): boolean {
  return report.assetId === asset.id && report.reference === asset.reference && Boolean(asset.provenance)
    && report.sidecarReference === asset.provenance?.sidecar
    && report.generationLedgerReference === asset.provenance?.generationLedger
    && report.tasteLedgerReference === asset.provenance?.tasteLedger
    && report.mediaType.startsWith(`${asset.kind}/`);
}

function leaf(value: string, code = 'media_reference_unresolved'): string {
  try {
    const path = value.startsWith('https:') ? decodeURIComponent(new URL(value).pathname) : value;
    return name.parse(path.split('/').at(-1));
  } catch { throw new Error(code); }
}

function parseRecord<T>(bytes: Uint8Array, schema: z.ZodType<T>, code: string): T {
  try {
    // Decode for parsing only; hashing retains the exact original bytes and BOM.
    const text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes).replace(/^\uFEFF/, '');
    return schema.parse(JSON.parse(text));
  } catch { throw new Error(code); }
}
async function digest(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('media_hash_unavailable');
  const result = await globalThis.crypto.subtle.digest('SHA-256', new Uint8Array(bytes));
  return [...new Uint8Array(result)].map((part) => part.toString(16).padStart(2, '0')).join('');
}
function signature(bytes: Uint8Array): z.infer<typeof mediaType> | null {
  const starts = (values: number[]) => values.every((value, index) => bytes[index] === value);
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes.length >= 33 && starts([137, 80, 78, 71, 13, 10, 26, 10]) && ascii(12, 16) === 'IHDR') return 'image/png';
  if (bytes.length >= 4 && starts([255, 216, 255])) return 'image/jpeg';
  if (bytes.length >= 13 && ['GIF87a', 'GIF89a'].includes(ascii(0, 6))) return 'image/gif';
  if (bytes.length >= 16 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  if (bytes.length >= 24 && ascii(4, 8) === 'ftyp' && ['isom', 'iso2', 'mp41', 'mp42', 'avc1', 'M4V ', 'qt  '].includes(ascii(8, 12))) return 'video/mp4';
  if (bytes.length >= 16 && starts([26, 69, 223, 163])) return 'video/webm';
  return null;
}

/** Selected bytes only. No file reads, URL fetches, decoding, storage or approval. */
export async function checkWebsiteMedia(input: {
  asset: WebsiteMediaPlacement; fileName: string; media: Uint8Array;
  sidecar: Uint8Array; generationRecord: Uint8Array; tasteRecord: Uint8Array; now?: number;
}): Promise<WebsiteMediaReport> {
  const { asset } = input;
  const now = input.now ?? Date.now();
  if (!Number.isFinite(now) || Math.abs(now) > 8_640_000_000_000_000) throw new Error('media_clock_invalid');
  if (!asset.provenance) throw new Error('media_provenance_missing');
  const binding = { assetId: asset.id, reference: asset.reference, sidecarReference: asset.provenance.sidecar, generationLedgerReference: asset.provenance.generationLedger, tasteLedgerReference: asset.provenance.tasteLedger };
  if (![input.media, input.sidecar, input.generationRecord, input.tasteRecord].every((bytes) => bytes instanceof Uint8Array && bytes.byteLength > 0)
    || input.media.byteLength > WEBSITE_MEDIA_MAX_BYTES
    || [input.sidecar, input.generationRecord, input.tasteRecord].some((bytes) => bytes.byteLength > WEBSITE_MEDIA_RECORD_MAX_BYTES)) throw new Error('media_input_bounds');
  const fileName = name.safeParse(input.fileName);
  if (!fileName.success || fileName.data !== leaf(asset.reference)) throw new Error('media_file_name_mismatch');
  const kind = asset.kind;
  // Snapshot before the first await so a caller cannot mix mutable byte views.
  const media = new Uint8Array(input.media), sidecar = new Uint8Array(input.sidecar);
  const generationBytes = new Uint8Array(input.generationRecord), tasteBytes = new Uint8Array(input.tasteRecord);
  const recorded = parseRecord(sidecar, sidecarSchema, 'media_sidecar_unreadable');
  const generated = parseRecord(generationBytes, generationRecordSchema, 'media_generation_unreadable');
  const taste = parseRecord(tasteBytes, tasteRecordSchema, 'media_taste_unreadable');
  const format = signature(media);
  if (!format || !format.startsWith(`${kind}/`)) throw new Error('media_format_unsupported');
  const assetSha256 = await digest(media);
  if (recorded.asset.sha256 !== assetSha256 || recorded.asset.media_type !== format || leaf(recorded.asset.relative_path, 'media_sidecar_mismatch') !== fileName.data) throw new Error('media_sidecar_mismatch');
  if (generated.asset.sha256 !== assetSha256 || JSON.stringify(generated.asset) !== JSON.stringify(recorded.asset)
    || JSON.stringify(generated.generation) !== JSON.stringify(recorded.generation)
    || JSON.stringify(generated.agent) !== JSON.stringify(recorded.agent)) throw new Error('media_generation_mismatch');
  if (taste.sha256 !== assetSha256 || taste.record_id !== generated.record_id) throw new Error('media_taste_mismatch');
  const report = websiteMediaReportSchema.safeParse({
    version: 'starlight.websiteMediaCheck.v1', scope: 'reported_local_match', ...binding,
    fileName: fileName.data, mediaType: format, bytes: media.byteLength, assetSha256,
    sidecarSha256: await digest(sidecar), generationRecordSha256: await digest(generationBytes), tasteRecordSha256: await digest(tasteBytes),
    checkedAt: new Date(now).toISOString(), formatCheck: 'signature_only', boundary: WEBSITE_MEDIA_REPORT_BOUNDARY,
  });
  if (!report.success) throw new Error('media_binding_invalid');
  return report.data;
}
