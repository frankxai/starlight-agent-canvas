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

    const latest = await handlers.get_latest_canvas();
    expect(latest.content[0].text).toContain('MCP smoke');
    expect((latest.structuredContent?.canvas as { id: string }).id).toBe(canvas.id);

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

    const canvasWithYoutube = await handlers.get_canvas({ canvasId: canvas.id });
    const youtubeReadiness = canvasWithYoutube.structuredContent?.sourceReadiness as Array<{ nodeId: string; label: string; status: string; canRunActions: boolean }>;
    expect(youtubeReadiness.find((item) => item.nodeId === videoNode.id)).toMatchObject({
      label: 'Codex-ready transcript',
      status: 'ready',
      canRunActions: true,
    });

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

    const anything = await handlers.ingest_anything({
      canvasId: canvas.id,
      content: 'https://vimeo.com/987654321\nManual notes from a pasted generic video about shared human and Codex context.',
      runAction: 'summarize',
      position: { x: 1120, y: 520 },
    });
    const anythingNodeIds = anything.structuredContent?.nodeIds as string[];
    const anythingRun = anything.structuredContent?.run as { outputNode?: { id: string } };
    expect(anything.content[0].text).toContain('video');
    expect(anythingNodeIds).toHaveLength(1);
    expect(anythingRun.outputNode?.id).toBeTruthy();

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

  it('can ingest anything into a newly created capture canvas when no canvas id is supplied', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'agent-canvas-mcp-anything-'));
    const handlers = createToolHandlers(new FileCanvasStore(home));

    const result = await handlers.ingest_anything({
      content: 'Standalone pasted research note for a fresh agent capture.',
      title: 'Standalone capture',
      position: { x: 100, y: 120 },
    });

    const canvasId = result.structuredContent?.canvasId as string;
    const nodeIds = result.structuredContent?.nodeIds as string[];
    expect(canvasId).toBeTruthy();
    expect(nodeIds).toHaveLength(1);

    const latest = await handlers.get_latest_canvas();
    expect((latest.structuredContent?.canvas as { id: string }).id).toBe(canvasId);
    expect(JSON.stringify(latest.structuredContent)).toContain('Standalone pasted research note');
  });

  it('keeps nearby mixed-media notes attached through ingest_anything', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'agent-canvas-mcp-mixed-media-'));
    const handlers = createToolHandlers(new FileCanvasStore(home));
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 404 })));

    const created = await handlers.create_canvas({ title: 'Mixed media intake', template: 'blank' });
    const canvas = created.structuredContent?.canvas as { id: string };
    const result = await handlers.ingest_anything({
      canvasId: canvas.id,
      content: [
        'https://youtu.be/abcdefghijk',
        'Manual transcript: the walkthrough shows context receipts and Codex handoff.',
        'https://www.loom.com/share/starlight-proof',
        'Notes: the Loom walkthrough shows how a human maps source context.',
        'https://example.com/workflow.png',
        'OCR: visible buttons include Inspect, Context, and Codex.',
      ].join('\n'),
      position: { x: 120, y: 160 },
    });

    const results = result.structuredContent?.results as Array<{ kind: string; artifact: { body: string; kind: string } }>;
    const readiness = result.structuredContent?.sourceReadiness as Array<{ label: string; status: string; canRunActions: boolean }>;
    expect(results.map((item) => item.kind)).toEqual(['youtube', 'video', 'image']);
    expect(results.find((item) => item.kind === 'youtube')?.artifact.body).toContain('Manual transcript');
    expect(results.find((item) => item.kind === 'video')?.artifact.body).toContain('Loom walkthrough');
    expect(results.find((item) => item.kind === 'image')?.artifact.body).toContain('visible buttons');
    expect(readiness.map((item) => item.label)).toEqual([
      'Codex-ready transcript',
      'Codex-ready video notes',
      'Codex-ready visual notes',
    ]);
    expect(readiness.every((item) => item.status === 'ready' && item.canRunActions)).toBe(true);

    const latest = await handlers.get_canvas({ canvasId: canvas.id });
    const latestText = JSON.stringify(latest.structuredContent);
    expect(latestText).toContain('source_youtube');
    expect(latestText).toContain('source_video');
    expect(latestText).toContain('source_image');
    expect(latestText).toContain('Codex-ready visual notes');
    expect(latestText).not.toContain('kind":"note"');
  });
});
