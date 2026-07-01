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
    expect(afterConcurrentWrites.nodes).toHaveLength(3);

    const search = await store.searchArtifacts('local-first');
    expect(search[0]?.canvasId).toBe(canvas.id);

    const markdown = await store.exportCanvas(canvas.id, 'markdown');
    expect(markdown).toContain('# Planning');
    expect(markdown).toContain('MCP note');
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
    expect(saved.nodes).toHaveLength(11);
    expect(saved.nodes.map((node) => node.title)).toContain('Concurrent note 9');
  });

  it('rejects unsafe canvas ids before filesystem access', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'agent-canvas-'));
    const store = new FileCanvasStore(home);
    await expect(store.getCanvas('../escape')).rejects.toThrow();
    await expect(store.getCanvas('..\\escape')).rejects.toThrow();
  });
});
