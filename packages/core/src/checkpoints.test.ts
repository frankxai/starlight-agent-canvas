import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileCanvasStore } from './store.js';
import { canvasContentHash, canonicalJson } from './checkpoints.js';

const homes: string[] = [];
async function store() {
  const home = await mkdtemp(path.join(os.tmpdir(), 'canvas-checkpoints-'));
  homes.push(home);
  return new FileCanvasStore(home);
}
afterEach(async () => { await Promise.all(homes.splice(0).map((home) => rm(home, { recursive: true, force: true }))); });

describe('local checkpoints', () => {
  it('preserves timestamps, exact snapshots and current export privacy', async () => {
    const owner = await store();
    const canvas = await owner.createCanvas({ title: 'Product direction', template: 'blank' });
    await owner.ingestSource(canvas.id, { title: 'Interview', body: 'Customers need an editable campaign.', kind: 'note' });
    const original = await owner.getCanvas(canvas.id);
    const checkpoint = await owner.createCheckpoint(canvas.id, { label: '  First direction  ' });
    const opened = await owner.getCheckpoint(canvas.id, checkpoint.id);
    expect(opened.snapshot).toEqual(original);
    expect(checkpoint.label).toBe('First direction');
    expect(checkpoint.counts).toEqual({ nodes: 1, edges: 0, artifacts: 1, runs: 0 });
    expect(opened.contentHash).toBe(canvasContentHash(original));
    expect(await owner.listCheckpoints(canvas.id)).toEqual([checkpoint]);
    expect((await owner.compareCheckpoints(canvas.id, checkpoint.id)).unchanged).toBe(true);
    expect(JSON.parse(await owner.exportCanvas(canvas.id))).toEqual(original);
    expect(await owner.exportCanvas(canvas.id, 'context')).not.toContain(checkpoint.id);
  });

  it('separates moves from content, compares stable IDs and accepts a second checkpoint', async () => {
    const owner = await store();
    const canvas = await owner.createCanvas({ title: 'Campaign', template: 'blank' });
    const first = await owner.addNode(canvas.id, { title: 'Campaign idea', body: 'Original copy' });
    const before = await owner.createCheckpoint(canvas.id, { label: 'Before' });
    await owner.updateNode(canvas.id, first.node.id, { position: { x: 444, y: 222 } });
    const moved = await owner.compareCheckpoints(canvas.id, before.id);
    expect(moved.collections.nodes[0]?.positionOnly).toBe(true);
    await owner.updateNode(canvas.id, first.node.id, { body: 'Reviewed copy' });
    const source = await owner.ingestSource(canvas.id, { title: 'Evidence', body: 'Source quote', kind: 'note' });
    await owner.connectNodes(canvas.id, { source: source.node.id, target: first.node.id });
    await owner.runAction(canvas.id, { action: 'summarize', inputNodeIds: [source.node.id] });
    const after = await owner.createCheckpoint(canvas.id, { label: 'After' });
    const diff = await owner.compareCheckpoints(canvas.id, before.id, after.id);
    expect(diff.collections.nodes.find((change) => change.id === first.node.id)).toMatchObject({ kind: 'changed', positionOnly: false });
    expect(diff.collections.artifacts[0]).toMatchObject({ id: source.artifact.id, kind: 'added' });
    expect(diff.collections.edges.some((change) => change.kind === 'added')).toBe(true);
    expect(diff.collections.runs[0]?.kind).toBe('added');
    const reverse = await owner.compareCheckpoints(canvas.id, after.id, before.id);
    expect(reverse.collections.artifacts[0]?.kind).toBe('removed');
    expect(diff.before.contentHash).toBe(before.contentHash);
    expect(diff.after.contentHash).toBe(after.contentHash);
  });

  it('serializes checkpoints with mutations from separate store instances', async () => {
    const owner = await store();
    const other = new FileCanvasStore(owner.home);
    const canvas = await owner.createCanvas({ title: 'Concurrent', template: 'blank' });
    const operations = await Promise.all([
      owner.createCheckpoint(canvas.id, { label: 'Owner review' }),
      other.addNode(canvas.id, { title: 'Agent contribution', body: 'A whole record.' }),
      other.createCheckpoint(canvas.id, { label: 'Agent review' }),
    ]);
    for (const checkpoint of [operations[0], operations[2]]) {
      const opened = await owner.getCheckpoint(canvas.id, checkpoint.id);
      expect(opened.contentHash).toBe(canvasContentHash(opened.snapshot));
      expect(opened.snapshot.id).toBe(canvas.id);
      expect(opened.snapshot.nodes.every((node) => node.body === 'A whole record.')).toBe(true);
    }
    expect((await owner.getCanvas(canvas.id)).nodes).toHaveLength(1);
    expect(await owner.listCheckpoints(canvas.id)).toHaveLength(2);
  });

  it('rejects traversal, missing snapshots and corrupt or misattributed history without changing the graph', async () => {
    const owner = await store();
    const canvas = await owner.createCanvas({ title: 'Protected', template: 'blank' });
    const original = await owner.getCanvas(canvas.id);
    await expect(owner.createCheckpoint('../escape', { label: 'No' })).rejects.toThrow();
    await expect(owner.getCheckpoint(canvas.id, '../escape')).rejects.toThrow();
    await expect(owner.createCheckpoint(canvas.id, { label: '   ' })).rejects.toThrow();
    await expect(owner.getCheckpoint(canvas.id, 'missing')).rejects.toThrow('not found');
    const checkpoint = await owner.createCheckpoint(canvas.id, { label: 'Safe' });
    const filename = path.join(owner.home, 'checkpoints', canvas.id, `${checkpoint.id}.json`);
    const raw = JSON.parse(await readFile(filename, 'utf8'));
    await writeFile(filename, JSON.stringify({ ...raw, snapshot: { ...raw.snapshot, title: 'Tampered' } }));
    await expect(owner.getCheckpoint(canvas.id, checkpoint.id)).rejects.toThrow('verified');
    await expect(owner.listCheckpoints(canvas.id)).rejects.toThrow('verified');
    await writeFile(filename, JSON.stringify({ ...raw, canvasId: 'another-canvas' }));
    await expect(owner.compareCheckpoints(canvas.id, checkpoint.id)).rejects.toThrow('verified');
    await writeFile(filename, '{broken');
    await expect(owner.getCheckpoint(canvas.id, checkpoint.id)).rejects.toThrow('verified');
    expect(await owner.getCanvas(canvas.id)).toEqual(original);
  });

  it('hashes equivalent metadata independently of object key insertion order', () => {
    expect(canonicalJson({ b: 2, a: { y: 3, x: 4 } })).toBe(canonicalJson({ a: { x: 4, y: 3 }, b: 2 }));
  });
});
