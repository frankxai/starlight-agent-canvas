import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FileCanvasStore } from '@starlight-agent-canvas/core';
import { createToolHandlers } from '../tool-handlers.js';

describe('MCP tool handlers', () => {
  it('creates, updates, runs, searches, and exports a canvas', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'agent-canvas-mcp-'));
    const handlers = createToolHandlers(new FileCanvasStore(home));

    const created = await handlers.create_canvas({ title: 'MCP smoke', template: 'blank' });
    const canvas = created.structuredContent?.canvas as { id: string };
    expect(canvas.id).toBeTruthy();

    const added = await handlers.ingest_text_source({
      canvasId: canvas.id,
      title: 'Local node',
      body: 'MCP-native local workflow.',
      metadata: {},
    });
    const node = added.structuredContent?.node as { id: string };
    expect(node.id).toBeTruthy();

    const run = await handlers.run_node_action({
      canvasId: canvas.id,
      action: 'answer_question',
      inputNodeIds: [node.id],
      prompt: 'What does this prove?',
    });
    expect(run.content[0].text).toContain('Created');

    const updated = await handlers.update_node({
      canvasId: canvas.id,
      nodeId: node.id,
      position: { x: 320, y: 200 },
    });
    expect(JSON.stringify(updated.structuredContent)).toContain('"x":320');

    const search = await handlers.search_artifacts({ query: 'MCP-native' });
    expect(JSON.stringify(search.structuredContent)).toContain('Local node');

    const exported = await handlers.export_canvas({ canvasId: canvas.id, format: 'markdown' });
    expect(exported.content[0].text).toContain('# MCP smoke');
  });
});
