import { createHash } from 'node:crypto';
import { z } from 'zod';
import { CANVAS_SCHEMA_VERSION, canvasIdSchema, canvasRecordSchema, type CanvasRecord } from './schemas.js';

export const checkpointInputSchema = z.object({ label: z.string().trim().min(1).max(120) }).strict();
export const checkpointSchema = z.object({
  version: z.literal('starlight.agentCanvas.checkpoint.v1'),
  id: canvasIdSchema,
  canvasId: canvasIdSchema,
  label: z.string().min(1).max(120),
  createdAt: z.string().datetime(),
  canvasSchemaVersion: z.literal(CANVAS_SCHEMA_VERSION),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  snapshot: canvasRecordSchema,
});
export type CanvasCheckpoint = z.infer<typeof checkpointSchema>;
export type CheckpointSummary = Omit<CanvasCheckpoint, 'snapshot'> & {
  counts: { nodes: number; edges: number; artifacts: number; runs: number };
};

// Object key order must not change the identity of a portable snapshot.
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function canvasContentHash(canvas: CanvasRecord): string {
  return createHash('sha256').update(canonicalJson(canvas)).digest('hex');
}

export function validateCheckpoint(raw: unknown, canvasId: string, checkpointId: string): CanvasCheckpoint {
  const checkpoint = checkpointSchema.parse(raw);
  if (checkpoint.canvasId !== canvasId || checkpoint.snapshot.id !== canvasId || checkpoint.id !== checkpointId) {
    throw new Error('Checkpoint identity does not match the requested canvas and checkpoint.');
  }
  const storedHash = createHash('sha256').update(canonicalJson((raw as { snapshot: unknown }).snapshot)).digest('hex');
  if (storedHash !== checkpoint.contentHash) {
    throw new Error('Checkpoint content hash does not match its snapshot.');
  }
  return checkpoint;
}

/** A review projection, never a replacement for the exact stored snapshot. */
export function checkpointReviewView<T>(value: T): T {
  function project(item: unknown): unknown {
    if (typeof item === 'string') {
      if (item.startsWith('data:')) return `[Embedded media: ${Math.ceil(item.length / 1024)} KiB encoded; retained in the local snapshot]`;
      return item.length > 8_000 ? `${item.slice(0, 8_000)}\n[Review excerpt; full text retained in the local snapshot]` : item;
    }
    if (Array.isArray(item)) return item.map(project);
    if (item && typeof item === 'object') return Object.fromEntries(Object.entries(item).map(([key, child]) => [key, project(child)]));
    return item;
  }
  return project(value) as T;
}

export function summarizeCheckpoint(checkpoint: CanvasCheckpoint): CheckpointSummary {
  const { snapshot, ...summary } = checkpoint;
  return { ...summary, counts: {
    nodes: snapshot.nodes.length, edges: snapshot.edges.length,
    artifacts: snapshot.artifacts.length, runs: snapshot.runs.length,
  } };
}

type RecordValue = { id: string } & Record<string, unknown>;
export interface RecordChange {
  id: string;
  title: string;
  kind: 'added' | 'removed' | 'changed';
  fields: string[];
  positionOnly: boolean;
  before?: RecordValue;
  after?: RecordValue;
}
export interface CanvasComparison {
  canvasId: string;
  before: { id: string; label: string; contentHash: string };
  after: { id: string; label: string; contentHash: string };
  unchanged: boolean;
  canvasFields: string[];
  collections: Record<'nodes' | 'edges' | 'artifacts' | 'runs', RecordChange[]>;
}

function compareRecords(before: RecordValue[], after: RecordValue[]): RecordChange[] {
  const left = new Map(before.map((record) => [record.id, record]));
  const right = new Map(after.map((record) => [record.id, record]));
  if (left.size !== before.length || right.size !== after.length) {
    throw new Error('Cannot compare records with duplicate stable IDs.');
  }
  return [...new Set([...left.keys(), ...right.keys()])].sort().flatMap((id): RecordChange[] => {
    const previous = left.get(id);
    const next = right.get(id);
    const title = typeof (next ?? previous)?.title === 'string' ? String((next ?? previous)!.title) : id;
    if (!previous) return [{ id, title, kind: 'added', fields: [], positionOnly: false, after: next }];
    if (!next) return [{ id, title, kind: 'removed', fields: [], positionOnly: false, before: previous }];
    const fields = [...new Set([...Object.keys(previous), ...Object.keys(next)])].sort()
      .filter((field) => canonicalJson(previous[field]) !== canonicalJson(next[field]));
    if (!fields.length) return [];
    const meaningful = fields.filter((field) => field !== 'updatedAt');
    return [{ id, title, kind: 'changed', fields,
      positionOnly: meaningful.length === 1 && meaningful[0] === 'position', before: previous, after: next }];
  });
}

export function compareCanvasSnapshots(
  before: CanvasCheckpoint,
  after: { id: string; label: string; snapshot: CanvasRecord },
): CanvasComparison {
  if (before.canvasId !== after.snapshot.id) throw new Error('Comparison snapshots belong to different canvases.');
  const collections = {
    nodes: compareRecords(before.snapshot.nodes, after.snapshot.nodes),
    edges: compareRecords(before.snapshot.edges, after.snapshot.edges),
    artifacts: compareRecords(before.snapshot.artifacts, after.snapshot.artifacts),
    runs: compareRecords(before.snapshot.runs, after.snapshot.runs),
  };
  const omitted = new Set(['nodes', 'edges', 'artifacts', 'runs', 'updatedAt']);
  const canvasFields = [...new Set([...Object.keys(before.snapshot), ...Object.keys(after.snapshot)])].filter((field) => !omitted.has(field)).filter((field) =>
    canonicalJson(before.snapshot[field as keyof CanvasRecord]) !== canonicalJson(after.snapshot[field as keyof CanvasRecord]));
  return {
    canvasId: before.canvasId,
    before: { id: before.id, label: before.label, contentHash: before.contentHash },
    after: { id: after.id, label: after.label, contentHash: canvasContentHash(after.snapshot) },
    unchanged: !canvasFields.length && Object.values(collections).every((changes) => !changes.length),
    canvasFields, collections,
  };
}
