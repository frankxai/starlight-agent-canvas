import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileCanvasStore } from '../store.js';

describe('FileCanvasStore', () => {
  it('creates, reads, updates, searches, and exports canvases', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'agent-canvas-'));
    const store = new FileCanvasStore(home);
    const canvas = await store.createCanvas({ title: 'Planning', template: 'blank' });
    const [added] = await Promise.all([
      store.addNode(canvas.id, {
        kind: 'note',
        title: 'MCP note',
        body: 'The canvas should be MCP-native and local-first.',
        metadata: {},
      }),
      store.addNode(canvas.id, {
        kind: 'prompt',
        title: 'Second concurrent note',
        body: 'Parallel writes should not overwrite each other.',
        metadata: {},
      }),
    ]);
    expect(added.node.kind).toBe('note');
    const afterConcurrentWrites = await store.getCanvas(canvas.id);
    expect(afterConcurrentWrites.nodes).toHaveLength(2);

    const ingested = await store.ingestSource(canvas.id, {
      kind: 'source_youtube',
      title: 'Demo video',
      body: 'Transcript text about MCP canvas workflows.',
      source: 'https://www.youtube.com/watch?v=abcdefghijk',
      metadata: { videoId: 'abcdefghijk' },
    });
    expect(ingested.artifact.kind).toBe('youtube');
    expect(ingested.artifact.chunks[0]?.id).toContain(`${ingested.artifact.id}:chunk-`);
    expect(ingested.node.metadata.artifactId).toBe(ingested.artifact.id);

    const moved = await store.updateNode(canvas.id, ingested.node.id, { position: { x: 640, y: 360 } });
    expect(moved.node.position).toEqual({ x: 640, y: 360 });

    const search = await store.searchArtifacts('local-first');
    expect(search[0]?.canvasId).toBe(canvas.id);
    const chunkSearch = await store.searchArtifacts('MCP canvas');
    expect(chunkSearch.some((result) => result.chunkId)).toBe(true);

    const markdown = await store.exportCanvas(canvas.id, 'markdown');
    expect(markdown).toContain('# Planning');
    expect(markdown).toContain('MCP note');

    const context = await store.exportCanvas(canvas.id, 'context');
    expect(context).toContain('# Agent Context Packet: Planning');
    expect(context).toContain('## Operating Contract');
    expect(context).toContain('## Source Chunk Manifest');
    expect(context).toContain('MCP-native');

    const portable = JSON.parse(await store.exportCanvas(canvas.id, 'json')) as typeof canvas;
    portable.id = 'canvas-imported-planning';
    portable.title = 'Imported planning';
    const imported = await store.importCanvas(portable);
    expect(imported.id).toBe('canvas-imported-planning');
    expect(imported.nodes.length).toBe(afterConcurrentWrites.nodes.length + 1);

    const importedCopy = await store.importCanvas(portable);
    expect(importedCopy.id).not.toBe(imported.id);
    expect(importedCopy.title).toBe('Imported planning (imported)');
  });

  it('serializes writes across store instances', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'agent-canvas-'));
    const first = new FileCanvasStore(home);
    const second = new FileCanvasStore(home);
    const canvas = await first.createCanvas({ title: 'Shared process canvas', template: 'blank' });

    await Promise.all(Array.from({ length: 10 }, (_, index) => {
      const store = index % 2 === 0 ? first : second;
      return store.addNode(canvas.id, {
        kind: 'note',
        title: `Concurrent note ${index}`,
        body: `Write ${index} should survive cross-store concurrency.`,
        metadata: { index },
      });
    }));

    const saved = await first.getCanvas(canvas.id);
    expect(saved.nodes).toHaveLength(10);
    expect(saved.nodes.map((node) => node.title)).toContain('Concurrent note 9');
  });

  it('rejects unsafe canvas ids before filesystem access', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'agent-canvas-'));
    const store = new FileCanvasStore(home);
    await expect(store.getCanvas('../escape')).rejects.toThrow();
    await expect(store.getCanvas('..\\escape')).rejects.toThrow();
  });
});
