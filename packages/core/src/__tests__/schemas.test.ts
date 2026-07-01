import { describe, expect, it } from 'vitest';
import { canvasRecordSchema, CANVAS_SCHEMA_VERSION, ingestSourceInputSchema, runActionInputSchema } from '../schemas.js';

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

    const action = runActionInputSchema.parse({
      action: 'answer_question',
    });
    expect(action.inputNodeIds).toEqual([]);
    expect(action.prompt).toBe('');
  });
});
