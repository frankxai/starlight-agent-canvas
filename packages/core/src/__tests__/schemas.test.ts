import { describe, expect, it } from 'vitest';
import { canvasRecordSchema, CANVAS_SCHEMA_VERSION } from '../schemas.js';

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
});
