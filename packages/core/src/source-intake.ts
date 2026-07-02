import { detectIntakeText, type DetectedIntakeItem, type DetectedIntakePlan } from './intake.js';
import { ingestUrl, ingestYoutube, type IngestedSource } from './ingest.js';
import { makeId, nowIso } from './ids.js';
import { describeCanvasSourceReadiness, type SourceReadiness } from './readiness.js';
import {
  ingestSourceInputSchema,
  runActionInputSchema,
  type ActionRun,
  type CanvasActionType,
  type CanvasArtifact,
  type CanvasIntakeTrace,
  type CanvasNode,
  type CanvasRecord,
  type IngestSourceInput,
} from './schemas.js';
import type { FileCanvasStore } from './store.js';

const MAX_TEXT_CHARS = 120_000;
const INTAKE_POSITION_STEP = { x: 280, y: 190 };

export type SourceIntakeOrigin =
  | 'web_composer'
  | 'web_drop'
  | 'web_upload'
  | 'mcp_ingest_anything'
  | 'api_ingest_anything';

export interface MapSourceIntakeOptions {
  origin?: SourceIntakeOrigin | string;
  sourceLabel?: string;
  title?: string;
  position?: { x: number; y: number };
  fetchRemote?: boolean;
  useFirecrawl?: boolean;
  action?: CanvasActionType;
  prompt?: string;
}

export interface SourceIntakeMappingResult {
  canvasId: string;
  canvas: CanvasRecord;
  node?: CanvasNode;
  nodes: CanvasNode[];
  artifact?: CanvasArtifact;
  artifacts: CanvasArtifact[];
  detected: {
    itemCount: number;
    kinds: string[];
    urls: string[];
  };
  plan: DetectedIntakePlan;
  run?: ActionRun;
  outputNode?: CanvasNode;
  trace: CanvasIntakeTrace;
  sourceReadiness: SourceReadiness[];
}

export interface CreateIntakeTraceForNodesInput {
  canvas: CanvasRecord;
  nodes: CanvasNode[];
  artifacts?: CanvasArtifact[];
  origin?: SourceIntakeOrigin | string;
  sourceLabel: string;
  inputSummary?: string;
  inputChars?: number;
  detectedKinds?: string[];
  urls?: string[];
  run?: ActionRun;
  outputNode?: CanvasNode;
  prompt?: string;
}

function textTitle(value: string): string {
  const first = value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? 'Pasted source';
  return first.length > 80 ? `${first.slice(0, 77)}...` : first;
}

function limitText(value: string): string {
  return value.length > MAX_TEXT_CHARS ? `${value.slice(0, MAX_TEXT_CHARS)}\n\n[Truncated at ${MAX_TEXT_CHARS} characters.]` : value;
}

function hostTitle(value: string, fallback: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '') || fallback;
  } catch {
    return value.slice(0, 80) || fallback;
  }
}

function positionForIndex(position: { x: number; y: number } | undefined, index: number): { x: number; y: number } | undefined {
  if (!position) return undefined;
  return {
    x: position.x + (index % 3) * INTAKE_POSITION_STEP.x,
    y: position.y + Math.floor(index / 3) * INTAKE_POSITION_STEP.y,
  };
}

function fallbackSource(kind: 'source_url' | 'source_youtube', url: string, error: unknown): IngestedSource {
  const title = hostTitle(url, kind === 'source_youtube' ? 'YouTube source' : 'URL source');
  const message = (error as Error).message;
  return {
    title,
    body: kind === 'source_youtube'
      ? `YouTube transcript was not fetched from ${url}. The reference is still mapped so a human or agent can attach transcript text, notes, timestamps, or claims.\n\nFetch note: ${message}`
      : `Readable text was not fetched from ${url}. The link is still mapped as a source reference. Add notes, paste extracted text, or rerun ingestion later.\n\nFetch note: ${message}`,
    source: url,
    metadata: {
      url,
      ingest: kind === 'source_youtube' ? 'youtube_reference_fallback' : 'url_reference_fallback',
      error: message,
    },
  };
}

function videoReferenceSource(url: string, manualNotes = '', title?: string): IngestedSource {
  const notes = manualNotes.trim();
  return {
    title: title || `Video ${hostTitle(url, 'source')}`,
    body: notes || `Video transcript was not fetched from ${url}. The link is mapped as a video reference. Add a transcript, notes, timestamps, or claims to analyze it.`,
    source: url,
    metadata: {
      url,
      ingest: notes ? 'manual_video_notes' : 'video_reference',
      media: 'video_reference',
    },
  };
}

function imageReferenceSource(url: string, manualNotes = '', title?: string): IngestedSource {
  const notes = manualNotes.trim();
  return {
    title: title || `Image ${hostTitle(url, 'source')}`,
    body: notes || `Image reference mapped from ${url}. Add alt text, visual observations, OCR text, claims, or design notes so agents can reason over the image.`,
    source: url,
    metadata: {
      url,
      imageUrl: url,
      ingest: notes ? 'manual_image_notes' : 'image_reference',
      media: 'image_reference',
    },
  };
}

function ingestInputForItem(
  item: DetectedIntakeItem,
  source: IngestedSource | null,
  options: MapSourceIntakeOptions,
  itemCount: number,
  position: { x: number; y: number } | undefined,
  plan: DetectedIntakePlan,
): IngestSourceInput {
  const titleOverride = options.title && itemCount === 1 ? options.title : undefined;
  const origin = options.origin ?? 'api_ingest_anything';

  if (item.kind === 'text') {
    return ingestSourceInputSchema.parse({
      kind: 'note',
      title: titleOverride || textTitle(item.body),
      body: limitText(item.body),
      source: origin,
      artifactKind: 'manual',
      metadata: {
        ingest: plan.urls.length ? 'text_with_links' : 'manual_text',
        chars: item.body.length,
        detectedBy: origin,
      },
      position,
    });
  }

  if (!source) {
    throw new Error(`Missing source for ${item.kind} intake item.`);
  }

  const kind = item.kind === 'youtube'
    ? 'source_youtube'
    : item.kind === 'video'
      ? 'source_video'
      : item.kind === 'image'
        ? 'source_image'
        : 'source_url';

  const artifactKind = item.kind === 'video'
    ? 'video'
    : item.kind === 'image'
      ? 'image'
      : undefined;

  return ingestSourceInputSchema.parse({
    kind,
    title: titleOverride || item.title || source.title,
    body: source.body,
    source: source.source,
    artifactKind,
    metadata: {
      ...source.metadata,
      detectedBy: origin,
    },
    position,
  });
}

async function sourceForItem(item: DetectedIntakeItem, options: MapSourceIntakeOptions): Promise<IngestedSource | null> {
  if (item.kind === 'text') return null;
  if (!item.url) return null;
  const fetchRemote = options.fetchRemote !== false;

  if (item.kind === 'youtube') {
    return fetchRemote
      ? ingestYoutube(item.url, item.attachedText ?? item.body).catch((error) => fallbackSource('source_youtube', item.url!, error))
      : fallbackSource('source_youtube', item.url, new Error('Remote fetch disabled by request.'));
  }

  if (item.kind === 'video') {
    return videoReferenceSource(item.url, item.attachedText ?? item.body, options.title && options.title.length ? undefined : item.title);
  }

  if (item.kind === 'image') {
    return imageReferenceSource(item.url, item.attachedText ?? item.body, options.title && options.title.length ? undefined : item.title);
  }

  return fetchRemote
    ? ingestUrl(item.url, { useFirecrawl: options.useFirecrawl === true }).catch((error) => fallbackSource('source_url', item.url!, error))
    : fallbackSource('source_url', item.url, new Error('Remote fetch disabled by request.'));
}

function inputSummary(plan: DetectedIntakePlan): string {
  if (plan.urls.length) {
    const shown = plan.urls.slice(0, 3).map((url) => hostTitle(url, url)).join(', ');
    return plan.urls.length > 3 ? `${shown}, +${plan.urls.length - 3} more` : shown;
  }
  const oneLine = plan.raw.replace(/\s+/g, ' ').trim();
  return oneLine.length > 120 ? `${oneLine.slice(0, 117)}...` : oneLine;
}

function traceKindForNode(node: CanvasNode, artifact?: CanvasArtifact): CanvasIntakeTrace['items'][number]['kind'] {
  if (node.kind === 'source_youtube') return 'youtube';
  if (node.kind === 'source_video') return 'video';
  if (node.kind === 'source_image') return 'image';
  if (node.kind === 'source_url') return 'url';
  if (node.kind === 'source_pdf' || artifact?.kind === 'pdf') return 'pdf';
  if (node.kind === 'note') return 'text';
  return 'note';
}

export function createIntakeTraceForNodes(input: CreateIntakeTraceForNodesInput): {
  trace: CanvasIntakeTrace;
  sourceReadiness: SourceReadiness[];
} {
  const nodeIds = new Set(input.nodes.map((node) => node.id));
  const fallbackArtifacts = input.nodes
    .map((node) => (typeof node.metadata.artifactId === 'string'
      ? input.canvas.artifacts.find((artifact) => artifact.id === node.metadata.artifactId)
      : undefined))
    .filter((artifact): artifact is CanvasArtifact => Boolean(artifact));
  const artifacts = input.artifacts?.length ? input.artifacts : fallbackArtifacts;
  const artifactsById = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const sourceReadiness = describeCanvasSourceReadiness(input.canvas).filter((item) => nodeIds.has(item.nodeId));
  const readinessByNode = new Map(sourceReadiness.map((item) => [item.nodeId, item]));
  const origin = input.origin ?? 'api_ingest_anything';

  return {
    sourceReadiness,
    trace: {
      id: makeId('intake', `${input.sourceLabel}-${input.detectedKinds?.join('-') || 'source'}`),
      source: origin,
      sourceLabel: input.sourceLabel,
      status: input.run ? 'mapped_with_action' : 'mapped',
      inputSummary: input.inputSummary ?? input.nodes.map((node) => node.title).join(', '),
      inputChars: input.inputChars ?? input.nodes.reduce((total, node) => total + node.body.length, 0),
      detectedKinds: input.detectedKinds ?? Array.from(new Set(input.nodes.map((node) => traceKindForNode(node)))),
      urls: input.urls ?? [],
      nodeIds: input.nodes.map((node) => node.id),
      artifactIds: artifacts.map((artifact) => artifact.id),
      runId: input.run?.id,
      action: input.run?.action,
      outputNodeId: input.outputNode?.id,
      items: input.nodes.map((node) => {
        const artifact = typeof node.metadata.artifactId === 'string' ? artifactsById.get(node.metadata.artifactId) : undefined;
        const readiness = readinessByNode.get(node.id);
        return {
          kind: traceKindForNode(node, artifact),
          title: node.title,
          nodeId: node.id,
          artifactId: artifact?.id,
          artifactKind: artifact?.kind,
          readinessStatus: readiness?.status,
          readinessLabel: readiness?.label,
          source: readiness?.evidence.source,
        };
      }),
      createdAt: nowIso(),
      metadata: {
        prompt: input.prompt || undefined,
      },
    },
  };
}

function buildTrace(params: {
  plan: DetectedIntakePlan;
  options: MapSourceIntakeOptions;
  nodes: CanvasNode[];
  artifacts: CanvasArtifact[];
  sourceReadiness: SourceReadiness[];
  run?: ActionRun;
  outputNode?: CanvasNode;
}): CanvasIntakeTrace {
  const readinessByNode = new Map(params.sourceReadiness.map((item) => [item.nodeId, item]));
  const artifactsById = new Map(params.artifacts.map((artifact) => [artifact.id, artifact]));
  const origin = params.options.origin ?? 'api_ingest_anything';
  const sourceLabel = params.options.sourceLabel
    ?? (origin === 'web_drop' ? 'Dropped onto canvas' : origin === 'mcp_ingest_anything' ? 'MCP intake' : 'Composer intake');

  return {
    id: makeId('intake', `${sourceLabel}-${params.plan.items.map((item) => item.kind).join('-') || 'source'}`),
    source: origin,
    sourceLabel,
    status: params.run ? 'mapped_with_action' : 'mapped',
    inputSummary: inputSummary(params.plan),
    inputChars: params.plan.raw.length,
    detectedKinds: Array.from(new Set(params.plan.items.map((item) => item.kind))),
    urls: params.plan.urls,
    nodeIds: params.nodes.map((node) => node.id),
    artifactIds: params.artifacts.map((artifact) => artifact.id),
    runId: params.run?.id,
    action: params.run?.action,
    outputNodeId: params.outputNode?.id,
    items: params.nodes.map((node) => {
      const readiness = readinessByNode.get(node.id);
      const artifact = typeof node.metadata.artifactId === 'string' ? artifactsById.get(node.metadata.artifactId) : undefined;
      return {
        kind: traceKindForNode(node, artifact),
        title: node.title,
        nodeId: node.id,
        artifactId: artifact?.id,
        artifactKind: artifact?.kind,
        readinessStatus: readiness?.status,
        readinessLabel: readiness?.label,
        source: readiness?.evidence.source,
      };
    }),
    createdAt: nowIso(),
    metadata: {
      prompt: params.options.prompt || undefined,
      fetchRemote: params.options.fetchRemote !== false,
    },
  };
}

export async function mapSourceIntakeToCanvas(
  store: FileCanvasStore,
  canvasId: string,
  rawInput: string,
  options: MapSourceIntakeOptions = {},
): Promise<SourceIntakeMappingResult> {
  const plan = detectIntakeText(rawInput);
  if (!plan.items.length) {
    throw new Error('ingest_anything requires non-empty content.');
  }

  const nodes: CanvasNode[] = [];
  const artifacts: CanvasArtifact[] = [];
  let latestCanvas: CanvasRecord | null = null;

  for (const [index, item] of plan.items.entries()) {
    const source = await sourceForItem(item, options);
    const result = await store.ingestSource(canvasId, ingestInputForItem(
      item,
      source,
      options,
      plan.items.length,
      positionForIndex(options.position, index),
      plan,
    ));
    nodes.push(result.node);
    artifacts.push(result.artifact);
    latestCanvas = result.canvas;
  }

  let run: ActionRun | undefined;
  let outputNode: CanvasNode | undefined;
  if (options.action && nodes.length) {
    const actionResult = await store.runAction(canvasId, runActionInputSchema.parse({
      action: options.action,
      inputNodeIds: nodes.map((node) => node.id),
      prompt: options.prompt ?? '',
    }));
    latestCanvas = actionResult.canvas;
    run = actionResult.run;
    outputNode = actionResult.outputNode;
  }

  if (!latestCanvas) {
    latestCanvas = await store.getCanvas(canvasId);
  }

  const nodeIds = new Set(nodes.map((node) => node.id));
  const sourceReadiness = describeCanvasSourceReadiness(latestCanvas).filter((item) => nodeIds.has(item.nodeId));
  const trace = buildTrace({ plan, options, nodes, artifacts, sourceReadiness, run, outputNode });
  const canvasWithTrace = await store.appendIntakeTrace(canvasId, trace);

  return {
    canvasId,
    canvas: canvasWithTrace,
    node: nodes[nodes.length - 1],
    nodes,
    artifact: artifacts[artifacts.length - 1],
    artifacts,
    detected: {
      itemCount: plan.items.length,
      kinds: plan.items.map((item) => item.kind),
      urls: plan.urls,
    },
    plan,
    run,
    outputNode,
    trace,
    sourceReadiness,
  };
}
