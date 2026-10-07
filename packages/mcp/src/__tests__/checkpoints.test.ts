import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { FileCanvasStore, type CanvasCheckpoint, type CheckpointSummary } from '@starlight-agent-canvas/core';
import { createToolHandlers } from '../tool-handlers.js';

it('shares checkpoint state with local agents through safe MCP handlers', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'canvas-history-mcp-'));
  try {
    const store = new FileCanvasStore(home);
    const handlers = createToolHandlers(store);
    const canvas = await store.createCanvas({ title: 'Shared review', template: 'blank' });
    const saved = await handlers.create_canvas_checkpoint({ canvasId: canvas.id, label: 'Before agent work' });
    const checkpoint = saved.structuredContent!.checkpoint as CheckpointSummary;
    const read = await handlers.get_canvas_checkpoint({ canvasId: canvas.id, checkpointId: checkpoint.id });
    expect((read.structuredContent!.checkpoint as CanvasCheckpoint).snapshot.id).toBe(canvas.id);
    expect((await handlers.list_canvas_checkpoints({ canvasId: canvas.id })).structuredContent!.checkpoints).toHaveLength(1);
    await store.addNode(canvas.id, { title: 'Agent output', body: 'Useful editable output.' });
    const comparison = await handlers.compare_canvas_checkpoints({ canvasId: canvas.id, beforeId: checkpoint.id });
    expect(comparison.content[0]!.text).toContain('Agent output');
    expect(comparison.content[0]!.text).toContain(checkpoint.contentHash);
  } finally { await rm(home, { recursive: true, force: true }); }
});
