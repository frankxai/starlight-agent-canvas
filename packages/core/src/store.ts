import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
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
import { canvasContentHash, canonicalJson, checkpointInputSchema, compareCanvasSnapshots, summarizeCheckpoint, validateCheckpoint, type CanvasCheckpoint, type CanvasComparison, type CheckpointSummary } from './checkpoints.js';
import { parseWebsitePlan, websitePlanFromCanvas, websitePlanGaps, websitePlanMarkdown, websiteProjectionSpecs, WEBSITE_ROLE, type WebsiteSelection, type WebsiteImplementationPacket } from './website.js';

function websitePlanHash(plan: unknown): string {
  return createHash('sha256').update(canonicalJson(plan)).digest('hex');
}

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

  private checkpointPath(canvasId: string, checkpointId: string): string {
    return path.join(this.home, 'checkpoints', canvasIdSchema.parse(canvasId), `${canvasIdSchema.parse(checkpointId)}.json`);
  }

  async createCheckpoint(canvasId: string, input: { label: string }): Promise<CheckpointSummary> {
    const { label } = checkpointInputSchema.parse(input);
    return this.withCanvasLock(canvasId, async (safeId) => {
      const snapshot = await this.getCanvas(safeId);
      return this.writeCheckpoint(snapshot, label);
    });
  }

  private async writeCheckpoint(snapshot: CanvasRecord, label: string): Promise<CheckpointSummary> {
      const safeId = snapshot.id;
      const checkpoint: CanvasCheckpoint = {
        version: 'starlight.agentCanvas.checkpoint.v1',
        id: `checkpoint-${randomUUID()}`, canvasId: safeId, label, createdAt: nowIso(),
        canvasSchemaVersion: snapshot.schemaVersion, contentHash: canvasContentHash(snapshot), snapshot,
      };
      const target = this.checkpointPath(safeId, checkpoint.id);
      await mkdir(path.dirname(target), { recursive: true });
      const temp = `${target}.${process.pid}.tmp`;
      await writeFile(temp, JSON.stringify(checkpoint, null, 2), { encoding: 'utf8', flag: 'wx' });
      await renameWithRetry(temp, target);
      return summarizeCheckpoint(checkpoint);
  }

  async getWebsitePlan(canvasId: string) {
    const record = websitePlanFromCanvas(await this.getCanvas(canvasId));
    if (!record) return null;
    let selectionVerified = false;
    if (record.selection) {
      try {
        const checkpoint = await this.getCheckpoint(canvasId, record.selection.checkpointId);
        const original = websitePlanFromCanvas(checkpoint.snapshot);
        selectionVerified = checkpoint.contentHash === record.selection.checkpointHash && Boolean(original?.plan.options.some((option) => option.id === record.selection!.optionId)) && websitePlanHash(original!.plan) === record.selection.planHash && websitePlanHash(record.plan) === record.selection.planHash;
      } catch { /* Retain the assertion; an explicit choice creates new evidence. */ }
    }
    return { ...record, selectionVerified, planHash: websitePlanHash(record.plan), gaps: [...websitePlanGaps(record.plan), ...(record.selection && !selectionVerified ? ['The saved choice has unavailable checkpoint evidence. Choose the saved direction again to capture its current state.'] : [])] };
  }

  async getWebsitePlanState(canvasId: string) {
    const canvas = await this.getCanvas(canvasId);
    try { websitePlanFromCanvas(canvas); }
    catch { return { record: null, unavailable: { canvasHash: canvasContentHash(canvas), reason: 'Website plan evidence could not be parsed or has multiple authorities. Download the canvas before replacing the plan; prior evidence will be retained.' } }; }
    return { record: await this.getWebsitePlan(canvasId), unavailable: null };
  }

  async recoverWebsitePlan(canvasId: string, raw: unknown, expectedCanvasHash: string) {
    const plan = parseWebsitePlan(raw);
    return this.withCanvasLock(canvasId, async (safeId) => {
      const canvas = await this.getCanvas(safeId);
      if (canvasContentHash(canvas) !== expectedCanvasHash) throw new Error('Website plan changed in another client. Keep your draft and reload the saved version before merging.');
      let invalid = false;
      try { websitePlanFromCanvas(canvas); } catch { invalid = true; }
      if (!invalid) throw new Error('Website plan evidence is now readable. Reload it before saving.');
      const retained = { ...canvas, nodes: canvas.nodes.map((node) => node.metadata.role === WEBSITE_ROLE ? { ...node, metadata: { ...node.metadata, role: 'website_plan_unverified', previousRole: WEBSITE_ROLE } } : node.metadata.websiteProjectionOf ? { ...node, metadata: { ...node.metadata, websiteProjectionRetired: true, websiteSelected: false } } : node) };
      return this.saveWebsitePlanLocked(retained, plan);
    });
  }

  async saveWebsitePlan(canvasId: string, raw: unknown, expectedHash?: string) {
    const plan = parseWebsitePlan(raw);
    return this.withCanvasLock(canvasId, async (safeId) => this.saveWebsitePlanLocked(await this.getCanvas(safeId), plan, expectedHash));
  }

  private async saveWebsitePlanLocked(canvas: CanvasRecord, plan: ReturnType<typeof parseWebsitePlan>, expectedHash?: string) {
      const safeId = canvas.id;
      const previous = websitePlanFromCanvas(canvas);
      if (previous && websitePlanHash(previous.plan) === websitePlanHash(plan)) return { canvas, record: await this.getWebsitePlan(safeId) };
      if ((previous ? websitePlanHash(previous.plan) : undefined) !== expectedHash) throw new Error('Website plan changed in another client. Keep your draft and reload the saved version before merging.');
      const timestamp = nowIso();
      const previousNode = previous ? canvas.nodes.find((node) => node.id === previous.nodeId)! : undefined;
      const metadata = { ...(previousNode?.metadata ?? {}), role: WEBSITE_ROLE, entityType: 'design_brief', websitePlan: plan };
      delete (metadata as Record<string, unknown>).websiteSelection;
      const node: CanvasNode = { id: previousNode?.id ?? makeId('node', plan.title), kind: 'output', title: plan.title, body: websitePlanMarkdown(plan), position: previousNode?.position ?? { x: 120, y: 120 }, metadata, createdAt: previousNode?.createdAt ?? timestamp, updatedAt: timestamp };
      const projections = websiteProjectionSpecs(plan).map((spec, index): CanvasNode => {
        const projectionId = `${node.id}-${spec.entityType}-${spec.entityId}`;
        const old = canvas.nodes.find((item) => item.id === projectionId);
        return { id: projectionId, kind: 'note', title: spec.title, body: spec.body, position: old?.position ?? { x: 440 + (index % 3) * 300, y: 120 + Math.floor(index / 3) * 280 }, createdAt: old?.createdAt ?? timestamp, updatedAt: timestamp, metadata: { websiteProjectionOf: node.id, entityType: spec.entityType, entityId: spec.entityId, planHash: websitePlanHash(plan), sourceObservedAt: plan.snapshot.observedAt, websiteSelected: false } };
      });
      const activeIds = new Set(projections.map((item) => item.id));
      // Retain retired projections and user-created links as historical evidence.
      // Only this plan's read-only current projections are regenerated.
      const retained = canvas.nodes.filter((item) => item.id !== node.id && !activeIds.has(item.id)).map((item) => item.metadata.websiteProjectionOf === node.id ? { ...item, metadata: { ...item.metadata, websiteProjectionRetired: true, websiteSelected: false } } : item);
      const generatedPrefix = `website-${node.id}-`;
      const projectedEdges: CanvasEdge[] = projections.map((view) => ({ id: `${generatedPrefix}${view.id}`, source: view.metadata.entityType === 'site_snapshot' ? view.id : node.id, target: view.metadata.entityType === 'site_snapshot' ? node.id : view.id, kind: view.metadata.entityType === 'design_option' ? 'compares' : 'references', createdAt: canvas.edges.find((edge) => edge.id === `${generatedPrefix}${view.id}`)?.createdAt ?? timestamp }));
      const artifactId = `${node.id}-snapshot`;
      const source = plan.snapshot.source.kind === 'public_url' ? plan.snapshot.source.url : plan.snapshot.source.repository;
      const artifact: CanvasArtifact = { id: artifactId, kind: 'manual', title: 'Website source snapshot', body: plan.snapshot.notes, source, createdAt: canvas.artifacts.find((item) => item.id === artifactId)?.createdAt ?? timestamp, metadata: { entityType: 'site_snapshot', websiteProjectionOf: node.id, snapshot: plan.snapshot }, chunks: buildSourceChunks(artifactId, plan.snapshot.notes) };
      const snapshotView = projections.find((view) => view.metadata.entityType === 'site_snapshot')!;
      snapshotView.metadata.artifactId = artifactId; snapshotView.metadata.source = source;
      const saved = await this.saveCanvasFile({ ...canvas, updatedAt: timestamp, nodes: [...retained, node, ...projections], edges: [...canvas.edges.filter((edge) => !edge.id.startsWith(generatedPrefix)), ...projectedEdges], artifacts: [...canvas.artifacts.filter((item) => item.id !== artifactId), artifact] });
      return { canvas: saved, record: await this.getWebsitePlan(safeId) };
  }

  async selectWebsiteDirection(canvasId: string, optionId: string, expectedHash: string) {
    return this.withCanvasLock(canvasId, async (safeId) => {
      const canvas = await this.getCanvas(safeId);
      const record = websitePlanFromCanvas(canvas);
      if (!record || websitePlanHash(record.plan) !== expectedHash) throw new Error('Website plan changed in another client. Keep your draft and reload the saved version before merging.');
      const option = record.plan.options.find((item) => item.id === optionId);
      if (!option) throw new Error('Website direction was not found.');
      if (record.selection?.optionId === optionId && record.selection.planHash === expectedHash) {
        const existingRecord = await this.getWebsitePlan(safeId);
        if (existingRecord?.selectionVerified) return { canvas, record: existingRecord };
        // An explicit repeated choice can checkpoint the current verified plan
        // when imported or corrupt history made the previous assertion unusable.
      }
      const checkpoint = await this.writeCheckpoint(canvas, `Website direction: ${option.title}`.slice(0, 120));
      const selection: WebsiteSelection = { optionId, checkpointId: checkpoint.id, checkpointHash: checkpoint.contentHash, planHash: expectedHash, selectedAt: nowIso(), authority: 'user_assertion' };
      const saved = await this.saveCanvasFile({ ...canvas, updatedAt: selection.selectedAt, nodes: canvas.nodes.map((node) => node.id === record.nodeId ? { ...node, updatedAt: selection.selectedAt, metadata: { ...node.metadata, websiteSelection: selection } } : node.metadata.websiteProjectionOf === record.nodeId ? { ...node, updatedAt: selection.selectedAt, metadata: { ...node.metadata, websiteSelected: node.metadata.entityType === 'design_option' && node.metadata.entityId === optionId && !node.metadata.websiteProjectionRetired } } : node) });
      return { canvas: saved, record: await this.getWebsitePlan(safeId) };
    });
  }

  async exportWebsiteImplementation(canvasId: string): Promise<WebsiteImplementationPacket> {
    return this.withCanvasLock(canvasId, async (safeId) => {
      const record = websitePlanFromCanvas(await this.getCanvas(safeId));
      if (!record?.selection) throw new Error('Choose a saved website direction before exporting.');
      const checkpoint = await this.getCheckpoint(safeId, record.selection.checkpointId);
      const original = websitePlanFromCanvas(checkpoint.snapshot);
      if (!original || checkpoint.contentHash !== record.selection.checkpointHash || websitePlanHash(original.plan) !== record.selection.planHash || websitePlanHash(record.plan) !== record.selection.planHash) throw new Error('Selected website plan could not be verified. Save and select the current direction again.');
      const direction = original.plan.options.find((item) => item.id === record.selection!.optionId);
      if (!direction) throw new Error('Website direction was not found.');
      return { version: 'starlight.websiteImplementation.v1', canvasId: safeId, origin: original.plan.origin ?? 'unspecified', selected: record.selection, target: original.plan.target, source: original.plan.snapshot, brief: original.plan.brief, direction, sections: original.plan.sections, assets: original.plan.assets, gaps: websitePlanGaps(original.plan), boundary: 'Read-only proposal. Selection is a local user assertion, not release authorization. Verify target, provenance and gates before implementing.' };
    });
  }

  async getCheckpoint(canvasId: string, checkpointId: string): Promise<CanvasCheckpoint> {
    const safeCanvasId = canvasIdSchema.parse(canvasId);
    const safeCheckpointId = canvasIdSchema.parse(checkpointId);
    try {
      const raw = await readFile(this.checkpointPath(safeCanvasId, safeCheckpointId), 'utf8');
      return validateCheckpoint(JSON.parse(raw), safeCanvasId, safeCheckpointId);
    } catch (error) {
      const missing = (error as NodeJS.ErrnoException).code === 'ENOENT';
      throw new Error(missing ? 'Checkpoint was not found.' : 'Checkpoint could not be read or verified. The current canvas is unchanged.', { cause: error });
    }
  }

  async listCheckpoints(canvasId: string): Promise<{ checkpoints: CheckpointSummary[]; unreadable: Array<{ id: string; reason: string }> }> {
    const safeId = canvasIdSchema.parse(canvasId);
    await this.getCanvas(safeId);
    let files: string[];
    try {
      files = await readdir(path.dirname(this.checkpointPath(safeId, 'list')));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { checkpoints: [], unreadable: [] };
      throw error;
    }
    const summaries: CheckpointSummary[] = [];
    const unreadable: Array<{ id: string; reason: string }> = [];
    for (const file of files.filter((file) => file.endsWith('.json')).sort()) {
      const id = file.slice(0, -5);
      try {
        summaries.push(summarizeCheckpoint(await this.getCheckpoint(safeId, canvasIdSchema.parse(id))));
      } catch {
        unreadable.push({ id, reason: 'This checkpoint could not be read or verified. It remains on disk; the current canvas is unchanged.' });
      }
    }
    return { checkpoints: summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)), unreadable };
  }

  async compareCheckpoints(canvasId: string, beforeId: string, afterId?: string): Promise<CanvasComparison> {
    return this.withCanvasLock(canvasId, async (safeId) => {
      const before = await this.getCheckpoint(safeId, beforeId);
      const after = afterId ? await this.getCheckpoint(safeId, afterId)
        : { id: 'current', label: 'Current canvas', snapshot: await this.getCanvas(safeId) };
      return compareCanvasSnapshots(before, after);
    });
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
      if ((current.metadata.websiteProjectionOf || current.metadata.role === WEBSITE_ROLE) && (parsed.title !== undefined || parsed.body !== undefined || parsed.metadata !== undefined)) throw new Error('Edit website content in the website direction workbench. Graph positions remain editable.');
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
      if (current.metadata.websiteProjectionOf || current.metadata.role === WEBSITE_ROLE) throw new Error('Edit website content in the website direction workbench.');
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
