import { z } from 'zod';
import { publicSiteUrlSchema } from './website.js';

export const ATLAS_CONTEXT_MAX_BYTES = 64_000;
export const atlasContextRefSchema = z.string().uuid();
const identity = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9:_-]*$/)
  .refine((value) => !/^[a-z]:/i.test(value) && !sensitive.test(value), 'Use a source entity ID without credentials or machine paths.');
const sensitive = /(?:-----BEGIN[\s\S]*PRIVATE KEY|\b(?:gh[pousr]_|github_pat_|sk-(?:proj-|ant-)?)[A-Za-z0-9_-]{12,}|\bAKIA[A-Z0-9]{16}\b|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:password|token|secret|api[_ -]?key)\s*[:=]\s*\S+|(?:^|[\s/])[a-z]:[\\/]|\\\\|(?:^|\s)~\/|\/(?:Users|home|etc|var|private)\/)/i;
const text = z.string().trim().min(1).max(500).refine((value) => !sensitive.test(value) && !/[\u0000-\u001f\u007f]/.test(value), 'Remove credentials, machine paths and control characters.');
const sourceUrl = publicSiteUrlSchema.refine((value) => {
  try { return !/%/.test(value) && !sensitive.test(decodeURIComponent(value)); } catch { return false; }
}, 'Remove credentials and machine paths from the source reference.');

export const atlasContextSchema = z.object({
  version: z.literal('starlight.atlasContext.v1'),
  privacy: z.literal('local_context'),
  source: z.object({ system: z.literal('starlight-command-center'), revision: z.string().regex(/^[a-f0-9]{40}$/).optional() }).strict(),
  entity: z.object({
    id: identity, label: text,
    type: z.enum(['brand', 'offer', 'product', 'capture_door', 'buyer_segment', 'release_gate', 'issue', 'pr', 'deployment', 'receipt', 'system', 'memory', 'work', 'session']),
  }).strict(),
  observedAt: z.string().datetime().nullable(),
  verifiedAt: z.string().datetime().nullable().optional(),
  owner: z.object({ id: identity, ttlSeconds: z.number().int().min(1).max(604_800).optional() }).strict().optional(),
  evidence: z.enum(['record_only', 'observed', 'missing', 'failed', 'conflicting']),
  sources: z.array(sourceUrl).max(5),
  claims: z.array(z.object({
    id: identity, property: z.enum(['lifecycle', 'owner', 'release_gate', 'deployment', 'health', 'privacy']),
    value: text, evidence: z.enum(['record_only', 'observed', 'missing', 'failed', 'conflicting']), sourceUrl: sourceUrl.optional(),
  }).strict()).max(12),
  relationships: z.array(z.object({
    id: identity, targetId: identity,
    relation: z.enum(['owns', 'offers', 'serves', 'requires', 'blocks', 'implements', 'deploys', 'evidenced_by', 'informs']),
    evidence: z.enum(['source', 'proposed', 'conflicting']), sourceUrl: sourceUrl.optional(),
  }).strict()).max(20),
}).strict().superRefine((packet, context) => {
  for (const key of ['claims', 'relationships'] as const) {
    const items = packet[key];
    if (new Set(items.map((item) => item.id)).size !== items.length) context.addIssue({ code: 'custom', path: [key], message: `${key} IDs must be unique.` });
  }
  if (new Set(packet.sources).size !== packet.sources.length) context.addIssue({ code: 'custom', path: ['sources'], message: 'Source references must be unique.' });
});
export type AtlasContext = z.infer<typeof atlasContextSchema>;

/** Import is data-only. No fetch, store write, identity merge or execution. */
export function parseAtlasContext(raw: unknown): AtlasContext {
  const encoded = typeof raw === 'string' ? raw : JSON.stringify(raw);
  if (!encoded || new TextEncoder().encode(encoded).length > ATLAS_CONTEXT_MAX_BYTES) throw new Error('Atlas context exceeds 64 KB.');
  return atlasContextSchema.parse(typeof raw === 'string' ? JSON.parse(raw) : raw);
}

export function atlasContextEvidence(packet: AtlasContext, now = Date.now()) {
  const observed = packet.observedAt === null ? NaN : Date.parse(packet.observedAt);
  const ageSeconds = (now - observed) / 1000;
  const ttl = packet.owner?.ttlSeconds;
  const freshness: 'fresh' | 'stale' | 'unknown' = !Number.isFinite(ageSeconds) || ageSeconds < 0 || ttl === undefined
    ? 'unknown' : ageSeconds > ttl ? 'stale' : 'fresh';
  const conflicts = packet.claims.filter((claim) => claim.evidence === 'conflicting' || packet.claims.some((other) => other.property === claim.property && other.value !== claim.value));
  const conflict = packet.evidence === 'conflicting' || conflicts.length > 0 || packet.relationships.some((relation) => relation.evidence === 'conflicting');
  return {
    freshness, ageSeconds: Number.isFinite(ageSeconds) && ageSeconds >= 0 ? Math.floor(ageSeconds) : null,
    reason: !Number.isFinite(ageSeconds) ? 'Observation time is missing.' : ageSeconds < 0 ? 'Observation time is in the future.' : ttl === undefined ? 'Owner freshness policy is missing.' : freshness === 'stale' ? 'The owner freshness window has elapsed.' : 'Within the declared owner freshness window.',
    conflict, conflictingClaimIds: conflicts.map((claim) => claim.id),
    missingSources: packet.sources.length === 0,
    verification: 'producer_report_only' as const,
  };
}

/** Authored public-source fixture. Deliberately lacks producer observation/TTL. */
export const atlasContextExample: AtlasContext = {
  version: 'starlight.atlasContext.v1', privacy: 'local_context',
  source: { system: 'starlight-command-center' },
  entity: { id: 'product:agent-canvas', label: 'Starlight Agent Canvas', type: 'product' },
  observedAt: null, evidence: 'record_only',
  sources: ['https://github.com/frankxai/starlight-agent-canvas', 'https://github.com/frankxai/starlight-agent-canvas/issues/27'],
  claims: [{ id: 'claim:creation', property: 'lifecycle', value: 'Website directions and checkpoint-linked briefs are merged; site capture and founder validation remain open.', evidence: 'record_only', sourceUrl: 'https://github.com/frankxai/starlight-agent-canvas/pull/37' }],
  relationships: [{ id: 'edge:website-work', targetId: 'issue:canvas-27', relation: 'requires', evidence: 'source', sourceUrl: 'https://github.com/frankxai/starlight-agent-canvas/issues/27' }],
};
