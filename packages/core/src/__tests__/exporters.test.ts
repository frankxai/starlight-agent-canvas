import { describe, expect, it } from 'vitest';
import { buildSourceChunks } from '../chunks.js';
import { describeCanvasExportScope, exportCanvasAsAgentContext, exportCanvasAsCodexHandoff, scopeCanvasToNodes } from '../exporters.js';
import type { CanvasRecord } from '../schemas.js';
import { createCanvasRecord } from '../templates.js';

function scopedFixture(): CanvasRecord {
  const now = new Date().toISOString();
  const base = createCanvasRecord({ title: 'Scoped export', template: 'blank' });
  const artifact = {
    id: 'artifact-video-proof',
    kind: 'youtube' as const,
    title: 'Video proof',
    body: 'Transcript proof about creator research canvases, source chunks, and Codex handoff.',
    source: 'https://youtube.com/watch?v=abcdefghijk',
    createdAt: now,
    metadata: { videoId: 'abcdefghijk' },
    chunks: buildSourceChunks('artifact-video-proof', 'Transcript proof about creator research canvases, source chunks, and Codex handoff.'),
  };
  return {
    ...base,
    nodes: [
      {
        id: 'node-source-video',
        kind: 'source_youtube',
        title: 'Video source',
        body: artifact.body,
        position: { x: 100, y: 100 },
        metadata: { artifactId: artifact.id, url: artifact.source },
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'node-human-note',
        kind: 'note',
        title: 'Human note',
        body: 'A separate human note should stay outside selected source exports.',
        position: { x: 420, y: 120 },
        metadata: {},
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'node-summary-output',
        kind: 'output',
        title: 'Summary output',
        body: 'Summary output touches the video source.',
        position: { x: 740, y: 100 },
        metadata: {},
        createdAt: now,
        updatedAt: now,
      },
    ],
    artifacts: [artifact],
    edges: [
      { id: 'edge-source-output', source: 'node-source-video', target: 'node-summary-output', kind: 'derives_from', createdAt: now },
      { id: 'edge-note-output', source: 'node-human-note', target: 'node-summary-output', kind: 'references', createdAt: now },
    ],
    runs: [
      {
        id: 'run-summary',
        action: 'summarize',
        inputNodeIds: ['node-source-video'],
        outputNodeId: 'node-summary-output',
        summary: 'Summarized video source.',
        status: 'completed',
        createdAt: now,
        metadata: {},
      },
    ],
    intakeTraces: [
      {
        id: 'intake-video-and-note',
        source: 'web_composer',
        sourceLabel: 'Composer intake',
        status: 'mapped',
        inputSummary: 'Video source plus a separate human note that should stay outside selected source exports.',
        inputChars: 137,
        detectedKinds: ['youtube', 'note'],
        urls: [artifact.source, 'private-note://human-planning'],
        nodeIds: ['node-source-video', 'node-human-note'],
        artifactIds: [artifact.id],
        items: [
          {
            kind: 'youtube',
            title: 'Video source',
            nodeId: 'node-source-video',
            artifactId: artifact.id,
            artifactKind: 'youtube',
            readinessStatus: 'ready',
            readinessLabel: 'Codex-ready transcript',
            source: artifact.source,
          },
          {
            kind: 'note',
            title: 'Human note private planning',
            nodeId: 'node-human-note',
            readinessStatus: 'ready',
            readinessLabel: 'Human note',
            source: 'private-note://human-planning',
          },
        ],
        createdAt: now,
        metadata: { prompt: 'This prompt mentions unrelated private planning.' },
      },
    ],
  };
}

describe('canvas export scope summary', () => {
  it('describes selected nodes using the same rules as scoped export', () => {
    const canvas = scopedFixture();
    const summary = describeCanvasExportScope(canvas, ['node-source-video']);
    const scoped = scopeCanvasToNodes(canvas, ['node-source-video']);

    expect(summary.mode).toBe('selection');
    expect(summary.nodeIds).toEqual(scoped.nodes.map((node) => node.id));
    expect(summary.artifactIds).toEqual(scoped.artifacts.map((artifact) => artifact.id));
    expect(summary.artifactCount).toBe(1);
    expect(summary.chunkCount).toBe(scoped.artifacts[0].chunks.length);
    expect(summary.traceCount).toBe(1);
    expect(summary.edgeCount).toBe(0);
    expect(summary.runCount).toBe(1);
    expect(summary.sourceCount).toBe(1);
    expect(summary.excludedNodeCount).toBe(2);
    expect(summary.nearbyNodeCount).toBe(1);
    expect(summary.rules.join(' ')).toContain('Edges export only when both endpoints are selected');
  });

  it('describes multi-node and whole-canvas scopes', () => {
    const canvas = scopedFixture();
    const selected = describeCanvasExportScope(canvas, ['node-source-video', 'node-summary-output']);
    expect(selected.nodeIds).toEqual(['node-source-video', 'node-summary-output']);
    expect(selected.edgeCount).toBe(1);
    expect(selected.runCount).toBe(1);
    expect(selected.excludedNodeCount).toBe(1);

    const whole = describeCanvasExportScope(canvas);
    expect(whole.mode).toBe('canvas');
    expect(whole.nodeIds).toHaveLength(3);
    expect(whole.edgeCount).toBe(2);
    expect(whole.traceCount).toBe(1);
    expect(whole.excludedNodeCount).toBe(0);
    expect(whole.rules.join(' ')).toContain('Whole canvas exports all nodes');
  });

  it('rejects missing selected node ids', () => {
    expect(() => describeCanvasExportScope(scopedFixture(), ['missing-node'])).toThrow('Cannot export missing node id');
  });

  it('exports intake traces into agent and Codex handoff packets', () => {
    const context = exportCanvasAsAgentContext(scopedFixture());
    expect(context).toContain('## Intake Trace Manifest');
    expect(context).toContain('Composer intake');
    expect(context).toContain('Codex-ready transcript');
    expect(context).toContain('Human note private planning');

    const codex = exportCanvasAsCodexHandoff(scopedFixture());
    expect(codex).toContain('# Codex Handoff: Scoped export');
    expect(codex).toContain('## Intake Trace Manifest');
    expect(codex).toContain('get_canvas');
  });

  it('sanitizes intake traces for selected exports', () => {
    const selected = scopeCanvasToNodes(scopedFixture(), ['node-source-video']);
    expect(selected.intakeTraces).toHaveLength(1);
    expect(selected.intakeTraces[0].inputSummary).toBe('Video source');
    expect(selected.intakeTraces[0].detectedKinds).toEqual(['youtube']);
    expect(selected.intakeTraces[0].urls).toEqual(['https://youtube.com/watch?v=abcdefghijk']);
    expect(selected.intakeTraces[0].metadata).toEqual({});

    const selectedContext = exportCanvasAsAgentContext(selected);
    expect(selectedContext).toContain('## Intake Trace Manifest');
    expect(selectedContext).toContain('Codex-ready transcript');
    expect(selectedContext).not.toContain('Human note private planning');
    expect(selectedContext).not.toContain('private-note://human-planning');
    expect(selectedContext).not.toContain('unrelated private planning');
  });
});
