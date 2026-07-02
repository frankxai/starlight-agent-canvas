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
  detectIntakeText,
  runActionInputSchema,
  updateNodeInputSchema,
  type AddNodeInput,
  type ConnectNodesInput,
  type CreateCanvasInput,
  type CanvasActionType,
  type CanvasExportFormat,
  type CanvasNode,
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

const MAX_IMAGE_BYTES = 5_000_000;
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']);
const ANYTHING_POSITION_STEP = { x: 280, y: 190 };

function imageReferenceSource(url: string, description = '', title?: string): IngestedSource {
  let fallbackTitle = 'Image source';
  try {
    fallbackTitle = `Image ${new URL(url).hostname.replace(/^www\./, '')}`;
  } catch {
    fallbackTitle = url.slice(0, 80) || fallbackTitle;
  }
  const notes = description.trim();
  return {
    title: title || fallbackTitle,
    body: notes || `Image reference mapped from ${url}. Add alt text, visual observations, OCR text, design notes, or claims for analysis.`,
    source: url,
    metadata: {
      url,
      imageUrl: url,
      ingest: notes ? 'manual_image_notes' : 'image_reference',
      media: 'image_reference',
    },
  };
}

export function createToolHandlers(store = new FileCanvasStore()) {
  async function resolveCanvasId(canvasId: string | undefined, fallbackTitle = 'Agent canvas capture'): Promise<string> {
    if (canvasId) return canvasId;
    const latest = (await store.listCanvases())[0];
    if (latest?.id) return latest.id;
    const created = await store.createCanvas({ title: fallbackTitle, template: 'blank' });
    return created.id;
  }

  function positionForIndex(position: { x: number; y: number } | undefined, index: number): { x: number; y: number } | undefined {
    if (!position) return undefined;
    return {
      x: position.x + (index % 3) * ANYTHING_POSITION_STEP.x,
      y: position.y + Math.floor(index / 3) * ANYTHING_POSITION_STEP.y,
    };
  }

  return {
    async list_canvases(): Promise<ToolResult> {
      const canvases = await store.listCanvases();
      return ok(jsonText(canvases), { canvases });
    },

    async get_latest_canvas(args: { includeCanvas?: boolean } = {}): Promise<ToolResult> {
      const summaries = await store.listCanvases();
      const latest = summaries[0] ?? null;
      if (!latest) {
        return ok('No local canvases found.', { canvas: null, summary: null });
      }
      const canvas = args.includeCanvas === false ? null : await store.getCanvas(latest.id);
      return ok(`Latest canvas: ${latest.title} (${latest.id})`, { canvas, summary: latest });
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

    async ingest_image(args: {
      canvasId: string;
      url?: string;
      title?: string;
      filename?: string;
      mimeType?: string;
      dataBase64?: string;
      description?: string;
      position?: { x: number; y: number };
    }): Promise<ToolResult> {
      if (args.url) {
        const source = imageReferenceSource(args.url, args.description ?? '', args.title);
        const result = await store.ingestSource(args.canvasId, ingestSourceInputSchema.parse({
          kind: 'source_image',
          title: source.title,
          body: source.body,
          source: source.source,
          artifactKind: 'image',
          metadata: source.metadata,
          position: args.position,
        }));
        return ok(`Ingested image reference ${result.node.title} (${result.node.id})`, result);
      }

      if (!args.dataBase64 || !args.filename || !args.mimeType) {
        throw new Error('Image ingest requires either url or filename, mimeType, and dataBase64.');
      }
      if (!SUPPORTED_IMAGE_TYPES.has(args.mimeType)) {
        throw new Error('Only PNG, JPEG, WebP, GIF, and AVIF images can be ingested.');
      }
      const bytes = Buffer.from(args.dataBase64, 'base64');
      if (bytes.byteLength > MAX_IMAGE_BYTES) {
        throw new Error(`Image is larger than ${MAX_IMAGE_BYTES} bytes.`);
      }
      const dataUrl = `data:${args.mimeType};base64,${bytes.toString('base64')}`;
      const body = args.description?.trim() || [
        `Image source: ${args.filename}`,
        `Type: ${args.mimeType}`,
        `Size: ${bytes.byteLength} bytes`,
        '',
        'Add visual observations, OCR text, design notes, claims, or questions here so agents can reason over the image.',
      ].join('\n');
      const result = await store.ingestSource(args.canvasId, ingestSourceInputSchema.parse({
        kind: 'source_image',
        title: args.title || args.filename,
        body,
        source: args.filename,
        artifactKind: 'image',
        metadata: {
          ingest: 'mcp_image_upload',
          filename: args.filename,
          mimeType: args.mimeType,
          fileSize: bytes.byteLength,
          imageDataUrl: dataUrl,
          media: 'image_upload',
        },
        position: args.position,
      }));
      return ok(`Ingested image source ${result.node.title} (${result.node.id})`, result);
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

    async ingest_anything(args: {
      canvasId?: string;
      content: string;
      title?: string;
      position?: { x: number; y: number };
      runAction?: CanvasActionType | 'none';
      prompt?: string;
    }): Promise<ToolResult> {
      const plan = detectIntakeText(args.content);
      if (!plan.items.length) {
        throw new Error('ingest_anything requires non-empty content.');
      }

      const canvasId = await resolveCanvasId(args.canvasId, args.title || 'Agent canvas capture');
      const results: Array<{ kind: string; node: CanvasNode; artifact?: unknown }> = [];

      for (const [index, item] of plan.items.entries()) {
        const position = positionForIndex(args.position, index);
        if (item.kind === 'youtube' && item.url) {
          const source = await ingestYoutube(item.url, item.attachedText ?? '').catch((error) => sourceFallback('source_youtube', item.url!, error));
          const result = await store.ingestSource(canvasId, ingestSourceInputSchema.parse({
            kind: 'source_youtube',
            title: args.title && plan.items.length === 1 ? args.title : source.title,
            body: source.body,
            source: source.source,
            metadata: { ...source.metadata, detectedBy: 'mcp_ingest_anything' },
            position,
          }));
          results.push({ kind: item.kind, node: result.node, artifact: result.artifact });
          continue;
        }

        if (item.kind === 'video' && item.url) {
          const source = videoReferenceSource(item.url, item.attachedText ?? '', args.title && plan.items.length === 1 ? args.title : item.title);
          const result = await store.ingestSource(canvasId, ingestSourceInputSchema.parse({
            kind: 'source_video',
            title: source.title,
            body: source.body,
            source: source.source,
            artifactKind: 'video',
            metadata: { ...source.metadata, detectedBy: 'mcp_ingest_anything' },
            position,
          }));
          results.push({ kind: item.kind, node: result.node, artifact: result.artifact });
          continue;
        }

        if (item.kind === 'image' && item.url) {
          const source = imageReferenceSource(item.url, item.attachedText ?? '', args.title && plan.items.length === 1 ? args.title : item.title);
          const result = await store.ingestSource(canvasId, ingestSourceInputSchema.parse({
            kind: 'source_image',
            title: source.title,
            body: source.body,
            source: source.source,
            artifactKind: 'image',
            metadata: { ...source.metadata, detectedBy: 'mcp_ingest_anything' },
            position,
          }));
          results.push({ kind: item.kind, node: result.node, artifact: result.artifact });
          continue;
        }

        if (item.kind === 'url' && item.url) {
          const source = await ingestUrl(item.url).catch((error) => sourceFallback('source_url', item.url!, error));
          const result = await store.ingestSource(canvasId, ingestSourceInputSchema.parse({
            kind: 'source_url',
            title: args.title && plan.items.length === 1 ? args.title : source.title,
            body: source.body,
            source: source.source,
            metadata: { ...source.metadata, detectedBy: 'mcp_ingest_anything' },
            position,
          }));
          results.push({ kind: item.kind, node: result.node, artifact: result.artifact });
          continue;
        }

        const result = await store.ingestSource(canvasId, ingestSourceInputSchema.parse({
          kind: 'note',
          title: args.title && plan.items.length === 1 ? args.title : item.title,
          body: item.body,
          source: 'mcp_ingest_anything',
          artifactKind: 'manual',
          metadata: { ingest: 'mcp_ingest_anything', detectedBy: 'mcp_ingest_anything' },
          position,
        }));
        results.push({ kind: item.kind, node: result.node, artifact: result.artifact });
      }

      let run: unknown;
      const action = args.runAction && args.runAction !== 'none' ? args.runAction : undefined;
      if (action) {
        const inputNodeIds = results.map((result) => result.node.id);
        const prompt = args.prompt
          ?? (action === 'answer_question'
            ? 'Using only the newly mapped source context, extract useful takeaways, contradictions, gaps, and next actions. Cite chunks when available.'
            : '');
        run = await store.runAction(canvasId, runActionInputSchema.parse({ action, inputNodeIds, prompt }));
      }

      const nodeIds = results.map((result) => result.node.id);
      return ok(`Mapped ${results.length} item(s) into ${canvasId}: ${results.map((result) => result.kind).join(', ')}.`, {
        canvasId,
        detected: plan,
        results,
        nodeIds,
        run,
      });
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

    async export_canvas(args: { canvasId: string; format?: CanvasExportFormat; nodeIds?: string[] }): Promise<ToolResult> {
      const format = args.format ?? 'json';
      const nodeIds = args.nodeIds ?? [];
      const body = await store.exportCanvas(args.canvasId, format, { nodeIds });
      return ok(body, { canvasId: args.canvasId, format, nodeIds, body });
    },
  };
}

export type AgentCanvasToolHandlers = ReturnType<typeof createToolHandlers>;
