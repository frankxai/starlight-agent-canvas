import { describe, expect, it } from 'vitest';
import { atlasContextEvidence, atlasContextExample, atlasContextRefSchema, parseAtlasContext } from '../atlas-context.js';

function fixture() { return structuredClone(atlasContextExample); }
describe('scoped Atlas context', () => {
  it('keeps authoritative identity and source references without promoting a claim', () => {
    const packet = parseAtlasContext(JSON.stringify(fixture()));
    expect(packet.entity.id).toBe('product:agent-canvas');
    expect(atlasContextEvidence(packet).verification).toBe('producer_report_only');
    expect(atlasContextEvidence(packet).freshness).toBe('unknown');
  });
  it('requires an owner TTL and current observation for fresh; future/missing stay unknown', () => {
    const now = Date.parse('2026-10-07T05:00:00Z'); const packet = fixture();
    packet.observedAt = '2026-10-07T04:59:00Z';
    expect(atlasContextEvidence(packet, now).freshness).toBe('unknown');
    packet.owner = { id: 'owner:fixture', ttlSeconds: 60 };
    expect(atlasContextEvidence(packet, now).freshness).toBe('fresh');
    expect(atlasContextEvidence(packet, now + 1000).freshness).toBe('stale');
    packet.observedAt = '2026-10-07T05:01:00Z';
    expect(atlasContextEvidence(packet, now).freshness).toBe('unknown');
    packet.verifiedAt = '2026-10-07T05:00:00Z';
    expect(atlasContextEvidence(packet, now).verification).toBe('producer_report_only');
  });
  it('retains differing claims and conflicting edges rather than reconciling them', () => {
    const packet = fixture(); packet.claims.push({ ...packet.claims[0]!, id: 'claim:other', value: 'Unverified alternative claim.' });
    const parsed = parseAtlasContext(packet);
    expect(parsed.claims).toHaveLength(2);
    expect(atlasContextEvidence(parsed).conflictingClaimIds).toEqual(['claim:creation', 'claim:other']);
    packet.relationships[0]!.evidence = 'conflicting'; packet.claims = [];
    expect(atlasContextEvidence(parseAtlasContext(packet)).conflict).toBe(true);
  });
  it('rejects malformed, oversized, unknown-field and duplicate packets', () => {
    for (const raw of ['{', ' '.repeat(64_001), { ...fixture(), activation: true }, { ...fixture(), observedAt: 'yesterday' }]) expect(() => parseAtlasContext(raw)).toThrow();
    const duplicate = fixture(); duplicate.relationships.push(duplicate.relationships[0]!);
    expect(() => parseAtlasContext(duplicate)).toThrow();
  });
  it('rejects credential/query/machine URLs and known sensitive text patterns', () => {
    for (const source of ['file:///home/frank/private.md', 'javascript:alert(1)', 'https://user:pass@example.com', 'https://example.com/context?token=value', 'https://127.0.0.1/context', 'https://example.com/%68ome/user/private']) {
      expect(() => parseAtlasContext({ ...fixture(), sources: [source] })).toThrow();
    }
    for (const label of ['C:' + '\\Users\\frank\\private', 'token=example-value', 'gh' + 'p_' + 'x'.repeat(30), '/home/frank/private']) expect(() => parseAtlasContext({ ...fixture(), entity: { ...fixture().entity, label } })).toThrow();
    expect(() => parseAtlasContext({ ...fixture(), entity: { ...fixture().entity, id: 'gh' + 'p_' + 'x'.repeat(30) } })).toThrow();
  });
  it('requires an opaque focused-view reference and marks absent sources', () => {
    expect(atlasContextRefSchema.safeParse('product:agent-canvas').success).toBe(false);
    expect(atlasContextRefSchema.safeParse('439338f7-843f-48a6-96f3-ac386da936df').success).toBe(true);
    expect(atlasContextEvidence(parseAtlasContext({ ...fixture(), sources: [] })).missingSources).toBe(true);
  });
});
