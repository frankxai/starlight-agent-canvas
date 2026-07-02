import {
  addNodeInputSchema,
  canvasRecordSchema,
  connectNodesInputSchema,
  createCanvasInputSchema,
  FileCanvasStore,
  ingestSourceInputSchema,
  ingestUrl,
  ingestYoutube,
  runActionInputSchema,
  updateNodeInputSchema,
  type AddNodeInput,
  type ConnectNodesInput,
  type CreateCanvasInput,
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

    async ingest_text_source(args: { canvasId: string; title: string; body: string; source?: string; metadata?: Record<string, unknown> }): Promise<ToolResult> {
      const { canvasId, ...input } = args;
      const result = await store.ingestSource(canvasId, ingestSourceInputSchema.parse({
        ...input,
        kind: 'note',
        artifactKind: 'manual',
        metadata: { ingest: 'mcp_text_source', ...(input.metadata ?? {}) },
      }));
      return ok(`Ingested text source ${result.node.title} (${result.node.id})`, result);
    },

    async ingest_url(args: { canvasId: string; url: string; useFirecrawl?: boolean; title?: string }): Promise<ToolResult> {
      const source = await ingestUrl(args.url, { useFirecrawl: args.useFirecrawl === true }).catch((error) => sourceFallback('source_url', args.url, error));
      const result = await store.ingestSource(args.canvasId, ingestSourceInputSchema.parse({
        kind: 'source_url',
        title: args.title || source.title,
        body: source.body,
        source: source.source,
        metadata: source.metadata,
      }));
      return ok(`Ingested URL source ${result.node.title} (${result.node.id})`, result);
    },

    async ingest_youtube(args: { canvasId: string; url: string; manualTranscript?: string; title?: string }): Promise<ToolResult> {
      const source = await ingestYoutube(args.url, args.manualTranscript ?? '').catch((error) => sourceFallback('source_youtube', args.url, error));
      const result = await store.ingestSource(args.canvasId, ingestSourceInputSchema.parse({
        kind: 'source_youtube',
        title: args.title || source.title,
        body: source.body,
        source: source.source,
        metadata: source.metadata,
      }));
      return ok(`Ingested video source ${result.node.title} (${result.node.id})`, result);
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

    async export_canvas(args: { canvasId: string; format?: 'json' | 'markdown' }): Promise<ToolResult> {
      const format = args.format ?? 'json';
      const body = await store.exportCanvas(args.canvasId, format);
      return ok(body, { canvasId: args.canvasId, format, body });
    },
  };
}

export type AgentCanvasToolHandlers = ReturnType<typeof createToolHandlers>;
