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
      position: { x: 140, y: 160 },
    });
    const node = added.structuredContent?.node as { id: string; position: { x: number; y: number } };
    expect(node.id).toBeTruthy();
    expect(node.position).toEqual({ x: 140, y: 160 });

    const pdf = await handlers.ingest_pdf({
      canvasId: canvas.id,
      filename: 'local.pdf',
      dataBase64: Buffer.from('%PDF-1.4\nPDF text about MCP-native local workflow.\n%%EOF').toString('base64'),
      position: { x: 520, y: 160 },
    });
    expect(pdf.content[0].text).toContain('Ingested PDF source');

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
    expect(JSON.stringify(search.structuredContent)).toContain('artifactId');

    const exported = await handlers.export_canvas({ canvasId: canvas.id, format: 'markdown' });
    expect(exported.content[0].text).toContain('# MCP smoke');

    const context = await handlers.export_canvas({ canvasId: canvas.id, format: 'context' });
    expect(context.content[0].text).toContain('# Agent Context Packet: MCP smoke');
    expect(context.structuredContent?.format).toBe('context');

    const exportedJson = await handlers.export_canvas({ canvasId: canvas.id, format: 'json' });
    const portable = JSON.parse(exportedJson.content[0].text) as { id: string; title: string };
    portable.id = 'canvas-imported-mcp-smoke';
    portable.title = 'Imported MCP smoke';
    const imported = await handlers.import_canvas({ canvas: portable });
    expect(imported.content[0].text).toContain('Imported canvas Imported MCP smoke');

    const importedAgain = await handlers.import_canvas({ canvas: portable });
    expect(importedAgain.content[0].text).toContain('(imported)');
  });
});
