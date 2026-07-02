import { describe, expect, it } from 'vitest';
import { CANVAS_SCHEMA_VERSION, type CanvasArtifact, type CanvasNode, type CanvasRecord } from '../schemas.js';
import { describeCanvasSourceReadiness, describeSourceReadiness } from '../readiness.js';

const timestamp = '2026-07-02T12:00:00.000Z';

function node(input: Partial<CanvasNode> & Pick<CanvasNode, 'id' | 'kind' | 'title' | 'body'>): CanvasNode {
  return {
    position: { x: 0, y: 0 },
    metadata: {},
    createdAt: timestamp,
    updatedAt: timestamp,
    ...input,
  };
}

function artifact(input: Partial<CanvasArtifact> & Pick<CanvasArtifact, 'id' | 'kind' | 'title' | 'body'>): CanvasArtifact {
  return {
    createdAt: timestamp,
    metadata: {},
    chunks: input.body
      ? [{ id: `${input.id}:chunk-001`, index: 0, text: input.body, startOffset: 0, endOffset: input.body.length }]
      : [],
    ...input,
  };
}

describe('source readiness', () => {
  it('marks transcript-backed YouTube sources as Codex-ready', () => {
    const sourceNode = node({
      id: 'node-youtube',
      kind: 'source_youtube',
      title: 'Video source',
      body: 'Manual transcript: this walkthrough shows source receipts, claims, and Codex handoff.',
      metadata: { artifactId: 'artifact-youtube' },
    });
    const sourceArtifact = artifact({
      id: 'artifact-youtube',
      kind: 'youtube',
      title: 'Video source',
      body: sourceNode.body,
      metadata: { ingest: 'manual_transcript', url: 'https://youtu.be/abcdefghijk' },
    });

    const readiness = describeSourceReadiness(sourceNode, sourceArtifact);
    expect(readiness).toMatchObject({
      status: 'ready',
      label: 'Codex-ready transcript',
      canRunActions: true,
      artifactId: 'artifact-youtube',
    });
    expect(readiness.evidence.chunks).toBe(1);
    expect(readiness.nextAction).toContain('Ask selected');
  });

  it('marks reference-only video and image nodes as needing human source text', () => {
    const video = describeSourceReadiness(node({
      id: 'node-video',
      kind: 'source_video',
      title: 'Video loom.com',
      body: 'Video transcript was not fetched from https://loom.com/share/demo. The reference is saved so an agent can attach transcript text, timestamp notes, claims, or a later extraction pass.',
      metadata: { ingest: 'video_reference', url: 'https://loom.com/share/demo' },
    }));
    const image = describeSourceReadiness(node({
      id: 'node-image',
      kind: 'source_image',
      title: 'Image proof',
      body: 'Image reference mapped from https://example.com/proof.png. Add alt text, visual observations, OCR text, design notes, or claims for analysis.',
      metadata: { ingest: 'image_reference', imageUrl: 'https://example.com/proof.png' },
    }));

    expect(video.status).toBe('reference_only');
    expect(video.label).toBe('Video reference saved');
    expect(video.canRunActions).toBe(false);
    expect(image.status).toBe('needs_context');
    expect(image.label).toBe('Needs visual text');
    expect(image.nextAction).toContain('OCR');
  });

  it('upgrades edited video and image references when useful notes exist', () => {
    const video = describeSourceReadiness(node({
      id: 'node-video',
      kind: 'source_video',
      title: 'Video loom.com',
      body: 'Notes: the walkthrough shows the source receipt, handoff controls, and Codex export preview.',
      metadata: { ingest: 'video_reference', url: 'https://loom.com/share/demo' },
    }));
    const image = describeSourceReadiness(node({
      id: 'node-image',
      kind: 'source_image',
      title: 'Image proof',
      body: 'OCR: visible buttons include Inspect, Context, Codex, and Ask selected.',
      metadata: { ingest: 'image_reference', imageUrl: 'https://example.com/proof.png' },
    }));

    expect(video.status).toBe('ready');
    expect(video.label).toBe('Codex-ready video notes');
    expect(image.status).toBe('ready');
    expect(image.label).toBe('Codex-ready visual notes');
  });

  it('summarizes readiness for every canvas node', () => {
    const sourceNode = node({
      id: 'node-url',
      kind: 'source_url',
      title: 'Fetched page',
      body: 'Fetched public page text about agent canvas source grounding and workflow design.',
      metadata: { artifactId: 'artifact-url' },
    });
    const sourceArtifact = artifact({
      id: 'artifact-url',
      kind: 'url',
      title: 'Fetched page',
      body: sourceNode.body,
      source: 'https://example.com/research',
      metadata: { ingest: 'basic_fetch' },
    });
    const canvas: CanvasRecord = {
      schemaVersion: CANVAS_SCHEMA_VERSION,
      id: 'canvas-readiness',
      title: 'Readiness canvas',
      description: '',
      createdAt: timestamp,
      updatedAt: timestamp,
      nodes: [
        sourceNode,
        node({ id: 'node-note', kind: 'note', title: 'Human note', body: 'This note is usable context.' }),
      ],
      edges: [],
      runs: [],
      artifacts: [sourceArtifact],
      intakeTraces: [],
    };

    const readiness = describeCanvasSourceReadiness(canvas);
    expect(readiness).toHaveLength(2);
    expect(readiness.find((item) => item.nodeId === 'node-url')).toMatchObject({
      status: 'ready',
      label: 'Codex-ready web source',
      evidence: { chunks: 1, source: 'https://example.com/research' },
    });
  });
});
