import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileCanvasStore } from '@starlight-agent-canvas/core';
import { createToolHandlers } from '../tool-handlers.js';

describe('MCP tool handlers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('creates, updates, runs, searches, and exports a canvas', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'agent-canvas-mcp-'));
    const handlers = createToolHandlers(new FileCanvasStore(home));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

    const created = await handlers.create_canvas({ title: 'MCP smoke', template: 'blank' });
    const canvas = created.structuredContent?.canvas as { id: string };
    expect(canvas.id).toBeTruthy();

    const added = await handlers.ingest_text_source({
      canvasId: canvas.id,
      title: 'Local node',
      body: 'MCP-native local workflow.',
      artifactKind: 'markdown',
      filename: 'local-node.md',
      mimeType: 'text/markdown',
      metadata: {},
      position: { x: 140, y: 160 },
    });
    const node = added.structuredContent?.node as { id: string; position: { x: number; y: number } };
    const textArtifact = added.structuredContent?.artifact as { kind: string; metadata: Record<string, unknown> };
    expect(node.id).toBeTruthy();
    expect(node.position).toEqual({ x: 140, y: 160 });
    expect(textArtifact.kind).toBe('markdown');
    expect(textArtifact.metadata.filename).toBe('local-node.md');

    const youtube = await handlers.ingest_youtube({
      canvasId: canvas.id,
      url: 'https://youtu.be/abcdefghijk',
      manualTranscript: 'Manual transcript about Source Note Ask modes and chunked Codex context export.',
      position: { x: 520, y: 160 },
    });
    const videoNode = youtube.structuredContent?.node as { id: string };
    const videoArtifact = youtube.structuredContent?.artifact as { kind: string; chunks: Array<{ id: string }> };
    expect(videoNode.id).toBeTruthy();
    expect(videoArtifact.kind).toBe('youtube');
    expect(videoArtifact.chunks[0].id).toContain('chunk-001');

    const genericVideo = await handlers.ingest_video({
      canvasId: canvas.id,
      url: 'https://vimeo.com/123456789',
      title: 'Vimeo workflow note',
      manualTranscript: 'Transcript notes from a generic video source about agent workflow maps.',
      position: { x: 680, y: 360 },
    });
    const genericVideoNode = genericVideo.structuredContent?.node as { id: string; kind: string };
    const genericVideoArtifact = genericVideo.structuredContent?.artifact as { kind: string; chunks: Array<{ id: string }> };
    expect(genericVideoNode.kind).toBe('source_video');
    expect(genericVideoArtifact.kind).toBe('video');
    expect(genericVideoArtifact.chunks[0].id).toContain('chunk-001');

    const imageReference = await handlers.ingest_image({
      canvasId: canvas.id,
      url: 'https://example.com/workflow.png',
      title: 'Workflow screenshot',
      description: 'Visual notes from a workflow screenshot about composer and canvas states.',
      position: { x: 760, y: 520 },
    });
    const imageReferenceNode = imageReference.structuredContent?.node as { kind: string };
    const imageReferenceArtifact = imageReference.structuredContent?.artifact as { kind: string; metadata: Record<string, unknown> };
    expect(imageReferenceNode.kind).toBe('source_image');
    expect(imageReferenceArtifact.kind).toBe('image');
    expect(imageReferenceArtifact.metadata.imageUrl).toBe('https://example.com/workflow.png');

    const imageUpload = await handlers.ingest_image({
      canvasId: canvas.id,
      filename: 'local-screenshot.png',
      mimeType: 'image/png',
      dataBase64: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).toString('base64'),
      description: 'Uploaded screenshot notes for visual QA.',
      position: { x: 960, y: 520 },
    });
    const imageUploadArtifact = imageUpload.structuredContent?.artifact as { kind: string; metadata: Record<string, unknown> };
    expect(imageUploadArtifact.kind).toBe('image');
    expect(imageUploadArtifact.metadata.imageDataUrl).toContain('data:image/png;base64');

    const url = await handlers.ingest_url({
      canvasId: canvas.id,
      url: 'http://127.0.0.1/starlight-agent-canvas-test',
      title: 'Localhost URL reference',
      position: { x: 840, y: 160 },
    });
    const urlNode = url.structuredContent?.node as { id: string };
    const urlArtifact = url.structuredContent?.artifact as { kind: string; metadata: Record<string, unknown> };
    expect(urlNode.id).toBeTruthy();
    expect(urlArtifact.kind).toBe('url');
    expect(urlArtifact.metadata.ingest).toBe('url_reference_fallback');

    const pdf = await handlers.ingest_pdf({
      canvasId: canvas.id,
      filename: 'local.pdf',
      dataBase64: Buffer.from('%PDF-1.4\nPDF text about MCP-native local workflow.\n%%EOF').toString('base64'),
      position: { x: 1160, y: 160 },
    });
    expect(pdf.content[0].text).toContain('Ingested PDF source');

    const edge = await handlers.connect_nodes({
      canvasId: canvas.id,
      source: node.id,
      target: videoNode.id,
      kind: 'references',
    });
    expect(edge.content[0].text).toContain('Connected');
    await handlers.connect_nodes({
      canvasId: canvas.id,
      source: videoNode.id,
      target: urlNode.id,
      kind: 'compares',
    });

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
    const chunkSearch = await handlers.search_artifacts({ query: 'Source Note Ask' });
    expect(JSON.stringify(chunkSearch.structuredContent)).toContain('chunk-001');

    const exported = await handlers.export_canvas({ canvasId: canvas.id, format: 'markdown' });
    expect(exported.content[0].text).toContain('# MCP smoke');

    const context = await handlers.export_canvas({ canvasId: canvas.id, format: 'context' });
    expect(context.content[0].text).toContain('# Agent Context Packet: MCP smoke');
    expect(context.content[0].text).toContain('Source Chunk Manifest');
    expect(context.content[0].text).toContain(videoArtifact.chunks[0].id);
    expect(context.structuredContent?.format).toBe('context');

    const codex = await handlers.export_canvas({ canvasId: canvas.id, format: 'codex' });
    expect(codex.content[0].text).toContain('# Codex Handoff: MCP smoke');
    expect(codex.content[0].text).toContain('# Agent Context Packet: MCP smoke');
    expect(codex.structuredContent?.format).toBe('codex');

    const selectedCodex = await handlers.export_canvas({ canvasId: canvas.id, format: 'codex', nodeIds: [videoNode.id] });
    expect(selectedCodex.content[0].text).toContain('# Codex Handoff: MCP smoke (selected node)');
    expect(selectedCodex.content[0].text).toContain(videoArtifact.chunks[0].id);
    expect(selectedCodex.content[0].text).not.toContain('Local node');
    expect(selectedCodex.structuredContent?.nodeIds).toEqual([videoNode.id]);

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
