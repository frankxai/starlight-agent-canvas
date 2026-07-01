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

  it('answers a question from selected source text', () => {
    const canvas = createCanvasRecord({ title: 'Answers', template: 'blank' });
    const [source] = canvas.nodes;
    const result = runCanvasAction({
      ...canvas,
      nodes: [{
        ...source,
        kind: 'source_url',
        title: 'Video canvas benchmark',
        body: 'Poppy can analyze YouTube videos, PDFs, websites, and notes. Agent Canvas must map sources to local MCP workflows.',
      }],
    }, {
      action: 'answer_question',
      inputNodeIds: [],
      prompt: 'What source types should the canvas support?',
    });
    expect(result.outputNode.body).toContain('Source-grounded Answer');
    expect(result.outputNode.body).toContain('YouTube videos');
    expect(result.run.metadata.prompt).toContain('source types');
  });
});
