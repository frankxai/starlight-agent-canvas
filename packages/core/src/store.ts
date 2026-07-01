import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { canvasIdSchema, canvasRecordSchema, addNodeInputSchema, connectNodesInputSchema, createCanvasInputSchema, type AddNodeInput, type CanvasEdge, type CanvasNode, type CanvasRecord, type ConnectNodesInput, type CreateCanvasInput, type RunActionInput } from './schemas.js';
import { createCanvasRecord } from './templates.js';
import { exportCanvasAsMarkdown } from './exporters.js';
import { makeId, nowIso } from './ids.js';
import { runCanvasAction } from './actions.js';
import { getAgentCanvasHome } from './home.js';

export interface CanvasSummary {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
  nodeCount: number;
  runCount: number;
}

export class FileCanvasStore {
  readonly home: string;
  private readonly canvasDir: string;
  private readonly writeLocks = new Map<string, Promise<void>>();

  constructor(home = getAgentCanvasHome()) {
    this.home = home;
    this.canvasDir = path.join(home, 'canvases');
  }

  async ensure(): Promise<void> {
    await mkdir(this.canvasDir, { recursive: true });
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
      return await work(safeCanvasId);
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
    await this.saveCanvas(canvas);
    return canvas;
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

  async saveCanvas(canvas: CanvasRecord): Promise<CanvasRecord> {
    await this.ensure();
    const parsed = canvasRecordSchema.parse(canvas);
    const target = this.canvasPath(parsed.id);
    const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temp, JSON.stringify(parsed, null, 2), 'utf8');
    await rename(temp, target);
    return parsed;
  }

  async importCanvas(raw: unknown): Promise<CanvasRecord> {
    const parsed = canvasRecordSchema.parse(raw);
    return this.withCanvasLock(parsed.id, async () => this.saveCanvas({ ...parsed, updatedAt: nowIso() }));
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
      const next = await this.saveCanvas({
        ...canvas,
        updatedAt: timestamp,
        nodes: [...canvas.nodes, node],
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
      const next = await this.saveCanvas({
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
      await this.saveCanvas(result.canvas);
      return result;
    });
  }

  async exportCanvas(canvasId: string, format: 'json' | 'markdown' = 'json'): Promise<string> {
    const canvas = await this.getCanvas(canvasId);
    return format === 'markdown'
      ? exportCanvasAsMarkdown(canvas)
      : JSON.stringify(canvas, null, 2);
  }

  async searchArtifacts(query: string): Promise<Array<{ canvasId: string; nodeId: string; title: string; kind: string; excerpt: string }>> {
    const lower = query.trim().toLowerCase();
    if (!lower) return [];
    const summaries = await this.listCanvases();
    const results: Array<{ canvasId: string; nodeId: string; title: string; kind: string; excerpt: string }> = [];
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
          });
        }
      }
    }
    return results.slice(0, 25);
  }
}
