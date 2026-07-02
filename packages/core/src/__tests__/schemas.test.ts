import { describe, expect, it } from 'vitest';
import { canvasArtifactSchema, canvasRecordSchema, CANVAS_SCHEMA_VERSION, ingestSourceInputSchema, runActionInputSchema } from '../schemas.js';

describe('canvas schema', () => {
  it('accepts a minimal valid canvas', () => {
    const now = new Date().toISOString();
    const parsed = canvasRecordSchema.parse({
      schemaVersion: CANVAS_SCHEMA_VERSION,
      id: 'canvas-test',
      title: 'Test',
      createdAt: now,
      updatedAt: now,
    });
    expect(parsed.nodes).toEqual([]);
    expect(parsed.edges).toEqual([]);
  });

  it('normalizes source ingest and action prompts', () => {
    const source = ingestSourceInputSchema.parse({
      title: 'Transcript',
      body: 'Useful source text.',
    });
    expect(source.kind).toBe('note');

    const video = ingestSourceInputSchema.parse({
      kind: 'source_video',
      title: 'Video notes',
      body: 'Manual transcript notes.',
      artifactKind: 'video',
    });
    expect(video.kind).toBe('source_video');
    expect(video.artifactKind).toBe('video');

    const action = runActionInputSchema.parse({
      action: 'answer_question',
    });
    expect(action.inputNodeIds).toEqual([]);
    expect(action.prompt).toBe('');
  });

  it('normalizes legacy artifacts without chunks', () => {
    const now = new Date().toISOString();
    const artifact = canvasArtifactSchema.parse({
      id: 'artifact-legacy',
      kind: 'manual',
      title: 'Legacy source',
      body: 'Older exports did not include source chunks.',
      createdAt: now,
      metadata: {},
    });
    expect(artifact.chunks).toEqual([]);
  });
});
