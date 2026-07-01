import { describe, expect, it } from 'vitest';
import { createCanvasRecord } from '../templates.js';
import { runCanvasAction } from '../actions.js';

describe('action runner', () => {
  it('creates an output node and run record', () => {
    const canvas = createCanvasRecord({ title: 'Competitors', template: 'competitor_teardown' });
    const result = runCanvasAction(canvas, { action: 'decision_matrix', inputNodeIds: [] });
    expect(result.outputNode.kind).toBe('output');
    expect(result.outputNode.body).toContain('Decision Matrix');
    expect(result.canvas.runs).toHaveLength(1);
  });
});
