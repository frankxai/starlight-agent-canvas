import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { canvasIdSchema, canvasIntakeTraceSchema, canvasRecordSchema, addNodeInputSchema, connectNodesInputSchema, createCanvasInputSchema, enrichSourceInputSchema, exportCanvasOptionsSchema, ingestSourceInputSchema, updateNodeInputSchema, type AddNodeInput, type CanvasArtifact, type CanvasEdge, type CanvasIntakeTrace, type CanvasNode, type CanvasRecord, type ConnectNodesInput, type CreateCanvasInput, type EnrichSourceInput, type IngestSourceInput, type RunActionInput, type SourceEnrichmentKind, type UpdateNodeInput, type CanvasExportFormat, type CanvasExportOptions } from './schemas.js';
import { buildSourceChunks, chunksForArtifact } from './chunks.js';
import { createCanvasRecord } from './templates.js';
import { exportCanvasAsAgentContext, exportCanvasAsCodexHandoff, exportCanvasAsMarkdown, scopeCanvasToNodes } from './exporters.js';
import { makeId, nowIso } from './ids.js';
import { runCanvasAction } from './actions.js';
import { getAgentCanvasHome } from './home.js';
import { withFileLock } from './file-lock.js';
import { createIntakeTraceForNodes } from './source-intake.js';
import type { SourceReadiness } from './readiness.js';

export interface CanvasSummary {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
  nodeCount: number;
  runCount: number;
}

export interface ImportCanvasOptions {
  onConflict?: 'copy' | 'replace';
}

const SOURCE_NODE_KINDS = new Set<CanvasNode['kind']>([
  'source_url',
  'source_pdf',
  'source_youtube',
  'source_video',
  'source_image',
]);

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function metadataNumber(metadata: Record<string, unknown> | undefined, key: string): number {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function sourceForNode(node: CanvasNode, artifact?: CanvasArtifact): string | undefined {
  return artifact?.source
    ?? metadataString(node.metadata, 'source')
    ?? metadataString(node.metadata, 'url')
    ?? metadataString(node.metadata, 'imageUrl')
    ?? metadataString(artifact?.metadata, 'url')
    ?? metadataString(artifact?.metadata, 'imageUrl');
}

function isReferencePlaceholder(body: string): boolean {
  const lower = body.toLowerCase();
  return [
    'readable text was not fetched',
    'transcript was not available',
    'transcript was not fetched',
    'video transcript was not fetched',
    'image reference mapped from',
    'add visual observations',
    'binary media extraction is not enabled',
    'the reference is saved so an agent can attach',
    'the reference is still saved so an agent can annotate',
  ].some((marker) => lower.includes(marker));
}

function enrichmentLabel(kind: SourceEnrichmentKind): string {
  if (kind === 'transcript') return 'Manual transcript';
  if (kind === 'timestamp_notes') return 'Timestamp notes';
  if (kind === 'ocr') return 'OCR text';
  if (kind === 'visual_notes') return 'Visual observations';
  if (kind === 'claims') return 'Extracted claims';
  return 'Added notes';
}

function ingestForEnrichment(kind: SourceEnrichmentKind, node: CanvasNode): string {
  if (kind === 'transcript') return node.kind === 'source_video' ? 'manual_video_transcript' : 'manual_transcript';
  if (kind === 'timestamp_notes') return 'manual_timestamp_notes';
  if (kind === 'ocr') return 'manual_ocr';
  if (kind === 'visual_notes') return 'manual_visual_notes';
  if (kind === 'claims') return 'manual_claims';
  return node.kind === 'source_image' ? 'manual_image_notes' : 'manual_notes';
}

function composeEnrichedBody(currentBody: string, addition: string, kind: SourceEnrichmentKind, append: boolean): string {
  const current = currentBody.trim();
  const next = addition.trim();
  if (!next) throw new Error('Enrichment body must contain text.');
  if (!append || !current || isReferencePlaceholder(current)) return next;
  return `${current}\n\n---\n${enrichmentLabel(kind)}\n${next}`;
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') throw error;
      lastError = error;
      await sleep(25 * (attempt + 1));
    }
  }
  throw lastError;
}

export class FileCanvasStore {
  readonly home: string;
  private readonly canvasDir: string;
  private readonly lockDir: string;
  private readonly writeLocks = new Map<string, Promise<void>>();

  constructor(home = getAgentCanvasHome()) {
    this.home = home;
    this.canvasDir = path.join(home, 'canvases');
    this.lockDir = path.join(home, '.locks');
  }

  async ensure(): Promise<void> {
    await mkdir(this.canvasDir, { recursive: true });
    await mkdir(this.lockDir, { recursive: true });
  }

  canvasPath(id: string): string {
    const safeId = canvasIdSchema.parse(id);
    const root = path.resolve(this.canvasDir);
    const target = path.resolve(root, `${safeId}.json`);
    const relative = path.relative(root, target);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      throw new Error('Unsafe canvas id.');
    }
    return target;
  }

  private lockPath(id: string): string {
    const safeId = canvasIdSchema.parse(id);
    return path.join(this.lockDir, `${safeId}.lock`);
  }

  private async withCanvasLock<T>(canvasId: string, work: (safeCanvasId: string) => Promise<T>): Promise<T> {
    const safeCanvasId = canvasIdSchema.parse(canvasId);
    const previous = this.writeLocks.get(safeCanvasId) ?? Promise.resolve();
    let release = () => {};
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chain = previous.catch(() => undefined).then(() => next);
    this.writeLocks.set(safeCanvasId, chain);

    await previous.catch(() => undefined);
    try {
      await this.ensure();
      return await withFileLock(this.lockPath(safeCanvasId), () => work(safeCanvasId));
    } finally {
      release();
      if (this.writeLocks.get(safeCanvasId) === chain) {
        this.writeLocks.delete(safeCanvasId);
      }
    }
  }

  async listCanvases(): Promise<CanvasSummary[]> {
    await this.ensure();
    const files = (await readdir(this.canvasDir)).filter((file) => {
      if (!file.endsWith('.json')) return false;
      return canvasIdSchema.safeParse(file.replace(/\.json$/, '')).success;
    });
    const canvases = await Promise.all(files.map(async (file) => this.getCanvas(file.replace(/\.json$/, ''))));
    return canvases
      .map((canvas) => ({
        id: canvas.id,
        title: canvas.title,
        description: canvas.description,
        updatedAt: canvas.updatedAt,
        nodeCount: canvas.nodes.length,
        runCount: canvas.runs.length,
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createCanvas(input: CreateCanvasInput): Promise<CanvasRecord> {
    const parsed = createCanvasInputSchema.parse(input);
    const canvas = createCanvasRecord(parsed);
    return this.withCanvasLock(canvas.id, async () => this.saveCanvasFile(canvas));
  }

  async getCanvas(id: string): Promise<CanvasRecord> {
    await this.ensure();
    const raw = await readFile(this.canvasPath(id), 'utf8');
    const canvas = canvasRecordSchema.parse(JSON.parse(raw));
    if (canvas.id !== canvasIdSchema.parse(id)) {
      throw new Error('Canvas file id does not match requested canvas id.');
    }
    return canvas;
  }

  private async saveCanvasFile(canvas: CanvasRecord): Promise<CanvasRecord> {
    await this.ensure();
    const parsed = canvasRecordSchema.parse(canvas);
    const target = this.canvasPath(parsed.id);
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify(parsed, null, 2), 'utf8');
    await renameWithRetry(temp, target);
    return parsed;
  }

  async saveCanvas(canvas: CanvasRecord): Promise<CanvasRecord> {
    const parsed = canvasRecordSchema.parse(canvas);
    return this.withCanvasLock(parsed.id, async () => this.saveCanvasFile(parsed));
  }

  async importCanvas(raw: unknown, options: ImportCanvasOptions = {}): Promise<CanvasRecord> {
    const parsed = canvasRecordSchema.parse(raw);
    const onConflict = options.onConflict ?? 'copy';

    return this.withCanvasLock(parsed.id, async () => {
      let next = { ...parsed, updatedAt: nowIso() };

      if (onConflict === 'copy') {
        try {
          await this.getCanvas(parsed.id);
          const timestamp = nowIso();
          next = {
            ...parsed,
            id: makeId('canvas', parsed.title),
            title: `${parsed.title} (imported)`,
            createdAt: timestamp,
            updatedAt: timestamp,
          };
        } catch {
          // No existing canvas with this id; preserve the portable id.
        }
      }

      return this.saveCanvasFile(next);
    });
  }

  async addNode(canvasId: string, input: AddNodeInput): Promise<{ canvas: CanvasRecord; node: CanvasNode }> {
    return this.withCanvasLock(canvasId, async (safeCanvasId) => {
      const parsed = addNodeInputSchema.parse(input);
      const canvas = await this.getCanvas(safeCanvasId);
      const timestamp = nowIso();
      const node: CanvasNode = {
        id: makeId('node', parsed.title),
        kind: parsed.kind,
        title: parsed.title,
        body: parsed.body,
        position: parsed.position ?? {
          x: 120 + (canvas.nodes.length % 4) * 260,
          y: 160 + Math.floor(canvas.nodes.length / 4) * 180,
        },
        metadata: parsed.metadata,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const next = await this.saveCanvasFile({
        ...canvas,
        updatedAt: timestamp,
        nodes: [...canvas.nodes, node],
      });
      return { canvas: next, node };
    });
  }

  async ingestSource(canvasId: string, input: IngestSourceInput): Promise<{ canvas: CanvasRecord; node: CanvasNode; artifact: CanvasArtifact }> {
    return this.withCanvasLock(canvasId, async (safeCanvasId) => {
      const parsed = ingestSourceInputSchema.parse(input);
      const canvas = await this.getCanvas(safeCanvasId);
      const timestamp = nowIso();
      const artifactKind = parsed.artifactKind
        ?? (parsed.kind === 'source_url'
          ? 'url'
          : parsed.kind === 'source_pdf'
            ? 'pdf'
            : parsed.kind === 'source_youtube'
              ? 'youtube'
              : parsed.kind === 'source_video'
                ? 'video'
                : parsed.kind === 'source_image'
                  ? 'image'
                  : 'manual');
      const artifact: CanvasArtifact = {
        id: makeId('artifact', parsed.title),
        kind: artifactKind,
        title: parsed.title,
        body: parsed.body,
        source: parsed.source,
        createdAt: timestamp,
        metadata: parsed.metadata,
        chunks: [],
      };
      artifact.chunks = buildSourceChunks(artifact.id, artifact.body);
      const node: CanvasNode = {
        id: makeId('node', parsed.title),
        kind: parsed.kind,
        title: parsed.title,
        body: parsed.body,
        position: parsed.position ?? {
          x: 120 + (canvas.nodes.length % 4) * 260,
          y: 160 + Math.floor(canvas.nodes.length / 4) * 180,
        },
        metadata: {
          ...parsed.metadata,
          artifactId: artifact.id,
          source: parsed.source,
        },
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      const next = await this.saveCanvasFile({
        ...canvas,
        updatedAt: timestamp,
        artifacts: [...canvas.artifacts, artifact],
        nodes: [...canvas.nodes, node],
      });
      return { canvas: next, node, artifact };
    });
  }

  async updateNode(canvasId: string, nodeId: string, input: UpdateNodeInput): Promise<{ canvas: CanvasRecord; node: CanvasNode }> {
    return this.withCanvasLock(canvasId, async (safeCanvasId) => {
      const parsed = updateNodeInputSchema.parse(input);
      const canvas = await this.getCanvas(safeCanvasId);
      const index = canvas.nodes.findIndex((node) => node.id === nodeId);
      if (index < 0) {
        throw new Error(`Node not found: ${nodeId}`);
      }
      const timestamp = nowIso();
      const current = canvas.nodes[index];
      const node: CanvasNode = {
        ...current,
        title: parsed.title ?? current.title,
        body: parsed.body ?? current.body,
        position: parsed.position ?? current.position,
        metadata: parsed.metadata ? { ...current.metadata, ...parsed.metadata } : current.metadata,
        updatedAt: timestamp,
      };
      const nodes = [...canvas.nodes];
      nodes[index] = node;
      const next = await this.saveCanvasFile({
        ...canvas,
        updatedAt: timestamp,
        nodes,
      });
      return { canvas: next, node };
    });
  }

  async enrichSourceNode(canvasId: string, nodeId: string, input: EnrichSourceInput): Promise<{ canvas: CanvasRecord; node: CanvasNode; artifact?: CanvasArtifact; trace: CanvasIntakeTrace; sourceReadiness: SourceReadiness[] }> {
    return this.withCanvasLock(canvasId, async (safeCanvasId) => {
      const parsed = enrichSourceInputSchema.parse(input);
      const canvas = await this.getCanvas(safeCanvasId);
      const nodeIndex = canvas.nodes.findIndex((node) => node.id === nodeId);
      if (nodeIndex < 0) {
        throw new Error(`Node not found: ${nodeId}`);
      }

      const current = canvas.nodes[nodeIndex];
      const artifactId = metadataString(current.metadata, 'artifactId');
      const artifactIndex = artifactId ? canvas.artifacts.findIndex((artifact) => artifact.id === artifactId) : -1;
      const currentArtifact = artifactIndex >= 0 ? canvas.artifacts[artifactIndex] : undefined;
      if (!SOURCE_NODE_KINDS.has(current.kind) && !currentArtifact) {
        throw new Error('Only source nodes or artifact-backed nodes can be enriched.');
      }

      const timestamp = nowIso();
      const ingest = ingestForEnrichment(parsed.enrichmentKind, current);
      const nextBody = composeEnrichedBody(currentArtifact?.body ?? current.body, parsed.body, parsed.enrichmentKind, parsed.append);
      const source = sourceForNode(current, currentArtifact);
      const enrichmentMetadata = {
        ...parsed.metadata,
        ingest,
        lastEnrichmentKind: parsed.enrichmentKind,
        lastEnrichedAt: timestamp,
        enrichmentCount: metadataNumber(currentArtifact?.metadata ?? current.metadata, 'enrichmentCount') + 1,
      };

      const node: CanvasNode = {
        ...current,
        title: parsed.title ?? current.title,
        body: nextBody,
        metadata: {
          ...current.metadata,
          ...parsed.metadata,
          ingest: currentArtifact ? current.metadata.ingest : ingest,
          lastEnrichmentKind: parsed.enrichmentKind,
          lastEnrichedAt: timestamp,
          enrichmentCount: metadataNumber(current.metadata, 'enrichmentCount') + 1,
        },
        updatedAt: timestamp,
      };

      let artifact: CanvasArtifact | undefined;
      const artifacts = [...canvas.artifacts];
      if (currentArtifact && artifactIndex >= 0) {
        artifact = {
          ...currentArtifact,
          title: parsed.title ?? currentArtifact.title,
          body: nextBody,
          metadata: {
            ...currentArtifact.metadata,
            ...enrichmentMetadata,
          },
          chunks: buildSourceChunks(currentArtifact.id, nextBody),
        };
        artifacts[artifactIndex] = artifact;
      }

      const nodes = [...canvas.nodes];
      nodes[nodeIndex] = node;
      const enrichedCanvas: CanvasRecord = {
        ...canvas,
        updatedAt: timestamp,
        nodes,
        artifacts,
      };
      const { trace, sourceReadiness } = createIntakeTraceForNodes({
        canvas: enrichedCanvas,
        nodes: [node],
        artifacts: artifact ? [artifact] : [],
        origin: 'source_enrichment',
        sourceLabel: parsed.sourceLabel ?? 'Source enrichment',
        inputSummary: `${enrichmentLabel(parsed.enrichmentKind)} for ${node.title}`,
        inputChars: parsed.body.trim().length,
        detectedKinds: [artifact?.kind ?? node.kind.replace(/^source_/, '')],
        urls: source ? [source] : [],
      });
      const next = await this.saveCanvasFile({
        ...enrichedCanvas,
        intakeTraces: [
          trace,
          ...enrichedCanvas.intakeTraces.filter((candidate) => candidate.id !== trace.id),
        ].slice(0, 50),
      });
      return { canvas: next, node, artifact, trace, sourceReadiness };
    });
  }

  async connectNodes(canvasId: string, input: ConnectNodesInput): Promise<{ canvas: CanvasRecord; edge: CanvasEdge }> {
    return this.withCanvasLock(canvasId, async (safeCanvasId) => {
      const parsed = connectNodesInputSchema.parse(input);
      const canvas = await this.getCanvas(safeCanvasId);
      const ids = new Set(canvas.nodes.map((node) => node.id));
      if (!ids.has(parsed.source) || !ids.has(parsed.target)) {
        throw new Error('Both source and target nodes must exist before connecting.');
      }
      const timestamp = nowIso();
      const edge: CanvasEdge = {
        id: makeId('edge', `${parsed.source}-${parsed.target}`),
        source: parsed.source,
        target: parsed.target,
        kind: parsed.kind,
        createdAt: timestamp,
      };
      const next = await this.saveCanvasFile({
        ...canvas,
        updatedAt: timestamp,
        edges: [...canvas.edges, edge],
      });
      return { canvas: next, edge };
    });
  }

  async runAction(canvasId: string, input: RunActionInput): Promise<ReturnType<typeof runCanvasAction>> {
    return this.withCanvasLock(canvasId, async (safeCanvasId) => {
      const canvas = await this.getCanvas(safeCanvasId);
      const result = runCanvasAction(canvas, input);
      await this.saveCanvasFile(result.canvas);
      return result;
    });
  }

  async appendIntakeTrace(canvasId: string, trace: CanvasIntakeTrace, limit = 50): Promise<CanvasRecord> {
    return this.withCanvasLock(canvasId, async (safeCanvasId) => {
      const parsed = canvasIntakeTraceSchema.parse(trace);
      const canvas = await this.getCanvas(safeCanvasId);
      const timestamp = nowIso();
      const intakeTraces = [
        parsed,
        ...canvas.intakeTraces.filter((candidate) => candidate.id !== parsed.id),
      ].slice(0, limit);
      return this.saveCanvasFile({
        ...canvas,
        updatedAt: timestamp,
        intakeTraces,
      });
    });
  }

  async exportCanvas(canvasId: string, format: CanvasExportFormat = 'json', options: CanvasExportOptions = {}): Promise<string> {
    const canvas = await this.getCanvas(canvasId);
    const parsedOptions = exportCanvasOptionsSchema.parse(options);
    const exportCanvas = scopeCanvasToNodes(canvas, parsedOptions.nodeIds);
    if (format === 'markdown') return exportCanvasAsMarkdown(exportCanvas);
    if (format === 'context') return exportCanvasAsAgentContext(exportCanvas);
    if (format === 'codex') return exportCanvasAsCodexHandoff(exportCanvas);
    return JSON.stringify(exportCanvas, null, 2);
  }

  async searchArtifacts(query: string): Promise<Array<{ canvasId: string; nodeId: string; artifactId?: string; chunkId?: string; chunkIndex?: number; title: string; kind: string; excerpt: string; source?: string; score: number }>> {
    const lower = query.trim().toLowerCase();
    if (!lower) return [];
    const summaries = await this.listCanvases();
    const results: Array<{ canvasId: string; nodeId: string; artifactId?: string; chunkId?: string; chunkIndex?: number; title: string; kind: string; excerpt: string; source?: string; score: number }> = [];
    for (const summary of summaries) {
      const canvas = await this.getCanvas(summary.id);
      for (const node of canvas.nodes) {
        const haystack = `${node.title}\n${node.body}\n${JSON.stringify(node.metadata)}`.toLowerCase();
        if (haystack.includes(lower)) {
          results.push({
            canvasId: canvas.id,
            nodeId: node.id,
            title: node.title,
            kind: node.kind,
            excerpt: node.body.slice(0, 240),
            source: typeof node.metadata.source === 'string' ? node.metadata.source : typeof node.metadata.url === 'string' ? node.metadata.url : undefined,
            score: node.title.toLowerCase().includes(lower) ? 3 : 1,
          });
        }
      }
      for (const artifact of canvas.artifacts) {
        const haystack = `${artifact.title}\n${artifact.body}\n${artifact.source ?? ''}\n${JSON.stringify(artifact.metadata)}`.toLowerCase();
        const chunks = chunksForArtifact(artifact);
        const matchingChunks = chunks.filter((chunk) => chunk.text.toLowerCase().includes(lower));
        if (haystack.includes(lower)) {
          const node = canvas.nodes.find((candidate) => candidate.metadata.artifactId === artifact.id);
          if (!matchingChunks.length) {
            const fallbackChunk = chunks[0];
            results.push({
              canvasId: canvas.id,
              nodeId: node?.id ?? '',
              artifactId: artifact.id,
              chunkId: fallbackChunk?.id,
              chunkIndex: fallbackChunk?.index,
              title: artifact.title,
              kind: artifact.kind,
              excerpt: (fallbackChunk?.text ?? artifact.body).slice(0, 240),
              source: artifact.source,
              score: artifact.title.toLowerCase().includes(lower) ? 4 : 2,
            });
          }
        }
        for (const chunk of matchingChunks) {
          const node = canvas.nodes.find((candidate) => candidate.metadata.artifactId === artifact.id);
          results.push({
            canvasId: canvas.id,
            nodeId: node?.id ?? '',
            artifactId: artifact.id,
            chunkId: chunk.id,
            chunkIndex: chunk.index,
            title: artifact.title,
            kind: artifact.kind,
            excerpt: chunk.text.slice(0, 240),
            source: artifact.source,
            score: artifact.title.toLowerCase().includes(lower) ? 5 : 3,
          });
        }
      }
    }
    return results
      .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
      .slice(0, 25);
  }
}
