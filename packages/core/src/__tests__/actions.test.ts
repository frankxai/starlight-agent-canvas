import { describe, expect, it } from 'vitest';
import { createCanvasRecord } from '../templates.js';
import { runCanvasAction } from '../actions.js';
import { buildSourceChunks } from '../chunks.js';

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
    const createdAt = new Date().toISOString();
    const artifact = {
      id: 'artifact-video-benchmark',
      kind: 'youtube' as const,
      title: 'Video canvas benchmark artifact',
      body: 'Poppy can analyze YouTube videos, PDFs, websites, and notes. Agent Canvas must map sources to local MCP workflows.',
      source: 'https://youtube.com/watch?v=abcdefghijk',
      createdAt,
      metadata: {},
      chunks: buildSourceChunks('artifact-video-benchmark', 'Poppy can analyze YouTube videos, PDFs, websites, and notes. Agent Canvas must map sources to local MCP workflows.'),
    };
    const result = runCanvasAction({
      ...canvas,
      nodes: [{
        ...source,
        kind: 'source_url',
        title: 'Video canvas benchmark',
        body: artifact.body,
        metadata: { artifactId: artifact.id },
      }],
      artifacts: [artifact],
    }, {
      action: 'answer_question',
      inputNodeIds: [],
      prompt: 'What source types should the canvas support?',
    });
    expect(result.outputNode.body).toContain('Source-grounded Answer');
    expect(result.outputNode.body).toContain('### Citations');
    expect(result.outputNode.body).toContain('artifact-video-benchmark:chunk-001');
    expect(result.outputNode.body).toContain('YouTube videos');
    expect(JSON.stringify(result.outputNode.metadata.citations)).toContain('artifact-video-benchmark');
    expect(result.run.metadata.prompt).toContain('source types');
    expect(JSON.stringify(result.run.metadata.citations)).toContain('C1');
  });
});
