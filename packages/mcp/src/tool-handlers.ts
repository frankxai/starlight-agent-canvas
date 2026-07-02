import {
  addNodeInputSchema,
  canvasRecordSchema,
  connectNodesInputSchema,
  createCanvasInputSchema,
  FileCanvasStore,
  ingestSourceInputSchema,
  ingestPdf,
  ingestUrl,
  ingestYoutube,
  runActionInputSchema,
  updateNodeInputSchema,
  type AddNodeInput,
  type ConnectNodesInput,
  type CreateCanvasInput,
  type CanvasExportFormat,
  type IngestedSource,
  type RunActionInput,
  type UpdateNodeInput,
} from '@starlight-agent-canvas/core';

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function ok(text: string, structuredContent: Record<string, unknown>): ToolResult {
  return { content: [{ type: 'text', text }], structuredContent };
}

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function sourceFallback(kind: 'source_url' | 'source_youtube', url: string, error: unknown): IngestedSource {
  let title = kind === 'source_youtube' ? 'YouTube source' : 'URL source';
  try {
    title = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    title = url.slice(0, 80) || title;
  }
  return {
    title,
    body: `Readable text was not fetched from ${url}. The reference is still saved so an agent can annotate it or retry later.\n\nFetch note: ${(error as Error).message}`,
    source: url,
    metadata: {
      url,
      ingest: kind === 'source_youtube' ? 'youtube_reference_fallback' : 'url_reference_fallback',
      error: (error as Error).message,
    },
  };
}

function videoReferenceSource(url: string, manualTranscript = '', title?: string): IngestedSource {
  let fallbackTitle = 'Video source';
  try {
    fallbackTitle = `Video ${new URL(url).hostname.replace(/^www\./, '')}`;
  } catch {
    fallbackTitle = url.slice(0, 80) || fallbackTitle;
  }
  const notes = manualTranscript.trim();
  return {
    title: title || fallbackTitle,
    body: notes || `Video transcript was not fetched from ${url}. The reference is saved so an agent can attach transcript text, timestamp notes, claims, or a later extraction pass.`,
    source: url,
    metadata: {
      url,
      ingest: notes ? 'manual_video_transcript' : 'video_reference',
      media: 'video_reference',
    },
  };
}

export function createToolHandlers(store = new FileCanvasStore()) {
  return {
    async list_canvases(): Promise<ToolResult> {
      const canvases = await store.listCanvases();
      return ok(jsonText(canvases), { canvases });
    },

    async get_canvas(args: { canvasId: string }): Promise<ToolResult> {
      const canvas = await store.getCanvas(args.canvasId);
      return ok(jsonText(canvas), { canvas });
    },

    async create_canvas(args: CreateCanvasInput): Promise<ToolResult> {
      const canvas = await store.createCanvas(createCanvasInputSchema.parse(args));
      return ok(`Created canvas ${canvas.title} (${canvas.id})`, { canvas });
    },

    async import_canvas(args: { canvas: unknown }): Promise<ToolResult> {
      const canvas = await store.importCanvas(canvasRecordSchema.parse(args.canvas));
      return ok(`Imported canvas ${canvas.title} (${canvas.id})`, { canvas });
    },

    async add_node(args: { canvasId: string } & AddNodeInput): Promise<ToolResult> {
      const { canvasId, ...input } = args;
      const result = await store.addNode(canvasId, addNodeInputSchema.parse(input));
      return ok(`Added node ${result.node.title} (${result.node.id})`, result);
    },

    async update_node(args: { canvasId: string; nodeId: string } & UpdateNodeInput): Promise<ToolResult> {
      const { canvasId, nodeId, ...input } = args;
      const result = await store.updateNode(canvasId, nodeId, updateNodeInputSchema.parse(input));
      return ok(`Updated node ${result.node.title} (${result.node.id})`, result);
    },

    async ingest_text_source(args: {
      canvasId: string;
      title: string;
      body: string;
      source?: string;
      artifactKind?: 'markdown' | 'json' | 'manual';
      filename?: string;
      mimeType?: string;
      metadata?: Record<string, unknown>;
      position?: { x: number; y: number };
    }): Promise<ToolResult> {
      const { canvasId, position, artifactKind, filename, mimeType, ...input } = args;
      const result = await store.ingestSource(canvasId, ingestSourceInputSchema.parse({
        ...input,
        kind: 'note',
        artifactKind: artifactKind ?? 'manual',
        metadata: { ingest: 'mcp_text_source', filename, mimeType, ...(input.metadata ?? {}) },
        position,
      }));
      return ok(`Ingested text source ${result.node.title} (${result.node.id})`, result);
    },

    async ingest_url(args: { canvasId: string; url: string; useFirecrawl?: boolean; title?: string; position?: { x: number; y: number } }): Promise<ToolResult> {
      const source = await ingestUrl(args.url, { useFirecrawl: args.useFirecrawl === true }).catch((error) => sourceFallback('source_url', args.url, error));
      const result = await store.ingestSource(args.canvasId, ingestSourceInputSchema.parse({
        kind: 'source_url',
        title: args.title || source.title,
        body: source.body,
        source: source.source,
        metadata: source.metadata,
        position: args.position,
      }));
      return ok(`Ingested URL source ${result.node.title} (${result.node.id})`, result);
    },

    async ingest_youtube(args: { canvasId: string; url: string; manualTranscript?: string; title?: string; position?: { x: number; y: number } }): Promise<ToolResult> {
      const source = await ingestYoutube(args.url, args.manualTranscript ?? '').catch((error) => sourceFallback('source_youtube', args.url, error));
      const result = await store.ingestSource(args.canvasId, ingestSourceInputSchema.parse({
        kind: 'source_youtube',
        title: args.title || source.title,
        body: source.body,
        source: source.source,
        metadata: source.metadata,
        position: args.position,
      }));
      return ok(`Ingested video source ${result.node.title} (${result.node.id})`, result);
    },

    async ingest_video(args: { canvasId: string; url: string; manualTranscript?: string; title?: string; position?: { x: number; y: number } }): Promise<ToolResult> {
      const source = videoReferenceSource(args.url, args.manualTranscript ?? '', args.title);
      const result = await store.ingestSource(args.canvasId, ingestSourceInputSchema.parse({
        kind: 'source_video',
        title: source.title,
        body: source.body,
        source: source.source,
        artifactKind: 'video',
        metadata: source.metadata,
        position: args.position,
      }));
      return ok(`Ingested video reference ${result.node.title} (${result.node.id})`, result);
    },

    async ingest_pdf(args: { canvasId: string; filename: string; dataBase64: string; position?: { x: number; y: number } }): Promise<ToolResult> {
      const bytes = Buffer.from(args.dataBase64, 'base64');
      const source = await ingestPdf(bytes, args.filename);
      const result = await store.ingestSource(args.canvasId, ingestSourceInputSchema.parse({
        kind: 'source_pdf',
        title: source.title,
        body: source.body,
        source: source.source,
        metadata: { ...source.metadata, ingest: 'mcp_pdf_upload' },
        position: args.position,
      }));
      return ok(`Ingested PDF source ${result.node.title} (${result.node.id})`, result);
    },

    async connect_nodes(args: { canvasId: string } & ConnectNodesInput): Promise<ToolResult> {
      const { canvasId, ...input } = args;
      const result = await store.connectNodes(canvasId, connectNodesInputSchema.parse(input));
      return ok(`Connected ${result.edge.source} -> ${result.edge.target}`, result);
    },

    async run_node_action(args: { canvasId: string } & RunActionInput): Promise<ToolResult> {
      const { canvasId, ...input } = args;
      const result = await store.runAction(canvasId, runActionInputSchema.parse(input));
      return ok(result.run.summary, result);
    },

    async search_artifacts(args: { query: string }): Promise<ToolResult> {
      const results = await store.searchArtifacts(args.query);
      return ok(jsonText(results), { results });
    },

    async export_canvas(args: { canvasId: string; format?: CanvasExportFormat }): Promise<ToolResult> {
      const format = args.format ?? 'json';
      const body = await store.exportCanvas(args.canvasId, format);
      return ok(body, { canvasId: args.canvasId, format, body });
    },
  };
}

export type AgentCanvasToolHandlers = ReturnType<typeof createToolHandlers>;
