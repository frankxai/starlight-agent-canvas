import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { canvasIdSchema, canvasRecordSchema, addNodeInputSchema, connectNodesInputSchema, createCanvasInputSchema, exportCanvasOptionsSchema, ingestSourceInputSchema, updateNodeInputSchema, type AddNodeInput, type CanvasArtifact, type CanvasEdge, type CanvasNode, type CanvasRecord, type ConnectNodesInput, type CreateCanvasInput, type IngestSourceInput, type RunActionInput, type UpdateNodeInput, type CanvasExportFormat, type CanvasExportOptions } from './schemas.js';
import { buildSourceChunks, chunksForArtifact } from './chunks.js';
import { createCanvasRecord } from './templates.js';
import { exportCanvasAsAgentContext, exportCanvasAsCodexHandoff, exportCanvasAsMarkdown, scopeCanvasToNodes } from './exporters.js';
import { makeId, nowIso } from './ids.js';
import { runCanvasAction } from './actions.js';
import { getAgentCanvasHome } from './home.js';
import { withFileLock } from './file-lock.js';

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
