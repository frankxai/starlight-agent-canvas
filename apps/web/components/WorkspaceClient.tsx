'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Bot,
  Boxes,
  Braces,
  CheckCircle2,
  ClipboardPaste,
  Copy,
  Crosshair,
  Download,
  Film,
  FileText,
  FileUp,
  GitBranch,
  Image as ImageIcon,
  LayoutTemplate,
  Link,
  Loader2,
  MessageSquarePlus,
  MousePointerClick,
  Network,
  Play,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  UploadCloud,
  TriangleAlert,
} from 'lucide-react';
import { describeCanvasExportScope } from '@starlight-agent-canvas/core/exporters';
import { detectIntakeText } from '@starlight-agent-canvas/core/intake';
import { describeSourceReadiness, type SourceReadiness, type SourceReadinessStatus } from '@starlight-agent-canvas/core/readiness';
import type { CanvasActionType, CanvasArtifact, CanvasEdge, CanvasEdgeKind, CanvasIntakeTrace, CanvasNode, CanvasNodeKind, CanvasRecord, SourceCitation, SourceEnrichmentKind } from '@starlight-agent-canvas/core';

type CanvasSummary = {
  id: string;
  title: string;
  description: string;
  updatedAt: string;
  nodeCount: number;
  runCount: number;
};

type TemplateSummary = {
  id: string;
  title: string;
  description: string;
  bestFor?: string;
  outcome?: string;
  steps?: string[];
};

type ApiState = {
  canvases: CanvasSummary[];
  templates: TemplateSummary[];
  home: string;
};

type CanvasMutationResponse = {
  canvas?: CanvasRecord;
  node?: CanvasNode;
  artifact?: CanvasArtifact;
  trace?: CanvasIntakeTrace;
  sourceReadiness?: SourceReadiness[];
  outputNode?: CanvasNode;
};

type IntakeAnythingResponse = CanvasMutationResponse & {
  nodes?: CanvasNode[];
  artifacts?: CanvasArtifact[];
  trace?: CanvasIntakeTrace;
  sourceReadiness?: SourceReadiness[];
  detected?: {
    itemCount: number;
    kinds: string[];
    urls: string[];
  };
};

type ImportCanvasResponse = {
  canvas: CanvasRecord;
  import?: {
    conflict: 'none' | 'copy';
    sourceId: string;
    sourceTitle: string;
    importedId: string;
    importedTitle: string;
  };
};

type ImportPreview = {
  fileName: string;
  raw: string;
  canvas: CanvasRecord;
  conflict: CanvasSummary | null;
  kindCounts: Array<{ kind: string; count: number }>;
  nodePreview: Array<{ id: string; kind: string; title: string }>;
};

type ClipboardFallback = {
  mode: ComposerMode;
  message: string;
};

type IntakeReceipt = {
  sourceLabel: string;
  nodeIds: string[];
  artifactKinds: string[];
  outputNodeId?: string;
  action?: CanvasActionType;
  items: Array<{
    id: string;
    title: string;
    kind: CanvasNodeKind;
  }>;
};

type AgentNodeData = {
  title: string;
  kind: CanvasNodeKind;
  body: string;
  metadata: Record<string, unknown>;
};

type FlowPosition = { x: number; y: number };

type SearchResult = {
  canvasId: string;
  nodeId: string;
  title: string;
  kind: string;
  excerpt: string;
  artifactId?: string;
  chunkId?: string;
  chunkIndex?: number;
  source?: string;
  score?: number;
};

type SetupStatus = {
  repoRoot: string;
  canvasHome: string;
  homeMode: 'custom' | 'default';
  mcp: {
    built: boolean;
    mediaReady: boolean;
    cliPath: string;
    smokeCommand: string;
    buildCommand: string;
  };
  codex: {
    configPath: string;
    configExists: boolean;
    serverBlockExists: boolean;
    envBlockExists: boolean;
    serverConfigured: boolean;
    serverPathMatches: boolean;
    homeMatches: boolean;
    configuredCliPath: string;
    configuredHome: string;
    installDryRunCommand: string;
    installWriteCommand: string;
    smokeCommand: string;
  };
  setup: {
    localCommand: string;
    verifyCommand: string;
    docs: string[];
  };
  adoption: {
    reportCommand: string;
    jsonCommand: string;
    docs: string[];
  };
  firstSuccess: {
    schemaVersion: string;
    contractCommand: string;
    jsonCommand: string;
    docs: string[];
    proofCommands: string[];
    phases: Array<{
      id: string;
      label: string;
      detail: string;
    }>;
    inputContracts: Array<{
      id: string;
      label: string;
      input: string;
      outputLabel: string;
      output: string;
      detail: string;
      nodeKind: string;
      artifactKind: string;
      codexUse: string;
      status: string;
    }>;
  };
  agent: {
    prompt: string;
    terminalHandoffCommand: string;
    tools: Array<{
      name: string;
      detail: string;
    }>;
  };
  activation: {
    firstRunCheckCommand: string;
    previewCommand: string;
    codexPrompt: string;
    steps: ActivationStep[];
  };
};

type ActivationStep = {
  id: 'install' | 'proof' | 'context' | 'handoff' | 'codex';
  label: string;
  detail: string;
  command?: string;
  action?: 'load_demo' | 'focus_intake' | 'copy_context';
};

type IntakePlanItem = {
  id: 'youtube' | 'video' | 'image' | 'url' | 'text' | 'pdf' | 'file';
  label: string;
  detail: string;
  active: boolean;
};

type IntakeMapPreviewItem = {
  id: string;
  kind: 'youtube' | 'video' | 'image' | 'url' | 'text';
  title: string;
  nodeKind: string;
  artifactKind: string;
  readiness: string;
  nextAction: string;
  source?: string;
};

type IntakeActionMode = 'map' | 'summarize' | 'claims' | 'ask';
type ComposerMode = 'source' | 'note' | 'ask';
type QuickStarterId = 'video' | 'image' | 'web' | 'note' | 'ask';

type WorkflowMapStep = {
  label: string;
  order: number;
  detail: string;
  node?: CanvasNode;
};

type OperatorLoopStepId = 'capture' | 'map' | 'inspect' | 'ask' | 'handoff';

type OperatorLoopStep = {
  id: OperatorLoopStepId;
  label: string;
  detail: string;
  ok: boolean;
  enabled: boolean;
  actionLabel: string;
};

const INTAKE_ACTIONS: Array<{ id: IntakeActionMode; label: string; detail: string }> = [
  { id: 'summarize', label: 'Brief', detail: 'summary output' },
  { id: 'claims', label: 'Claims', detail: 'extract claims' },
  { id: 'ask', label: 'Ask', detail: 'answer with citations' },
  { id: 'map', label: 'Map only', detail: 'source nodes' },
];

const COMPOSER_MODES: Array<{ id: ComposerMode; label: string; detail: string }> = [
  { id: 'source', label: 'Source', detail: 'links, transcripts, files' },
  { id: 'note', label: 'Note', detail: 'human thoughts' },
  { id: 'ask', label: 'Ask', detail: 'canvas question' },
];

const QUICK_STARTERS: Array<{ id: QuickStarterId; label: string; detail: string }> = [
  { id: 'video', label: 'Video', detail: 'YouTube, Loom, Vimeo' },
  { id: 'image', label: 'Image', detail: 'screenshots and visuals' },
  { id: 'web', label: 'Web', detail: 'articles and docs' },
  { id: 'note', label: 'Note', detail: 'your synthesis' },
  { id: 'ask', label: 'Ask', detail: 'query canvas' },
];

const CONTEXT_LOOP_STEPS = [
  { label: 'Drop', detail: 'link, file, note' },
  { label: 'Map', detail: 'typed nodes' },
  { label: 'Ask', detail: 'cited output' },
  { label: 'Handoff', detail: 'MCP context' },
];

const KIND_STYLE: Record<CanvasNodeKind, { label: string; accent: string; bg: string }> = {
  note: { label: 'Note', accent: '#F5C36A', bg: 'rgba(245,195,106,0.08)' },
  source_url: { label: 'URL', accent: '#79E6C5', bg: 'rgba(121,230,197,0.08)' },
  source_pdf: { label: 'PDF', accent: '#F1F3F9', bg: 'rgba(241,243,249,0.07)' },
  source_youtube: { label: 'Video', accent: '#F97066', bg: 'rgba(249,112,102,0.08)' },
  source_video: { label: 'Video', accent: '#F97066', bg: 'rgba(249,112,102,0.08)' },
  source_image: { label: 'Image', accent: '#A78BFA', bg: 'rgba(167,139,250,0.08)' },
  prompt: { label: 'Prompt', accent: '#A78BFA', bg: 'rgba(167,139,250,0.08)' },
  mcp_tool: { label: 'MCP', accent: '#6EA8FE', bg: 'rgba(110,168,254,0.08)' },
  agent_run: { label: 'Run', accent: '#79E6C5', bg: 'rgba(121,230,197,0.08)' },
  output: { label: 'Output', accent: '#6EA8FE', bg: 'rgba(110,168,254,0.1)' },
};

const ACTIONS: Array<{ id: CanvasActionType; label: string }> = [
  { id: 'summarize', label: 'Summarize' },
  { id: 'extract_claims', label: 'Claims' },
  { id: 'compare_sources', label: 'Compare' },
  { id: 'decision_matrix', label: 'Matrix' },
  { id: 'implementation_brief', label: 'Build Brief' },
  { id: 'answer_question', label: 'Ask' },
];

const EDGE_KINDS: Array<{ id: CanvasEdgeKind; label: string }> = [
  { id: 'references', label: 'References' },
  { id: 'derives_from', label: 'Derives' },
  { id: 'compares', label: 'Compares' },
  { id: 'runs', label: 'Runs' },
  { id: 'exports', label: 'Exports' },
];

const ENRICHMENT_KINDS: Array<{ id: SourceEnrichmentKind; label: string; detail: string }> = [
  { id: 'transcript', label: 'Transcript', detail: 'captions or full video text' },
  { id: 'timestamp_notes', label: 'Timestamps', detail: 'time-coded notes' },
  { id: 'ocr', label: 'OCR', detail: 'visible text' },
  { id: 'visual_notes', label: 'Visual notes', detail: 'observations or design notes' },
  { id: 'claims', label: 'Claims', detail: 'facts and assertions' },
  { id: 'notes', label: 'Notes', detail: 'human context' },
];

function offsetPosition(position: FlowPosition | undefined, index: number): FlowPosition | undefined {
  if (!position) return undefined;
  return {
    x: position.x + (index % 2) * 280,
    y: position.y + Math.floor(index / 2) * 180,
  };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

function AgentNode({ id, data, selected }: NodeProps<Node<AgentNodeData>>) {
  const style = KIND_STYLE[data.kind];
  const source = typeof data.metadata.url === 'string'
    ? data.metadata.url
    : typeof data.metadata.source === 'string'
      ? data.metadata.source
      : undefined;
  const imageSrc = imageSourceFromMetadata(data.metadata);
  return (
    <div
      data-testid={`graph-node-${id}`}
      className={`w-[260px] rounded-lg border bg-starlight-surface/95 shadow-command backdrop-blur transition ${
        selected ? 'ring-2 ring-starlight-accent/70' : ''
      }`}
      style={{ borderColor: `${style.accent}66`, background: `linear-gradient(180deg, ${style.bg}, rgba(10,12,20,0.95))` }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-0" style={{ background: style.accent }} />
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="rounded-md border px-2 py-0.5 text-[11px] text-starlight-ink" style={{ borderColor: `${style.accent}66`, color: style.accent }}>
          {style.label}
        </span>
        <span className="text-[11px] text-starlight-muted">{data.body.length} chars</span>
      </div>
      <div className="space-y-2 px-3 py-3">
        <h3 className="line-clamp-2 text-sm font-semibold text-starlight-ink">{data.title}</h3>
        {imageSrc ? (
          <img
            src={imageSrc}
            alt=""
            className="h-28 w-full rounded-md border border-white/10 object-cover"
            loading="lazy"
          />
        ) : null}
        <p className="line-clamp-4 text-xs leading-5 text-starlight-muted">{data.body || 'No body yet.'}</p>
        {source ? <p className="truncate text-[11px] text-starlight-mint">{source}</p> : null}
      </div>
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-0" style={{ background: style.accent }} />
    </div>
  );
}

const nodeTypes = { agentNode: AgentNode };

function toFlow(canvas: CanvasRecord, compact = false): { nodes: Node<AgentNodeData>[]; edges: Edge[] } {
  return {
    nodes: canvas.nodes.map((node, index) => ({
      id: node.id,
      type: 'agentNode',
      position: compact
        ? { x: 48 + (index % 2) * 330, y: 300 + Math.floor(index / 2) * 220 }
        : node.position,
      data: {
        title: node.title,
        kind: node.kind,
        body: node.body,
        metadata: node.metadata,
      },
    })),
    edges: canvas.edges.map((edge: CanvasEdge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      animated: edge.kind === 'runs' || edge.kind === 'derives_from',
      label: edge.kind,
      style: { stroke: '#6EA8FE88', strokeWidth: edge.kind === 'derives_from' ? 1.8 : 1.2 },
      labelStyle: { fill: '#8A90A8', fontSize: 10 },
    })),
  };
}

function formatKind(kind: string) {
  return kind.replace(/_/g, ' ');
}

function defaultEnrichmentKind(node?: CanvasNode | null): SourceEnrichmentKind {
  if (node?.kind === 'source_youtube' || node?.kind === 'source_video') return 'transcript';
  if (node?.kind === 'source_image') return 'visual_notes';
  return 'notes';
}

function enrichmentPlaceholder(kind: SourceEnrichmentKind, node?: CanvasNode | null): string {
  if (kind === 'transcript') return 'Paste transcript, captions, cleaned video notes, or a timestamped summary.';
  if (kind === 'timestamp_notes') return 'Example: 00:42 shows the workflow; 02:10 names a product gap; 04:30 gives the decision.';
  if (kind === 'ocr') return 'Paste OCR text or visible UI copy from the screenshot/image.';
  if (kind === 'visual_notes') return 'Describe what is visible, what matters, and what an agent should notice.';
  if (kind === 'claims') return 'List claims, facts, contradictions, evidence, or open questions.';
  if (node?.kind === 'source_url') return 'Paste extracted article text, notes, or claims from this link.';
  return 'Add notes, excerpts, decisions, constraints, or context that should travel with this source.';
}

function enrichmentStatusLabel(kind: SourceEnrichmentKind): string {
  if (kind === 'transcript') return 'transcript';
  if (kind === 'timestamp_notes') return 'timestamp notes';
  if (kind === 'ocr') return 'OCR text';
  if (kind === 'visual_notes') return 'visual notes';
  if (kind === 'claims') return 'claims';
  return 'notes';
}

function sourceReadinessTone(status: SourceReadinessStatus) {
  if (status === 'ready') {
    return {
      panel: 'border-starlight-mint/35 bg-starlight-mint/10',
      badge: 'border-starlight-mint/40 bg-starlight-mint/10 text-starlight-mint',
      icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
    };
  }
  if (status === 'needs_context') {
    return {
      panel: 'border-starlight-gold/35 bg-starlight-gold/10',
      badge: 'border-starlight-gold/40 bg-starlight-gold/10 text-starlight-ink',
      icon: <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" />,
    };
  }
  return {
    panel: 'border-starlight-border bg-starlight-bg/90',
    badge: 'border-starlight-border bg-starlight-surface text-starlight-muted',
    icon: <Link className="h-3.5 w-3.5" aria-hidden="true" />,
  };
}

function shortPath(value: string, max = 48): string {
  if (value.length <= max) return value;
  return `...${value.slice(-(max - 3))}`;
}

function metadataCitations(metadata: Record<string, unknown>): SourceCitation[] {
  const raw = metadata.citations;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is SourceCitation =>
    Boolean(item)
      && typeof item === 'object'
      && typeof (item as SourceCitation).id === 'string'
      && typeof (item as SourceCitation).nodeId === 'string'
      && typeof (item as SourceCitation).nodeTitle === 'string'
      && typeof (item as SourceCitation).quote === 'string'
  );
}

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function artifactsForNodes(canvas: CanvasRecord | null | undefined, nodes: CanvasNode[]): CanvasArtifact[] {
  if (!canvas) return [];
  const artifactIds = new Set(nodes.map((node) => metadataString(node.metadata, 'artifactId')).filter((id): id is string => Boolean(id)));
  return canvas.artifacts.filter((artifact) => artifactIds.has(artifact.id));
}

function createIntakeReceipt(
  sourceLabel: string,
  nodes: CanvasNode[],
  artifacts: CanvasArtifact[],
  outputNode?: CanvasNode,
  action?: CanvasActionType,
): IntakeReceipt | null {
  if (!nodes.length && !outputNode) return null;
  const sourceNodes = nodes.filter((node) => node.id !== outputNode?.id);
  return {
    sourceLabel,
    nodeIds: sourceNodes.map((node) => node.id),
    artifactKinds: Array.from(new Set(artifacts.map((artifact) => artifact.kind))).sort(),
    outputNodeId: outputNode?.id,
    action,
    items: sourceNodes.slice(0, 5).map((node) => ({
      id: node.id,
      title: node.title,
      kind: node.kind,
    })),
  };
}

function intakeTraceExportIds(trace: CanvasIntakeTrace): string[] {
  return [...trace.nodeIds, trace.outputNodeId].filter((id): id is string => Boolean(id));
}

function intakeTraceReadyCount(trace: CanvasIntakeTrace): number {
  return trace.items.filter((item) => item.readinessStatus === 'ready').length;
}

function metadataNumber(metadata: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = metadata?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sourceForNode(node: CanvasNode, artifact?: CanvasArtifact | null): string | undefined {
  return artifact?.source
    ?? metadataString(node.metadata, 'source')
    ?? metadataString(node.metadata, 'url')
    ?? metadataString(artifact?.metadata, 'url');
}

function selectedContextPacket(node: CanvasNode, artifact?: CanvasArtifact | null): string {
  const source = sourceForNode(node, artifact);
  const chunks = artifact?.chunks ?? [];
  const lines = [
    '# Selected Agent Canvas Context',
    '',
    `Node: ${node.title}`,
    `Kind: ${formatKind(node.kind)}`,
    source ? `Source: ${source}` : undefined,
    artifact ? `Artifact: ${artifact.title} (${artifact.kind})` : undefined,
    `Chars: ${(artifact?.body ?? node.body).length}`,
    chunks.length ? `Chunks: ${chunks.length}` : undefined,
    '',
    '## Body',
    artifact?.body || node.body || 'No body text available.',
  ].filter((line): line is string => Boolean(line));
  if (chunks.length) {
    lines.push('', '## Chunks');
    chunks.slice(0, 8).forEach((chunk) => {
      lines.push(`- ${chunk.id}: ${chunk.text.slice(0, 360)}`);
    });
  }
  return lines.join('\n');
}

const IMAGE_FILE_PATTERN = /\.(png|jpe?g|webp|gif|avif)(\?.*)?$/i;
const SOURCE_FILE_ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,image/gif,image/avif,text/*,.txt,.md,.markdown,.json,.csv,.log';
const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
]);
function isSupportedImageFile(file: File): boolean {
  return SUPPORTED_IMAGE_MIME_TYPES.has(file.type) || IMAGE_FILE_PATTERN.test(file.name);
}

function imageSourceFromMetadata(metadata: Record<string, unknown> | undefined): string | undefined {
  const dataUrl = metadataString(metadata, 'imageDataUrl');
  const imageUrl = metadataString(metadata, 'imageUrl');
  return dataUrl ?? imageUrl;
}

function buildIntakePlan(value: string): IntakePlanItem[] {
  const text = value.trim();
  if (!text) {
    return [
      { id: 'youtube', label: 'YouTube', detail: 'captions or transcript', active: false },
      { id: 'video', label: 'Video link', detail: 'reference plus notes', active: false },
      { id: 'image', label: 'Image', detail: 'screenshot or visual', active: false },
      { id: 'url', label: 'URL', detail: 'readable text', active: false },
      { id: 'pdf', label: 'PDF', detail: 'file upload', active: false },
      { id: 'text', label: 'Notes', detail: 'source text', active: false },
    ];
  }

  const detected = detectIntakeText(text);
  const youtubeItems = detected.items.filter((item) => item.kind === 'youtube');
  const videoItems = detected.items.filter((item) => item.kind === 'video');
  const imageItems = detected.items.filter((item) => item.kind === 'image');
  const webItems = detected.items.filter((item) => item.kind === 'url');
  const textItem = detected.items.find((item) => item.kind === 'text');
  const attachedText = detected.items.some((item) => item.attachedText && item.attachedText.length > 24);
  const plan: IntakePlanItem[] = [];

  if (youtubeItems.length) {
    plan.push({
      id: 'youtube',
      label: youtubeItems.length === 1 ? 'Video source' : `${youtubeItems.length} video sources`,
      detail: attachedText ? 'manual transcript attached' : 'captions first',
      active: true,
    });
  }

  if (videoItems.length) {
    plan.push({
      id: 'video',
      label: videoItems.length === 1 ? 'Video link' : `${videoItems.length} video links`,
      detail: attachedText ? 'manual notes attached' : 'reference plus notes',
      active: true,
    });
  }

  if (imageItems.length) {
    plan.push({
      id: 'image',
      label: imageItems.length === 1 ? 'Image source' : `${imageItems.length} image sources`,
      detail: attachedText ? 'visual notes attached' : 'reference plus notes',
      active: true,
    });
  }

  if (webItems.length) {
    plan.push({
      id: 'url',
      label: webItems.length === 1 ? 'Web source' : `${webItems.length} web sources`,
      detail: 'fetch readable text',
      active: true,
    });
  }

  if (textItem) {
    plan.push({
      id: 'text',
      label: detected.urls.length ? 'Source notes' : 'Text source',
      detail: `${textItem.body.length} chars`,
      active: true,
    });
  }

  return plan.length ? plan : [{ id: 'url', label: `${detected.urls.length} source link${detected.urls.length === 1 ? '' : 's'}`, detail: 'reference node', active: true }];
}

function intakeMapPreviewFor(value: string): IntakeMapPreviewItem[] {
  const detected = detectIntakeText(value);
  return detected.items.map((item, index) => {
    const hasAttachedText = Boolean(item.attachedText?.trim() || item.body.trim());
    if (item.kind === 'youtube') {
      return {
        id: `${item.kind}-${index}`,
        kind: item.kind,
        title: item.title,
        nodeKind: 'source_youtube',
        artifactKind: 'youtube',
        readiness: hasAttachedText ? 'Codex-ready transcript' : 'Transcript-first, then context gap if captions are unavailable',
        nextAction: hasAttachedText ? 'Run Brief, Claims, Ask, or export to Codex' : 'Attach transcript, timestamps, or claims if fetch cannot supply captions',
        source: item.url,
      };
    }
    if (item.kind === 'video') {
      return {
        id: `${item.kind}-${index}`,
        kind: item.kind,
        title: item.title,
        nodeKind: 'source_video',
        artifactKind: 'video',
        readiness: hasAttachedText ? 'Codex-ready video notes' : 'Video reference saved',
        nextAction: hasAttachedText ? 'Ask selected or build a cited brief' : 'Attach transcript, timestamp notes, or takeaways',
        source: item.url,
      };
    }
    if (item.kind === 'image') {
      return {
        id: `${item.kind}-${index}`,
        kind: item.kind,
        title: item.title,
        nodeKind: 'source_image',
        artifactKind: 'image',
        readiness: hasAttachedText ? 'Codex-ready visual notes' : 'Needs OCR or visual notes',
        nextAction: hasAttachedText ? 'Ask selected or extract claims from the visual notes' : 'Attach OCR, alt text, observations, or claims',
        source: item.url,
      };
    }
    if (item.kind === 'url') {
      return {
        id: `${item.kind}-${index}`,
        kind: item.kind,
        title: item.title,
        nodeKind: 'source_url',
        artifactKind: 'url',
        readiness: 'Fetch readable text, fallback to URL reference',
        nextAction: 'Run Brief when chunks exist, or attach notes if the page blocks fetch',
        source: item.url,
      };
    }
    return {
      id: `${item.kind}-${index}`,
      kind: item.kind,
      title: item.title,
      nodeKind: 'note',
      artifactKind: 'manual',
      readiness: 'Codex-ready note',
      nextAction: 'Use as human context, connect it to sources, or include it in handoff',
    };
  });
}

function actionPreviewFor(mode: IntakeActionMode): { label: string; detail: string } {
  if (mode === 'summarize') {
    return { label: 'output', detail: 'adds a linked summary node after mapping' };
  }
  if (mode === 'claims') {
    return { label: 'output', detail: 'adds extracted claims linked to the mapped context' };
  }
  if (mode === 'ask') {
    return { label: 'output', detail: 'asks a cited question over only the newly mapped nodes' };
  }
  return { label: 'none', detail: 'maps raw nodes only, ready for later actions' };
}

function intakePlanIcon(id: IntakePlanItem['id']) {
  if (id === 'youtube') return <Play className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'video') return <Film className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'image') return <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'url') return <Link className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'pdf' || id === 'file') return <FileText className="h-3.5 w-3.5" aria-hidden="true" />;
  return <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />;
}

function quickStarterIcon(id: QuickStarterId) {
  if (id === 'video') return <Film className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'image') return <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'web') return <Link className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'ask') return <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />;
  return <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />;
}

function inputContractIcon(id: string) {
  if (id === 'youtube') return <Play className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'video') return <Film className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'image') return <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'web') return <Link className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'pdf') return <FileText className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'text') return <Braces className="h-3.5 w-3.5" aria-hidden="true" />;
  return <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />;
}

function intakeActionIcon(id: IntakeActionMode) {
  if (id === 'summarize') return <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'claims') return <Braces className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'ask') return <Search className="h-3.5 w-3.5" aria-hidden="true" />;
  return <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />;
}

function intakeButtonLabel(mode: IntakeActionMode): string {
  if (mode === 'summarize') return 'Map + Brief';
  if (mode === 'claims') return 'Map + Claims';
  if (mode === 'ask') return 'Map + Ask';
  return 'Map';
}

function composerModeIcon(mode: ComposerMode) {
  if (mode === 'note') return <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />;
  if (mode === 'ask') return <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />;
  return <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />;
}

function composerPlaceholder(mode: ComposerMode): string {
  if (mode === 'note') return 'Write a note, claim, question, or synthesis fragment';
  if (mode === 'ask') return 'Ask across selected nodes or the whole canvas';
  return 'Paste YouTube, any video URL, image, file notes, transcript, or raw idea';
}

function composerButtonLabel(mode: ComposerMode, actionMode: IntakeActionMode): string {
  if (mode === 'note') return 'Add Note';
  if (mode === 'ask') return 'Ask Canvas';
  return intakeButtonLabel(actionMode);
}

function clipboardButtonLabel(mode: ComposerMode): string {
  if (mode === 'note') return 'Paste Note';
  if (mode === 'ask') return 'Ask Clipboard';
  return 'Paste & Map';
}

function composerPrimaryIcon(mode: ComposerMode, actionMode: IntakeActionMode) {
  if (mode === 'note') return <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />;
  if (mode === 'ask') return <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />;
  return intakeActionIcon(actionMode);
}

function intakeActionInput(mode: IntakeActionMode): { action?: CanvasActionType; prompt?: string } {
  if (mode === 'summarize') return { action: 'summarize' };
  if (mode === 'claims') return { action: 'extract_claims' };
  if (mode === 'ask') {
    return {
      action: 'answer_question',
      prompt: 'Using only the newly mapped source context, extract the most useful takeaways, contradictions, gaps, and next actions. Cite chunks when available.',
    };
  }
  return {};
}

function hostTitle(value: string): string {
  try {
    return new URL(value).hostname.replace(/^www\./, '');
  } catch {
    return 'Source URL';
  }
}

function textTitle(value: string): string {
  const first = value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? 'Pasted source';
  return first.length > 72 ? `${first.slice(0, 69)}...` : first;
}

function parseImportCandidate(raw: string): CanvasRecord {
  const payload = JSON.parse(raw) as { canvas?: unknown } | unknown;
  const candidate = typeof payload === 'object' && payload !== null && 'canvas' in payload
    ? (payload as { canvas: unknown }).canvas
    : payload;
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Canvas import JSON must contain a canvas object.');
  }
  const canvas = candidate as Partial<CanvasRecord>;
  if (
    typeof canvas.id !== 'string'
    || typeof canvas.title !== 'string'
    || !Array.isArray(canvas.nodes)
    || !Array.isArray(canvas.edges)
    || !Array.isArray(canvas.artifacts)
    || !Array.isArray(canvas.runs)
  ) {
    throw new Error('Canvas import JSON is missing required canvas fields.');
  }
  return canvas as CanvasRecord;
}

function buildImportPreview(fileName: string, raw: string, summaries: CanvasSummary[]): ImportPreview {
  const canvas = parseImportCandidate(raw);
  const kindMap = new Map<string, number>();
  canvas.nodes.forEach((node) => {
    kindMap.set(node.kind, (kindMap.get(node.kind) ?? 0) + 1);
  });
  return {
    fileName,
    raw,
    canvas,
    conflict: summaries.find((summary) => summary.id === canvas.id) ?? null,
    kindCounts: Array.from(kindMap.entries())
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count || a.kind.localeCompare(b.kind)),
    nodePreview: canvas.nodes.slice(0, 5).map((node) => ({
      id: node.id,
      kind: node.kind,
      title: node.title,
    })),
  };
}

function useCompactCanvas() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 767px)');
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return compact;
}

export default function WorkspaceClient() {
  return (
    <ReactFlowProvider>
      <WorkspaceInner />
    </ReactFlowProvider>
  );
}

function WorkspaceInner() {
  const { fitView, screenToFlowPosition, setCenter } = useReactFlow<Node<AgentNodeData>, Edge>();
  const [apiState, setApiState] = useState<ApiState>({ canvases: [], templates: [], home: '' });
  const [canvas, setCanvas] = useState<CanvasRecord | null>(null);
  const [flowNodes, setFlowNodes] = useState<Node<AgentNodeData>[]>([]);
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [edgeKind, setEdgeKind] = useState<CanvasEdgeKind>('references');
  const [busy, setBusy] = useState(true);
  const [status, setStatus] = useState('Booting local canvas...');
  const [dragActive, setDragActive] = useState(false);
  const [noteTitle, setNoteTitle] = useState('Research note');
  const [noteBody, setNoteBody] = useState('What matters, why it matters, and what to do next.');
  const [noteKind, setNoteKind] = useState<CanvasNodeKind>('note');
  const [url, setUrl] = useState('https://get.nodeflowai.com/');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [transcript, setTranscript] = useState('');
  const [intakeText, setIntakeText] = useState('');
  const [intakeAction, setIntakeAction] = useState<IntakeActionMode>('summarize');
  const [composerMode, setComposerMode] = useState<ComposerMode>('source');
  const [askPrompt, setAskPrompt] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [enrichmentKind, setEnrichmentKind] = useState<SourceEnrichmentKind>('notes');
  const [enrichmentBody, setEnrichmentBody] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [focusedChunkId, setFocusedChunkId] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<ImportPreview | null>(null);
  const [clipboardFallback, setClipboardFallback] = useState<ClipboardFallback | null>(null);
  const [intakeReceipt, setIntakeReceipt] = useState<IntakeReceipt | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const compactCanvas = useCompactCanvas();

  const selectedNode = useMemo(() => canvas?.nodes.find((node) => node.id === selectedIds[0]) ?? null, [canvas, selectedIds]);
  const selectedNodes = useMemo(() => canvas?.nodes.filter((node) => selectedIds.includes(node.id)) ?? [], [canvas, selectedIds]);
  const selectedChars = useMemo(() => selectedNodes.reduce((total, node) => total + node.body.length, 0), [selectedNodes]);
  const sourceNodeCount = useMemo(() => canvas?.nodes.filter((node) => node.kind.startsWith('source_')).length ?? 0, [canvas?.nodes]);
  const actionOutputCount = useMemo(() => canvas?.nodes.filter((node) => node.kind === 'output' || node.kind === 'agent_run').length ?? 0, [canvas?.nodes]);
  const shouldShowCanvasIntakeTarget = Boolean(canvas && (canvas.nodes.length === 0 || (!sourceNodeCount && !actionOutputCount && canvas.runs.length === 0)));
  const contextScope = useMemo(() => {
    if (!canvas) return null;
    try {
      return describeCanvasExportScope(canvas, selectedIds);
    } catch {
      return describeCanvasExportScope(canvas, []);
    }
  }, [canvas, selectedIds]);
  const selectedExportQuery = useMemo(() => (
    selectedIds.length ? `&nodeIds=${encodeURIComponent(selectedIds.join(','))}` : ''
  ), [selectedIds]);
  const intakeReceiptExportIds = useMemo(() => {
    if (!intakeReceipt) return [];
    return [...intakeReceipt.nodeIds, intakeReceipt.outputNodeId].filter((id): id is string => Boolean(id));
  }, [intakeReceipt]);
  const recentIntakeTraces = useMemo(() => canvas?.intakeTraces.slice(0, 4) ?? [], [canvas?.intakeTraces]);
  const latestTrace = recentIntakeTraces[0] ?? null;
  const latestTraceExportIds = useMemo(() => latestTrace ? intakeTraceExportIds(latestTrace) : [], [latestTrace]);
  const selectedCitations = useMemo(() => selectedNode ? metadataCitations(selectedNode.metadata) : [], [selectedNode]);
  const selectedArtifact = useMemo(() => {
    const artifactId = metadataString(selectedNode?.metadata, 'artifactId');
    if (!canvas || !artifactId) return null;
    return canvas.artifacts.find((artifact) => artifact.id === artifactId) ?? null;
  }, [canvas, selectedNode]);
  const selectedSource = selectedNode ? sourceForNode(selectedNode, selectedArtifact) : undefined;
  const selectedImageSrc = imageSourceFromMetadata(selectedArtifact?.metadata) ?? imageSourceFromMetadata(selectedNode?.metadata);
  const selectedIngest = metadataString(selectedArtifact?.metadata, 'ingest') ?? metadataString(selectedNode?.metadata, 'ingest') ?? metadataString(selectedNode?.metadata, 'createdFrom') ?? 'node';
  const selectedArtifactChars = selectedArtifact?.body.length ?? selectedNode?.body.length ?? 0;
  const selectedChunkCount = selectedArtifact?.chunks.length ?? 0;
  const selectedPageCount = metadataNumber(selectedArtifact?.metadata, 'pages') ?? metadataNumber(selectedNode?.metadata, 'pages');
  const selectedReadiness = useMemo(() => (
    selectedNode ? describeSourceReadiness(selectedNode, selectedArtifact ?? undefined) : null
  ), [selectedArtifact, selectedNode]);
  const canEnrichSelectedSource = Boolean(selectedNode && (selectedNode.kind.startsWith('source_') || selectedArtifact));
  const sourceReadinessRows = useMemo(() => {
    if (!canvas) return [];
    const artifactsById = new Map(canvas.artifacts.map((artifact) => [artifact.id, artifact]));
    return canvas.nodes
      .filter((node) => node.kind.startsWith('source_'))
      .map((node) => {
        const artifactId = metadataString(node.metadata, 'artifactId');
        const artifact = artifactId ? artifactsById.get(artifactId) : undefined;
        return {
          node,
          readiness: describeSourceReadiness(node, artifact),
        };
      });
  }, [canvas]);
  const readySourceCount = useMemo(() => sourceReadinessRows.filter(({ readiness }) => readiness.status === 'ready').length, [sourceReadinessRows]);
  const needsContextSourceCount = useMemo(() => sourceReadinessRows.filter(({ readiness }) => readiness.status !== 'ready').length, [sourceReadinessRows]);
  const contextGaps = useMemo(() => {
    return sourceReadinessRows
      .filter(({ readiness }) => readiness.status !== 'ready')
      .sort((left, right) => {
        const leftPriority = left.readiness.status === 'needs_context' ? 0 : 1;
        const rightPriority = right.readiness.status === 'needs_context' ? 0 : 1;
        return leftPriority - rightPriority || left.node.title.localeCompare(right.node.title);
      })
      .slice(0, 5);
  }, [sourceReadinessRows]);
  const selectedChunkPreviews = useMemo(() => {
    const chunks = selectedArtifact?.chunks ?? [];
    if (!focusedChunkId) return chunks.slice(0, 2);
    const focused = chunks.find((chunk) => chunk.id === focusedChunkId);
    if (!focused) return chunks.slice(0, 2);
    return [focused, ...chunks.filter((chunk) => chunk.id !== focusedChunkId).slice(0, 1)];
  }, [focusedChunkId, selectedArtifact?.chunks]);
  const baseFlow = useMemo(() => (canvas ? toFlow(canvas, compactCanvas) : { nodes: [], edges: [] }), [canvas, compactCanvas]);
  const canMutate = Boolean(canvas) && !busy;
  const intakePlan = useMemo(() => buildIntakePlan(intakeText), [intakeText]);
  const intakeMapPreview = useMemo(() => intakeMapPreviewFor(intakeText), [intakeText]);
  const intakeActionPreview = useMemo(() => actionPreviewFor(intakeAction), [intakeAction]);
  const composerText = composerMode === 'ask' ? askPrompt : intakeText;
  const composerActionDisabled = !canMutate;
  const setupChecks = useMemo(() => {
    if (!setupStatus) return [];
    return [
      {
        label: 'Data home',
        ok: Boolean(setupStatus.canvasHome),
        detail: setupStatus.homeMode === 'custom' ? 'custom' : 'default',
      },
      {
        label: 'MCP build',
        ok: setupStatus.mcp.built && setupStatus.mcp.mediaReady,
        detail: setupStatus.mcp.built
          ? setupStatus.mcp.mediaReady ? 'media-ready' : 'rebuild media tools'
          : 'run build',
      },
      {
        label: 'Codex config',
        ok: setupStatus.codex.configExists,
        detail: setupStatus.codex.configExists ? 'found' : 'missing',
      },
      {
        label: 'Codex server',
        ok: setupStatus.codex.serverConfigured,
        detail: setupStatus.codex.serverConfigured
          ? 'wired'
          : setupStatus.codex.serverBlockExists && setupStatus.codex.envBlockExists
            ? 'path/home mismatch'
            : 'not wired',
      },
    ];
  }, [setupStatus]);
  const setupCommands = useMemo(() => setupStatus ? [
    { label: 'Setup', command: setupStatus.setup.localCommand },
    { label: 'Codex', command: setupStatus.codex.installWriteCommand },
    { label: 'Smoke', command: setupStatus.mcp.smokeCommand },
    { label: 'Proof', command: setupStatus.codex.smokeCommand },
    { label: 'Report', command: setupStatus.adoption.reportCommand },
  ] : [], [setupStatus]);
  const activationRunway = useMemo(() => {
    if (!setupStatus) return [];
    const sourceCount = canvas?.nodes.filter((node) => node.kind.startsWith('source_')).length ?? 0;
    return setupStatus.activation.steps.map((step, index) => {
      const ok = step.id === 'install'
        ? setupStatus.mcp.built && setupStatus.mcp.mediaReady
        : step.id === 'proof'
          ? Boolean(canvas?.nodes.length)
          : step.id === 'context'
            ? sourceCount > 0
            : step.id === 'handoff'
              ? Boolean(canvas?.nodes.length)
              : setupStatus.codex.serverConfigured;
      const detail = step.id === 'proof' && canvas?.nodes.length
        ? `${canvas.nodes.length} nodes live`
        : step.id === 'context' && sourceCount
          ? `${sourceCount} source${sourceCount === 1 ? '' : 's'} mapped`
          : step.id === 'handoff' && canvas?.nodes.length
            ? selectedIds.length ? `${selectedIds.length} selected for export` : 'whole canvas ready'
            : step.id === 'codex' && setupStatus.codex.serverConfigured
              ? 'Codex points at this MCP server'
              : step.detail;
      return { ...step, order: index + 1, ok, detail };
    });
  }, [canvas?.nodes, selectedIds.length, setupStatus]);
  const handoffReadiness = useMemo(() => {
    const sourceCount = canvas?.nodes.filter((node) => node.kind.startsWith('source_')).length ?? 0;
    const outputCount = canvas?.nodes.filter((node) => node.kind === 'output').length ?? 0;
    const runCount = canvas?.runs.length ?? 0;
    return [
      {
        label: 'Evidence',
        ok: sourceCount > 0,
        detail: sourceCount ? `${sourceCount} source${sourceCount === 1 ? '' : 's'}` : 'map source',
      },
      {
        label: 'Synthesis',
        ok: outputCount > 0 || runCount > 0,
        detail: outputCount || runCount ? `${outputCount} output${outputCount === 1 ? '' : 's'}` : 'ask or brief',
      },
      {
        label: 'Scope',
        ok: Boolean(canvas?.nodes.length),
        detail: selectedIds.length ? `${selectedIds.length} selected` : 'whole canvas',
      },
      {
        label: 'Codex',
        ok: setupStatus?.codex.serverConfigured ?? false,
        detail: setupStatus?.codex.serverConfigured ? 'MCP wired' : 'handoff prompt',
      },
    ];
  }, [canvas?.nodes, canvas?.runs.length, selectedIds.length, setupStatus?.codex.serverConfigured]);
  const sharedContextContract = useMemo(() => {
    const nodeCount = canvas?.nodes.length ?? 0;
    const artifactCount = canvas?.artifacts.length ?? 0;
    const toolCount = setupStatus?.agent.tools.length ?? 5;
    const scopeCount = contextScope?.nodes.length ?? 0;
    return [
      {
        label: 'You populate',
        value: nodeCount ? `${sourceNodeCount} source${sourceNodeCount === 1 ? '' : 's'}` : 'paste/drop/note',
        detail: nodeCount ? `${nodeCount} node${nodeCount === 1 ? '' : 's'} live` : 'first action ready',
        ok: nodeCount > 0,
      },
      {
        label: 'Canvas maps',
        value: `${artifactCount} artifact${artifactCount === 1 ? '' : 's'}`,
        detail: needsContextSourceCount ? `${needsContextSourceCount} need context` : readySourceCount ? `${readySourceCount} Codex-ready` : 'typed nodes + chunks',
        ok: artifactCount > 0 && !needsContextSourceCount,
      },
      {
        label: 'Codex reads/writes',
        value: `${toolCount} MCP tools`,
        detail: setupStatus?.codex.serverConfigured ? 'same local home' : 'handoff prompt ready',
        ok: setupStatus?.codex.serverConfigured ?? false,
      },
      {
        label: 'Handoff stays scoped',
        value: scopeCount ? `${scopeCount} node${scopeCount === 1 ? '' : 's'}` : 'no context',
        detail: contextScope?.mode === 'selection' ? 'selected evidence only' : 'whole canvas export',
        ok: scopeCount > 0,
      },
    ];
  }, [canvas?.artifacts.length, canvas?.nodes.length, contextScope?.mode, contextScope?.nodes.length, needsContextSourceCount, readySourceCount, setupStatus?.agent.tools.length, setupStatus?.codex.serverConfigured, sourceNodeCount]);
  const operatorLoop = useMemo<OperatorLoopStep[]>(() => {
    const nodes = canvas?.nodes ?? [];
    const sourceCount = nodes.filter((node) => node.kind.startsWith('source_')).length;
    const outputCount = nodes.filter((node) => node.kind === 'output').length;
    const runCount = canvas?.runs.length ?? 0;
    const detectedCount = intakePlan.filter((item) => item.active).length;
    const scopeCount = contextScope?.nodes.length ?? 0;
    return [
      {
        id: 'capture',
        label: 'Capture',
        detail: detectedCount ? `${detectedCount} detected` : nodes.length ? `${nodes.length} nodes` : 'empty',
        ok: detectedCount > 0 || nodes.length > 0,
        enabled: canMutate,
        actionLabel: 'Add',
      },
      {
        id: 'map',
        label: 'Map',
        detail: sourceCount ? `${sourceCount} source${sourceCount === 1 ? '' : 's'}` : 'no source',
        ok: sourceCount > 0,
        enabled: canMutate,
        actionLabel: 'Map',
      },
      {
        id: 'inspect',
        label: 'Inspect',
        detail: selectedNode ? shortPath(selectedNode.title, 22) : nodes.length ? 'select node' : 'no node',
        ok: Boolean(selectedNode),
        enabled: Boolean(nodes.length),
        actionLabel: 'Open',
      },
      {
        id: 'ask',
        label: 'Ask',
        detail: outputCount || runCount ? `${outputCount} output${outputCount === 1 ? '' : 's'}` : sourceCount ? 'ready' : 'needs source',
        ok: outputCount > 0 || runCount > 0,
        enabled: canMutate && Boolean(nodes.length),
        actionLabel: 'Ask',
      },
      {
        id: 'handoff',
        label: 'Handoff',
        detail: scopeCount ? `${contextScope?.mode === 'selection' ? 'selected' : 'canvas'} ${scopeCount}` : 'pending',
        ok: scopeCount > 0,
        enabled: Boolean(canvas && !busy && scopeCount),
        actionLabel: 'Codex',
      },
    ];
  }, [busy, canMutate, canvas, contextScope?.mode, contextScope?.nodes.length, intakePlan, selectedNode]);
  const workflowMap = useMemo<WorkflowMapStep[]>(() => {
    if (!canvas?.nodes.length) {
      return CONTEXT_LOOP_STEPS.map((step, index) => ({
        label: step.label,
        order: index + 1,
        detail: step.detail,
      }));
    }

    const grouped = new Map<string, WorkflowMapStep>();
    canvas.nodes.forEach((node) => {
      const label = metadataString(node.metadata, 'workflowStep');
      if (!label) return;
      const order = metadataNumber(node.metadata, 'workflowOrder') ?? 99;
      const existing = grouped.get(label);
      if (!existing || order < existing.order) {
        grouped.set(label, {
          label,
          order,
          detail: node.title,
          node,
        });
      }
    });

    if (!grouped.size) {
      return CONTEXT_LOOP_STEPS.map((step, index) => ({
        label: step.label,
        order: index + 1,
        detail: step.detail,
      }));
    }

    return Array.from(grouped.values()).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
  }, [canvas]);

  const focusNode = useCallback((node?: CanvasNode, selectedOverride?: string[]) => {
    if (!node) return;
    setSelectedIds(selectedOverride?.length ? selectedOverride : [node.id]);
    window.setTimeout(() => {
      setCenter(node.position.x + 130, node.position.y + 80, { zoom: compactCanvas ? 0.72 : 1, duration: 350 });
    }, 0);
  }, [compactCanvas, setCenter]);

  const frameNodes = useCallback((ids: string[], padding = 0.24) => {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (!uniqueIds.length) return;
    window.setTimeout(() => {
      void fitView({
        nodes: uniqueIds.map((id) => ({ id })),
        padding,
        duration: 420,
        minZoom: compactCanvas ? 0.42 : 0.58,
        maxZoom: compactCanvas ? 0.82 : 1,
      });
    }, 50);
  }, [compactCanvas, fitView]);

  const focusCitation = useCallback((citation: SourceCitation) => {
    if (!canvas) return;
    const node = canvas.nodes.find((candidate) => candidate.id === citation.nodeId)
      ?? (citation.artifactId
        ? canvas.nodes.find((candidate) => metadataString(candidate.metadata, 'artifactId') === citation.artifactId)
        : undefined);
    if (!node) {
      setStatus('Citation source is not available anymore.');
      return;
    }
    setFocusedChunkId(citation.chunkId ?? null);
    focusNode(node);
    const target = citation.chunkId ?? citation.artifactId ?? node.id;
    setStatus(`Focused citation ${citation.id}: ${node.title}${target ? ` (${target})` : ''}.`);
  }, [canvas, focusNode]);

  const focusComposer = useCallback(() => {
    window.setTimeout(() => composerRef.current?.focus(), 0);
  }, []);

  const requestComposerInput = useCallback((mode: ComposerMode = composerMode) => {
    setComposerMode(mode);
    const message = mode === 'ask'
      ? 'Ask uses selected nodes, or the whole canvas when nothing is selected.'
      : mode === 'note'
        ? 'Write a note in the canvas composer, or use Note to create a blank editable node.'
        : 'Paste or drop a YouTube link, video link, image, URL, transcript, PDF, file, or raw notes.';
    setStatus(message);
    focusComposer();
  }, [composerMode, focusComposer]);

  const applyQuickStarter = useCallback((id: QuickStarterId) => {
    if (id === 'video') {
      setComposerMode('source');
      setIntakeAction('summarize');
      setStatus('Ready for a video link. Paste YouTube, Loom, Vimeo, or transcript notes.');
      focusComposer();
      return;
    }
    if (id === 'image') {
      setComposerMode('source');
      setIntakeAction('summarize');
      setStatus('Ready for an image. Upload a screenshot, drop a visual, or paste an image URL with notes.');
      focusComposer();
      return;
    }
    if (id === 'web') {
      setComposerMode('source');
      setIntakeAction('claims');
      setStatus('Ready for a web source. Paste a URL with optional notes.');
      focusComposer();
      return;
    }
    if (id === 'ask') {
      setComposerMode('ask');
      setStatus('Ask mode uses selected nodes, or the whole canvas when nothing is selected.');
      focusComposer();
      return;
    }
    setComposerMode('note');
    setStatus('Note mode captures your own thinking as a movable canvas node.');
    focusComposer();
  }, [focusComposer]);

  const focusContextGap = useCallback((node: CanvasNode) => {
    setEnrichmentKind(defaultEnrichmentKind(node));
    focusNode(node);
    setStatus(`Selected ${node.title}. Attach transcript, OCR, notes, claims, or excerpts to make it action-ready.`);
    window.setTimeout(() => {
      const input = document.querySelector<HTMLTextAreaElement>('[data-testid="source-enrichment-body"]');
      input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      input?.focus();
    }, 160);
  }, [focusNode]);

  useEffect(() => {
    setFlowNodes(baseFlow.nodes);
    setFlowEdges(baseFlow.edges);
  }, [baseFlow]);

  useEffect(() => {
    setEditTitle(selectedNode?.title ?? '');
    setEditBody(selectedNode?.body ?? '');
  }, [selectedNode?.id, selectedNode?.title, selectedNode?.body]);

  useEffect(() => {
    setEnrichmentKind(defaultEnrichmentKind(selectedNode));
    setEnrichmentBody('');
  }, [selectedNode?.id, selectedNode?.kind]);

  useEffect(() => {
    setIntakeReceipt(null);
  }, [canvas?.id]);

  useEffect(() => {
    if (!focusedChunkId) return;
    if (!selectedArtifact?.chunks.some((chunk) => chunk.id === focusedChunkId)) {
      setFocusedChunkId(null);
    }
  }, [focusedChunkId, selectedArtifact]);

  const loadCanvas = useCallback(async (id: string) => {
    const data = await api<{ canvas: CanvasRecord }>(`/api/canvases/${id}`);
    setCanvas(data.canvas);
    setSelectedIds([]);
    return data.canvas;
  }, []);

  const refreshList = useCallback(async () => {
    const data = await api<ApiState>('/api/canvases');
    setApiState(data);
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      try {
        setBusy(true);
        const data = await refreshList();
        if (cancelled) return;
        if (data.canvases.length) {
          await loadCanvas(data.canvases[0].id);
          setStatus('Loaded latest local canvas.');
        } else {
          const created = await api<{ canvas: CanvasRecord }>('/api/canvases', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ title: 'My agent canvas', template: 'blank' }),
          });
          if (cancelled) return;
          setCanvas(created.canvas);
          await refreshList();
          setStatus('Created starter canvas.');
        }
      } catch (error) {
        setStatus((error as Error).message);
      } finally {
        setBusy(false);
      }
    }
    boot();
    return () => {
      cancelled = true;
    };
  }, [loadCanvas, refreshList]);

  useEffect(() => {
    let cancelled = false;
    async function loadSetupStatus() {
      try {
        const data = await api<SetupStatus>('/api/setup/status');
        if (!cancelled) setSetupStatus(data);
      } catch {
        if (!cancelled) setSetupStatus(null);
      }
    }
    void loadSetupStatus();
    const interval = window.setInterval(loadSetupStatus, 30000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const mutateCanvas = useCallback(async (
    work: () => Promise<CanvasMutationResponse>,
    done: string,
    onResult?: (result: CanvasMutationResponse) => void,
  ) => {
    if (!canvas) return;
    setBusy(true);
    try {
      const result = await work();
      if (result.canvas) setCanvas(result.canvas);
      onResult?.(result);
      await refreshList();
      setStatus(done);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [canvas, refreshList]);

  const createTemplate = useCallback(async (template: string) => {
    setBusy(true);
    try {
      const created = await api<{ canvas: CanvasRecord }>('/api/canvases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title: `${template.replace(/_/g, ' ')} canvas`, template }),
      });
      setCanvas(created.canvas);
      await refreshList();
      setStatus(`Created ${created.canvas.title}.`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [refreshList]);

  const addNote = useCallback(async () => {
    if (!canvas) return;
    await mutateCanvas(
      () => api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/nodes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: noteKind, title: noteTitle, body: noteBody, metadata: {} }),
      }),
      `Added ${formatKind(noteKind)} node.`,
      (result) => focusNode(result.node),
    );
  }, [canvas, focusNode, mutateCanvas, noteBody, noteKind, noteTitle]);

  const addCanvasNoteAt = useCallback(async (position?: FlowPosition, body = '') => {
    if (!canvas) return;
    const text = body.trim();
    await mutateCanvas(
      () => api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/nodes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'note',
          title: text ? textTitle(text) : 'Canvas note',
          body: text || 'New note. Select this node to edit it.',
          position,
          metadata: { createdFrom: position ? 'canvas_double_click' : 'canvas_composer' },
        }),
      }),
      'Added canvas note.',
      (result) => {
        if (result.node) {
          focusNode(result.node);
          setIntakeReceipt(createIntakeReceipt('Note intake', [result.node], []));
        }
      },
    );
  }, [canvas, focusNode, mutateCanvas]);

  const saveSelectedNode = useCallback(async () => {
    if (!canvas || !selectedNode) return;
    await mutateCanvas(
      () => api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/nodes/${selectedNode.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: editTitle,
          body: editBody,
        }),
      }),
      'Saved selected node.',
    );
  }, [canvas, editBody, editTitle, mutateCanvas, selectedNode]);

  const attachSourceContext = useCallback(async () => {
    if (!canvas || !selectedNode || !enrichmentBody.trim()) return;
    await mutateCanvas(
      () => api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/nodes/${selectedNode.id}/enrich`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          body: enrichmentBody.trim(),
          enrichmentKind,
          append: true,
          sourceLabel: 'Inspector enrichment',
        }),
      }),
      `Attached ${enrichmentStatusLabel(enrichmentKind)} to selected source.`,
      (result) => {
        const enrichedNode = result.node;
        if (enrichedNode) {
          focusNode(enrichedNode);
          setIntakeReceipt(createIntakeReceipt(
            'Source enrichment',
            [enrichedNode],
            result.artifact ? [result.artifact] : artifactsForNodes(result.canvas ?? canvas, [enrichedNode]),
          ));
        }
        setEnrichmentBody('');
      },
    );
  }, [canvas, enrichmentBody, enrichmentKind, focusNode, mutateCanvas, selectedNode]);

  const pasteClipboardToEnrichment = useCallback(async () => {
    if (!navigator.clipboard?.readText) {
      setStatus('Clipboard read is not available in this browser.');
      return;
    }
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) throw new Error('Clipboard is empty.');
      setEnrichmentBody(text);
      setStatus('Pasted clipboard into selected source context.');
    } catch (error) {
      setStatus((error as Error).message);
    }
  }, []);

  const addUrl = useCallback(async () => {
    if (!canvas || !url.trim()) return;
    await mutateCanvas(
      () => api<IntakeAnythingResponse>(`/api/canvases/${canvas.id}/ingest/anything`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: url.trim() }),
      }),
      'Mapped URL source.',
      (result) => {
        const createdNodes = (result as IntakeAnythingResponse).nodes ?? (result.node ? [result.node] : []);
        focusNode(createdNodes[createdNodes.length - 1] ?? result.node);
        setIntakeReceipt(createIntakeReceipt('URL intake', createdNodes, (result as IntakeAnythingResponse).artifacts ?? artifactsForNodes(result.canvas ?? canvas, createdNodes)));
        setUrl('');
      },
    );
  }, [canvas, focusNode, mutateCanvas, url]);

  const addYoutube = useCallback(async () => {
    if (!canvas || !youtubeUrl.trim()) return;
    const intake = transcript.trim()
      ? `${youtubeUrl.trim()}\nTranscript: ${transcript.trim()}`
      : youtubeUrl.trim();
    await mutateCanvas(
      () => api<IntakeAnythingResponse>(`/api/canvases/${canvas.id}/ingest/anything`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: intake }),
      }),
      'Mapped video source.',
      (result) => {
        const createdNodes = (result as IntakeAnythingResponse).nodes ?? (result.node ? [result.node] : []);
        focusNode(createdNodes[createdNodes.length - 1] ?? result.node);
        setIntakeReceipt(createIntakeReceipt('Video intake', createdNodes, (result as IntakeAnythingResponse).artifacts ?? artifactsForNodes(result.canvas ?? canvas, createdNodes)));
        setYoutubeUrl('');
        setTranscript('');
      },
    );
  }, [canvas, focusNode, mutateCanvas, transcript, youtubeUrl]);

  const finishIntake = useCallback(async (
    createdNodeIds: string[],
    latest: CanvasMutationResponse | null,
    actionMode: IntakeActionMode,
    mappedStatus: string,
    sourceLabel = 'Canvas intake',
  ) => {
    const mappedCanvas = latest?.canvas;
    const createdNodeIdSet = new Set(createdNodeIds);
    const createdNodes = mappedCanvas?.nodes.filter((node) => createdNodeIdSet.has(node.id)) ?? (latest?.node ? [latest.node] : []);
    const createdIds = createdNodes.map((node) => node.id);
    const lastCreated = createdNodes[createdNodes.length - 1] ?? latest?.node;

    if (mappedCanvas) setCanvas(mappedCanvas);
    focusNode(lastCreated, createdIds);
    frameNodes(createdIds);

    const actionInput = intakeActionInput(actionMode);
    if (canvas && actionInput.action && createdIds.length) {
      const result = await api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: actionInput.action,
          inputNodeIds: createdIds,
          prompt: actionInput.prompt ?? '',
        }),
      });
      if (result.canvas) setCanvas(result.canvas);
      focusNode(result.outputNode);
      frameNodes(result.outputNode ? [...createdIds, result.outputNode.id] : createdIds, 0.28);
      setIntakeReceipt(createIntakeReceipt(sourceLabel, createdNodes, artifactsForNodes(result.canvas ?? mappedCanvas ?? canvas, createdNodes), result.outputNode, actionInput.action));
      await refreshList();
      setStatus(`${mappedStatus} Ran ${actionInput.action.replace(/_/g, ' ')} on ${createdIds.length} new item(s).`);
      return;
    }

    setIntakeReceipt(createIntakeReceipt(sourceLabel, createdNodes, artifactsForNodes(mappedCanvas ?? canvas, createdNodes)));
    await refreshList();
    setStatus(mappedStatus);
  }, [canvas, focusNode, frameNodes, refreshList]);

  const ingestFiles = useCallback(async (files: File[], position?: FlowPosition, actionMode: IntakeActionMode = intakeAction) => {
    if (!canvas || !files.length) return;
    setBusy(true);
    try {
      const createdNodeIds: string[] = [];
      let last: CanvasMutationResponse | null = null;
      let count = 0;
      for (const file of files) {
        const nodePosition = offsetPosition(position, count);
        if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
          const form = new FormData();
          form.append('file', file);
          if (nodePosition) {
            form.append('positionX', String(nodePosition.x));
            form.append('positionY', String(nodePosition.y));
          }
          last = await api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/ingest/pdf`, { method: 'POST', body: form });
          if (last.node?.id) createdNodeIds.push(last.node.id);
          count += 1;
          continue;
        }

        if (isSupportedImageFile(file)) {
          const form = new FormData();
          form.append('file', file);
          if (nodePosition) {
            form.append('positionX', String(nodePosition.x));
            form.append('positionY', String(nodePosition.y));
          }
          last = await api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/ingest/image`, { method: 'POST', body: form });
          if (last.node?.id) createdNodeIds.push(last.node.id);
          count += 1;
          continue;
        }

        if (
          file.type.startsWith('text/') ||
          /\.(txt|md|markdown|json|csv|log)$/i.test(file.name)
        ) {
          const text = await file.text();
          last = await api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/ingest/text`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              title: file.name,
              body: text,
              source: file.name,
              artifactKind: file.name.toLowerCase().endsWith('.json') ? 'json' : 'markdown',
              metadata: { filename: file.name, fileType: file.type || 'text/plain' },
              position: nodePosition,
            }),
          });
          if (last.node?.id) createdNodeIds.push(last.node.id);
          count += 1;
          continue;
        }

        last = await api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/ingest/text`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: file.name,
            body: `Local file reference: ${file.name}\nType: ${file.type || 'unknown'}\nSize: ${file.size} bytes\n\nBinary media extraction is not enabled in v0.1. Add a transcript, description, or extracted text for analysis.`,
            source: file.name,
            metadata: { filename: file.name, fileType: file.type || 'unknown', fileSize: file.size, ingest: 'file_reference' },
            position: nodePosition,
          }),
        });
        if (last?.node?.id) createdNodeIds.push(last.node.id);
        count += 1;
      }
      await finishIntake(createdNodeIds, last, actionMode, `Ingested ${count} file source(s).`, position ? 'Dropped files' : 'Uploaded files');
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [canvas, finishIntake, intakeAction]);

  const intakeAnything = useCallback(async (value: string, position?: FlowPosition, actionMode: IntakeActionMode = intakeAction) => {
    if (!canvas || !value.trim()) return;
    setBusy(true);
    try {
      const summary = buildIntakePlan(value).filter((item) => item.active).map((item) => item.label).join(', ');
      const actionInput = intakeActionInput(actionMode);
      const result = await api<IntakeAnythingResponse>(`/api/canvases/${canvas.id}/ingest/anything`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          body: value,
          position,
          action: actionInput.action,
          prompt: actionInput.prompt ?? '',
        }),
      });
      const createdIds = result.nodes?.map((node) => node.id) ?? (result.node?.id ? [result.node.id] : []);
      const lastCreated = result.nodes?.[result.nodes.length - 1] ?? result.node;
      const createdNodes = result.nodes ?? (result.node ? [result.node] : []);
      const mappedArtifacts = result.artifacts ?? artifactsForNodes(result.canvas ?? canvas, createdNodes);
      const sourceLabel = position ? 'Dropped onto canvas' : 'Composer intake';
      if (result.canvas) setCanvas(result.canvas);
      if (result.outputNode) {
        focusNode(result.outputNode);
        frameNodes([...createdIds, result.outputNode.id], 0.28);
        setIntakeReceipt(createIntakeReceipt(sourceLabel, createdNodes, mappedArtifacts, result.outputNode, actionInput.action));
        await refreshList();
        setStatus(`${summary ? `Mapped ${createdIds.length} item(s): ${summary}.` : `Mapped ${createdIds.length} source item(s).`} Ran ${String(actionInput.action).replace(/_/g, ' ')} on ${createdIds.length} new item(s).`);
        return;
      }
      focusNode(lastCreated, createdIds);
      frameNodes(createdIds);
      setIntakeReceipt(createIntakeReceipt(sourceLabel, createdNodes, mappedArtifacts));
      await refreshList();
      setStatus(summary ? `Mapped ${createdIds.length} item(s): ${summary}.` : `Mapped ${createdIds.length} source item(s).`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [canvas, focusNode, frameNodes, intakeAction, refreshList]);

  const submitCanvasIntake = useCallback(async () => {
    const text = intakeText.trim();
    if (!text) {
      requestComposerInput('source');
      return;
    }
    await intakeAnything(text);
    setIntakeText('');
  }, [intakeAnything, intakeText, requestComposerInput]);

  const submitCanvasNote = useCallback(async () => {
    await addCanvasNoteAt(undefined, intakeText);
    setIntakeText('');
  }, [addCanvasNoteAt, intakeText]);

  const prepareImportCanvasFile = useCallback(async (file?: File) => {
    if (!file) return;
    try {
      const raw = await file.text();
      let summaries = apiState.canvases;
      try {
        const latest = await refreshList();
        summaries = latest.canvases;
      } catch {
        // Keep import preview available even when the sidebar refresh is temporarily unavailable.
      }
      const preview = buildImportPreview(file.name, raw, summaries);
      setPendingImport(preview);
      setStatus(preview.conflict
        ? `Review import: ${preview.canvas.title} matches an existing canvas id and will be copied.`
        : `Review import: ${preview.canvas.title} before local state changes.`);
    } catch (error) {
      setPendingImport(null);
      setStatus((error as Error).message);
    }
  }, [apiState.canvases, refreshList]);

  const confirmImportCanvas = useCallback(async () => {
    if (!pendingImport) return;
    setBusy(true);
    try {
      const result = await api<ImportCanvasResponse>('/api/canvases/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: pendingImport.raw,
      });
      setCanvas(result.canvas);
      setPendingImport(null);
      const focus = result.canvas.nodes.find((node) => node.kind === 'source_youtube')
        ?? result.canvas.nodes.find((node) => node.kind.startsWith('source_'))
        ?? result.canvas.nodes[0];
      if (focus) {
        focusNode(focus);
      } else {
        setSelectedIds([]);
      }
      await refreshList();
      if (result.import?.conflict === 'copy') {
        setStatus(`Imported copy of ${result.import.sourceTitle} as ${result.canvas.title}; existing canvas was preserved.`);
      } else {
        setStatus(`Imported ${result.canvas.title}.`);
      }
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [focusNode, pendingImport, refreshList]);

  const cancelImportPreview = useCallback(() => {
    setPendingImport(null);
    setStatus('Import cancelled; local canvas state was not changed.');
  }, []);

  const loadDemoCanvas = useCallback(async () => {
    setBusy(true);
    try {
      const result = await api<{ canvas: CanvasRecord; source: string }>('/api/canvases/demo', {
        method: 'POST',
      });
      setCanvas(result.canvas);
      const focus = result.canvas.nodes.find((node) => node.kind === 'source_youtube') ?? result.canvas.nodes[0];
      if (focus) focusNode(focus);
      await refreshList();
      setStatus(`Loaded demo from ${result.source}. Inspect receipts, run Ask, or export Context.`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [focusNode, refreshList]);

  const copyCanvasContext = useCallback(async () => {
    if (!canvas) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/canvases/${canvas.id}/export?format=context${selectedExportQuery}`);
      if (!response.ok) throw new Error(await response.text());
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      setStatus(selectedIds.length ? `Copied selected context packet for ${selectedIds.length} node(s).` : 'Copied agent context packet.');
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [canvas, selectedExportQuery, selectedIds.length]);

  const copyCodexHandoff = useCallback(async () => {
    if (!canvas) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/canvases/${canvas.id}/export?format=codex${selectedExportQuery}`);
      if (!response.ok) throw new Error(await response.text());
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      setStatus(selectedIds.length ? `Copied selected Codex handoff for ${selectedIds.length} node(s).` : 'Copied Codex handoff prompt.');
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [canvas, selectedExportQuery, selectedIds.length]);

  const focusIntakeReceipt = useCallback(() => {
    if (!canvas || !intakeReceipt || !intakeReceiptExportIds.length) return;
    const targetId = intakeReceipt.outputNodeId ?? intakeReceipt.nodeIds[intakeReceipt.nodeIds.length - 1];
    const target = canvas.nodes.find((node) => node.id === targetId) ?? canvas.nodes.find((node) => intakeReceiptExportIds.includes(node.id));
    if (!target) return;
    focusNode(target, intakeReceiptExportIds);
    setStatus(`Focused latest ${intakeReceipt.sourceLabel.toLowerCase()} context receipt.`);
  }, [canvas, focusNode, intakeReceipt, intakeReceiptExportIds]);

  const copyIntakeReceiptExport = useCallback(async (format: 'context' | 'codex') => {
    if (!canvas || !intakeReceipt || !intakeReceiptExportIds.length) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({
        format,
        nodeIds: intakeReceiptExportIds.join(','),
      });
      const response = await fetch(`/api/canvases/${canvas.id}/export?${params.toString()}`);
      if (!response.ok) throw new Error(await response.text());
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      setStatus(`Copied latest intake ${format === 'codex' ? 'Codex handoff' : 'context packet'} for ${intakeReceiptExportIds.length} node(s).`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [canvas, intakeReceipt, intakeReceiptExportIds]);

  const focusIntakeTrace = useCallback((trace: CanvasIntakeTrace) => {
    if (!canvas) return;
    const ids = intakeTraceExportIds(trace);
    const targetId = trace.outputNodeId ?? trace.nodeIds[trace.nodeIds.length - 1];
    const target = canvas.nodes.find((node) => node.id === targetId) ?? canvas.nodes.find((node) => ids.includes(node.id));
    if (!target) return;
    focusNode(target, ids);
    frameNodes(ids);
    setStatus(`Focused ${trace.sourceLabel.toLowerCase()} trace with ${trace.nodeIds.length} source node(s).`);
  }, [canvas, focusNode, frameNodes]);

  const copyIntakeTraceExport = useCallback(async (trace: CanvasIntakeTrace, format: 'context' | 'codex') => {
    if (!canvas) return;
    const ids = intakeTraceExportIds(trace);
    if (!ids.length) return;
    setBusy(true);
    try {
      const params = new URLSearchParams({
        format,
        nodeIds: ids.join(','),
      });
      const response = await fetch(`/api/canvases/${canvas.id}/export?${params.toString()}`);
      if (!response.ok) throw new Error(await response.text());
      const text = await response.text();
      await navigator.clipboard.writeText(text);
      setStatus(`Copied ${format === 'codex' ? 'Codex handoff' : 'context packet'} for ${trace.sourceLabel.toLowerCase()}.`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [canvas]);

  const copySelectedContext = useCallback(async () => {
    if (!selectedNode) return;
    try {
      await navigator.clipboard.writeText(selectedContextPacket(selectedNode, selectedArtifact));
      setStatus('Copied selected source context.');
    } catch (error) {
      setStatus((error as Error).message);
    }
  }, [selectedArtifact, selectedNode]);

  const copyCommand = useCallback(async (command: string, label: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setStatus(`Copied ${label}.`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  }, []);

  const runActivationStep = useCallback(async (step: ActivationStep) => {
    if (step.command) {
      await copyCommand(step.command, `${step.label} command`);
      return;
    }
    if (step.action === 'load_demo') {
      await loadDemoCanvas();
      return;
    }
    if (step.action === 'focus_intake') {
      requestComposerInput('source');
      return;
    }
    if (step.action === 'copy_context') {
      await copyCanvasContext();
    }
  }, [copyCanvasContext, copyCommand, loadDemoCanvas, requestComposerInput]);

  const runAction = useCallback(async (action: CanvasActionType, prompt = '', inputNodeIds = selectedIds) => {
    if (!canvas) return;
    setBusy(true);
    try {
      const result = await api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, inputNodeIds, prompt }),
      });
      if (result.canvas) setCanvas(result.canvas);
      focusNode(result.outputNode);
      await refreshList();
      setStatus(`Ran ${action.replace(/_/g, ' ')}.`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [canvas, focusNode, refreshList, selectedIds]);

  const askCanvas = useCallback(async () => {
    if (!canvas?.nodes.length) {
      requestComposerInput('source');
      setStatus('Add a source or note before asking. The canvas needs context first.');
      return;
    }
    if (!askPrompt.trim()) {
      requestComposerInput('ask');
      return;
    }
    await runAction('answer_question', askPrompt);
  }, [askPrompt, canvas?.nodes.length, requestComposerInput, runAction]);

  const askSelectedSource = useCallback(async () => {
    if (!selectedNode) return;
    await runAction('answer_question', `Using the selected node "${selectedNode.title}", extract the most useful takeaways, gaps, and next actions. Cite source chunks when available.`, [selectedNode.id]);
  }, [runAction, selectedNode]);

  const pasteClipboardToIntake = useCallback(async (mode: ComposerMode = composerMode) => {
    if (!canvas || busy) return;
    try {
      if (!navigator.clipboard?.readText) {
        throw new Error('Clipboard read is not available in this browser.');
      }
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) throw new Error('Clipboard is empty.');

      setClipboardFallback(null);
      if (mode === 'ask') {
        setAskPrompt(text);
        await runAction('answer_question', text);
        return;
      }

      if (mode === 'note') {
        await addCanvasNoteAt(undefined, text);
        setIntakeText('');
        return;
      }

      setComposerMode('source');
      setIntakeText(text);
      await intakeAnything(text);
      setIntakeText('');
    } catch {
      const message = `Clipboard read was blocked or empty. ${mode === 'ask' ? 'The ask composer' : mode === 'note' ? 'The note composer' : 'The source composer'} is focused; press Ctrl+V or drop content here.`;
      setComposerMode(mode);
      setClipboardFallback({ mode, message });
      setStatus(message);
      focusComposer();
    }
  }, [addCanvasNoteAt, busy, canvas, composerMode, focusComposer, intakeAnything, runAction]);

  const submitActiveComposer = useCallback(async () => {
    if (composerMode === 'note') {
      await submitCanvasNote();
      return;
    }
    if (composerMode === 'ask') {
      await askCanvas();
      return;
    }
    await submitCanvasIntake();
  }, [askCanvas, composerMode, submitCanvasIntake, submitCanvasNote]);

  const runOperatorLoopStep = useCallback(async (id: OperatorLoopStepId) => {
    if (id === 'capture') {
      requestComposerInput('source');
      return;
    }

    if (id === 'map') {
      await submitActiveComposer();
      return;
    }

    if (id === 'inspect') {
      const node = selectedNode
        ?? canvas?.nodes.find((candidate) => candidate.kind.startsWith('source_'))
        ?? canvas?.nodes[0];
      if (node) {
        focusNode(node);
      } else {
        requestComposerInput('source');
      }
      return;
    }

    if (id === 'ask') {
      if (!canvas?.nodes.length) {
        requestComposerInput('source');
        return;
      }
      setComposerMode('ask');
      await askCanvas();
      return;
    }

    await copyCodexHandoff();
  }, [askCanvas, canvas?.nodes, copyCodexHandoff, focusNode, requestComposerInput, selectedNode, submitActiveComposer]);

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length && canvas && !busy) {
        event.preventDefault();
        setClipboardFallback(null);
        void ingestFiles(files);
        return;
      }
      const text = event.clipboardData?.getData('text/plain')?.trim();
      if (!text || !canvas || busy) return;
      event.preventDefault();
      setClipboardFallback(null);
      if (composerMode === 'note') {
        void addCanvasNoteAt(undefined, text);
        return;
      }
      if (composerMode === 'ask') {
        void runAction('answer_question', text);
        return;
      }
      void intakeAnything(text);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [addCanvasNoteAt, busy, canvas, composerMode, ingestFiles, intakeAnything, runAction]);

  const connectSelected = useCallback(async () => {
    if (!canvas || selectedIds.length < 2) return;
    await mutateCanvas(
      () => api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/edges`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: selectedIds[0], target: selectedIds[1], kind: edgeKind }),
      }),
      `Connected selected nodes as ${formatKind(edgeKind)}.`,
    );
  }, [canvas, edgeKind, mutateCanvas, selectedIds]);

  const connectFlow = useCallback(async (connection: Connection) => {
    if (!canvas || !connection.source || !connection.target) return;
    setSelectedIds([connection.source, connection.target]);
    await mutateCanvas(
      () => api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/edges`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: connection.source, target: connection.target, kind: edgeKind }),
      }),
      `Connected canvas nodes as ${formatKind(edgeKind)}.`,
    );
  }, [canvas, edgeKind, mutateCanvas]);

  const runSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    const data = await api<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(searchQuery)}`);
    setSearchResults(data.results);
    setStatus(`Found ${data.results.length} local result(s).`);
  }, [searchQuery]);

  const focusSearchResult = useCallback(async (result: SearchResult) => {
    if (!result.nodeId) return;
    try {
      const targetCanvas = canvas?.id === result.canvasId ? canvas : await loadCanvas(result.canvasId);
      const node = targetCanvas.nodes.find((candidate) => candidate.id === result.nodeId);
      if (!node) throw new Error('Search result node is not available anymore.');
      setFocusedChunkId(result.chunkId ?? null);
      setSelectedIds([node.id]);
      setCenter(node.position.x + 130, node.position.y + 80, { zoom: compactCanvas ? 0.72 : 1, duration: 450 });
      setStatus(result.chunkId ? `Focused ${node.title} at ${result.chunkId}.` : `Focused ${node.title}.`);
    } catch (error) {
      setStatus((error as Error).message);
    }
  }, [canvas, compactCanvas, loadCanvas, setCenter]);

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelectedIds(params.nodes.map((node) => node.id));
  }, []);

  const onNodesChange = useCallback((changes: NodeChange<Node<AgentNodeData>>[]) => {
    setFlowNodes((nodes) => applyNodeChanges(changes, nodes));
  }, []);

  const persistNodePosition = useCallback(async (_event: unknown, node: Node<AgentNodeData>) => {
    if (!canvas) return;
    try {
      const result = await api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/nodes/${node.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ position: node.position }),
      });
      if (result.canvas) setCanvas(result.canvas);
      await refreshList();
      setStatus('Saved node position.');
    } catch (error) {
      setStatus((error as Error).message);
    }
  }, [canvas, refreshList]);

  const onDrop = useCallback(async (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    const files = Array.from(event.dataTransfer.files ?? []);
    if (files.length) {
      await ingestFiles(files, position);
      return;
    }
    const uri = event.dataTransfer.getData('text/uri-list');
    const text = event.dataTransfer.getData('text/plain');
    await intakeAnything(uri || text, position);
  }, [ingestFiles, intakeAnything, screenToFlowPosition]);

  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  }, []);

  const onDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const onCanvasDoubleClick = useCallback(async (event: MouseEvent<HTMLElement>) => {
    if (!canvas || busy) return;
    const target = event.target as HTMLElement;
    if (target.closest('a, button, input, label, select, textarea, .react-flow__node, .react-flow__controls, .react-flow__minimap')) return;
    const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
    await addCanvasNoteAt(position);
  }, [addCanvasNoteAt, busy, canvas, screenToFlowPosition]);

  return (
    <main className="min-h-screen overflow-x-hidden bg-starlight-bg text-starlight-ink" data-testid="workspace">
      <div className="flex min-h-screen flex-col lg:h-screen">
        <header className="flex min-h-[72px] flex-col items-start gap-3 border-b border-starlight-border bg-starlight-surface/88 px-4 py-3 shadow-command backdrop-blur sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-starlight-accent/50 bg-starlight-accent/10">
              <Network className="h-5 w-5 text-starlight-accent" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-lg font-semibold leading-6">Starlight Agent Canvas</h1>
              <p className="text-xs text-starlight-muted">Local-first MCP research graph for sources, actions, and agent outputs.</p>
            </div>
          </div>
          <div className="hidden min-w-0 flex-1 items-center justify-end gap-3 px-5 lg:flex">
            <span className="truncate rounded-md border border-starlight-border bg-starlight-panel px-3 py-1.5 text-xs text-starlight-muted">
              Data: {apiState.home || 'loading'}
            </span>
            <span className="rounded-md border border-starlight-mint/40 bg-starlight-mint/10 px-3 py-1.5 text-xs text-starlight-mint">
              MCP-safe v0.1
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {busy ? <Loader2 className="h-4 w-4 animate-spin text-starlight-accent" aria-label="Busy" /> : <ShieldCheck className="h-4 w-4 text-starlight-mint" aria-hidden="true" />}
            <span className="max-w-[260px] truncate text-starlight-muted" data-testid="status">{status}</span>
          </div>
        </header>

        <div className="grid flex-1 grid-cols-1 lg:min-h-0 lg:grid-cols-[320px_minmax(0,1fr)_360px]">
          <aside className="order-2 border-b border-starlight-border bg-starlight-surface/72 p-4 lg:order-none lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
            <section className="space-y-3 rounded-lg border border-starlight-accent/25 bg-starlight-panel/78 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ClipboardPaste className="h-4 w-4 text-starlight-accent" aria-hidden="true" />
                Add To Canvas
              </div>
              <textarea
                data-testid="rail-intake-text"
                value={intakeText}
                onChange={(event) => setIntakeText(event.target.value)}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                    event.preventDefault();
                    void submitCanvasIntake();
                  }
                }}
                className="min-h-24 w-full rounded-md border border-starlight-border bg-starlight-surface px-3 py-2 text-sm leading-6"
                placeholder="Paste YouTube, any video URL, image, file notes, transcript, or note"
              />
              <div className="flex flex-wrap gap-1.5" data-testid="rail-intake-preview">
                {intakePlan.map((item) => (
                  <span
                    key={`${item.id}-${item.label}`}
                    className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-[10px] ${
                      item.active ? 'border-starlight-accent/45 bg-starlight-accent/10 text-starlight-ink' : 'border-starlight-border bg-starlight-surface text-starlight-muted'
                    }`}
                  >
                    {intakePlanIcon(item.id)}
                    <span className="truncate">{item.label}</span>
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-1.5" data-testid="rail-intake-action">
                {INTAKE_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    aria-pressed={intakeAction === action.id}
                    onClick={() => setIntakeAction(action.id)}
                    className={`flex items-center justify-center gap-1.5 rounded-md border px-2 py-1.5 text-[11px] font-semibold transition ${
                      intakeAction === action.id
                        ? 'border-starlight-accent bg-starlight-accent/15 text-starlight-ink'
                        : 'border-starlight-border bg-starlight-surface text-starlight-muted hover:border-starlight-accent/60 hover:text-starlight-ink'
                    }`}
                    title={action.detail}
                  >
                    {intakeActionIcon(action.id)}
                    {action.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-[auto_1fr_auto] gap-2">
                <button
                  data-testid="rail-intake-paste"
                  type="button"
                  disabled={!canMutate}
                  onClick={() => pasteClipboardToIntake('source')}
                  className="flex items-center justify-center gap-2 rounded-md border border-starlight-border px-3 py-2 text-sm font-semibold text-starlight-ink transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
                  Paste & Map
                </button>
                <button
                  data-testid="rail-intake-ingest"
                  type="button"
                  disabled={!canMutate}
                  onClick={submitCanvasIntake}
                  className="flex items-center justify-center gap-2 rounded-md bg-starlight-ink px-3 py-2 text-sm font-semibold text-starlight-bg transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {intakeActionIcon(intakeAction)}
                  {intakeButtonLabel(intakeAction)}
                </button>
                <label className="flex cursor-pointer items-center justify-center rounded-md border border-starlight-border px-3 py-2 text-starlight-muted transition hover:border-starlight-accent hover:text-starlight-ink">
                  <FileUp className="h-4 w-4" aria-hidden="true" />
                  <input
                    type="file"
                    multiple
                    accept={SOURCE_FILE_ACCEPT}
                    disabled={!canMutate}
                    onChange={(event) => {
                      const files = Array.from(event.currentTarget.files ?? []);
                      event.currentTarget.value = '';
                      void ingestFiles(files);
                    }}
                    className="sr-only"
                  />
                </label>
              </div>
            </section>

            <section className="mt-6 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <LayoutTemplate className="h-4 w-4 text-starlight-gold" aria-hidden="true" />
                Templates
              </div>
              <div className="grid grid-cols-1 gap-2">
                <button
                  data-testid="load-demo-canvas-rail"
                  type="button"
                  disabled={busy}
                  onClick={loadDemoCanvas}
                  className="rounded-lg border border-starlight-gold/45 bg-starlight-gold/10 p-3 text-left transition hover:border-starlight-gold disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="flex items-center gap-2 text-sm font-semibold text-starlight-ink">
                    <LayoutTemplate className="h-4 w-4 text-starlight-gold" aria-hidden="true" />
                    Demo Proof Canvas
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-starlight-muted">YouTube/manual transcript, URL notes, human note, chunks, citations, and Codex context.</span>
                </button>
                {apiState.templates.filter((template) => template.id !== 'blank').map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    disabled={busy}
                    onClick={() => createTemplate(template.id)}
                    data-testid={`template-${template.id}`}
                    className="rounded-lg border border-starlight-border bg-starlight-panel/80 p-3 text-left transition hover:border-starlight-accent/60 hover:bg-starlight-panel disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span className="block text-sm font-medium text-starlight-ink">{template.title}</span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-starlight-muted">{template.description}</span>
                    {template.steps?.length ? (
                      <span className="mt-2 flex flex-wrap gap-1" data-testid={`template-steps-${template.id}`}>
                        {template.steps.slice(0, 3).map((step) => (
                          <span key={step} className="rounded-md border border-starlight-border bg-starlight-bg px-1.5 py-0.5 text-[10px] text-starlight-muted">
                            {step}
                          </span>
                        ))}
                      </span>
                    ) : null}
                    {template.outcome ? (
                      <span className="mt-2 line-clamp-2 block text-[11px] leading-4 text-starlight-mint">{template.outcome}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-6 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Boxes className="h-4 w-4 text-starlight-accent" aria-hidden="true" />
                  Canvases
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => createTemplate('blank')}
                  className="inline-flex items-center gap-1.5 rounded-md border border-starlight-accent/45 bg-starlight-accent/10 px-2 py-1 text-[11px] font-semibold text-starlight-accent transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
                  New
                </button>
              </div>
              <div className="space-y-2">
                {apiState.canvases.map((summary) => (
                  <button
                    key={summary.id}
                    type="button"
                    disabled={busy}
                    onClick={() => loadCanvas(summary.id)}
                    className={`w-full rounded-lg border p-3 text-left transition ${
                      canvas?.id === summary.id ? 'border-starlight-accent bg-starlight-accent/10' : 'border-starlight-border bg-starlight-panel/70 hover:border-starlight-accent/50'
                    }`}
                  >
                    <span className="block truncate text-sm font-medium">{summary.title}</span>
                    <span className="mt-1 block text-xs text-starlight-muted">{summary.nodeCount} nodes / {summary.runCount} runs</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-6 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <MessageSquarePlus className="h-4 w-4 text-starlight-gold" aria-hidden="true" />
                Add Node
              </div>
              <select
                value={noteKind}
                onChange={(event) => setNoteKind(event.target.value as CanvasNodeKind)}
                className="w-full rounded-md border border-starlight-border bg-starlight-panel px-3 py-2 text-sm text-starlight-ink"
              >
                {(['note', 'prompt', 'mcp_tool', 'agent_run'] satisfies CanvasNodeKind[]).map((kind) => (
                  <option key={kind} value={kind}>{formatKind(kind)}</option>
                ))}
              </select>
              <input
                value={noteTitle}
                onChange={(event) => setNoteTitle(event.target.value)}
                className="w-full rounded-md border border-starlight-border bg-starlight-panel px-3 py-2 text-sm"
                placeholder="Node title"
              />
              <textarea
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
                className="min-h-24 w-full rounded-md border border-starlight-border bg-starlight-panel px-3 py-2 text-sm leading-6"
                placeholder="Node body"
              />
              <button data-testid="add-note" type="button" onClick={addNote} disabled={!canMutate} className="flex w-full items-center justify-center gap-2 rounded-md bg-starlight-accent px-3 py-2 text-sm font-semibold text-[#05060A] transition hover:bg-[#8CBAFF] disabled:cursor-not-allowed disabled:opacity-45">
                <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                Add Node
              </button>
            </section>

            <section className="mt-6 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Link className="h-4 w-4 text-starlight-mint" aria-hidden="true" />
                Source URL
              </div>
              <input
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                className="w-full rounded-md border border-starlight-border bg-starlight-panel px-3 py-2 text-sm"
                placeholder="https://..."
              />
              <button type="button" onClick={addUrl} disabled={!canMutate} className="flex w-full items-center justify-center gap-2 rounded-md border border-starlight-mint/40 bg-starlight-mint/10 px-3 py-2 text-sm font-semibold text-starlight-mint transition hover:border-starlight-mint disabled:cursor-not-allowed disabled:opacity-45">
                <Link className="h-4 w-4" aria-hidden="true" />
                Ingest URL
              </button>
            </section>

            <section className="mt-6 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Play className="h-4 w-4 text-starlight-danger" aria-hidden="true" />
                YouTube Transcript
              </div>
              <input
                value={youtubeUrl}
                onChange={(event) => setYoutubeUrl(event.target.value)}
                className="w-full rounded-md border border-starlight-border bg-starlight-panel px-3 py-2 text-sm"
                placeholder="YouTube URL"
              />
              <textarea
                value={transcript}
                onChange={(event) => setTranscript(event.target.value)}
                className="min-h-20 w-full rounded-md border border-starlight-border bg-starlight-panel px-3 py-2 text-sm leading-6"
                placeholder="Paste transcript or notes"
              />
              <button type="button" onClick={addYoutube} disabled={!canMutate} className="flex w-full items-center justify-center gap-2 rounded-md border border-starlight-danger/40 bg-starlight-danger/10 px-3 py-2 text-sm font-semibold text-starlight-danger transition hover:border-starlight-danger disabled:cursor-not-allowed disabled:opacity-45">
                <Play className="h-4 w-4" aria-hidden="true" />
                Add Video Source
              </button>
            </section>

            <section className="mt-6 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <FileText className="h-4 w-4 text-starlight-ink" aria-hidden="true" />
                Files
              </div>
              <input
                type="file"
                multiple
                accept={SOURCE_FILE_ACCEPT}
                disabled={!canMutate}
                onChange={(event) => {
                  const files = Array.from(event.currentTarget.files ?? []);
                  event.currentTarget.value = '';
                  void ingestFiles(files);
                }}
                className="w-full rounded-md border border-starlight-border bg-starlight-panel px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-starlight-ink file:px-2 file:py-1 file:text-xs file:text-starlight-bg disabled:cursor-not-allowed disabled:opacity-45"
              />
            </section>
          </aside>

          <section
            className={`relative order-1 h-[620px] min-h-[620px] overflow-hidden bg-starlight-bg sm:h-[680px] lg:order-none lg:h-full lg:min-h-0 ${dragActive ? 'ring-2 ring-inset ring-starlight-accent/70' : ''}`}
            data-testid="canvas-surface"
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDoubleClick={onCanvasDoubleClick}
          >
            <div className="absolute inset-0 agent-grid opacity-70" aria-hidden="true" />
            {dragActive ? (
              <div className="pointer-events-none absolute inset-x-5 top-24 z-20 rounded-lg border border-starlight-accent/60 bg-starlight-accent/15 px-4 py-3 text-sm font-semibold text-starlight-ink shadow-command backdrop-blur">
                Drop to map onto this canvas
              </div>
            ) : null}
            {canvas?.nodes.length && !shouldShowCanvasIntakeTarget ? (
              <div
                className="absolute bottom-20 left-3 right-3 z-10 hidden rounded-lg border border-starlight-border bg-starlight-surface/82 p-2.5 shadow-command backdrop-blur sm:left-auto sm:right-4 sm:block sm:max-w-[260px]"
                data-testid="canvas-drop-affordance"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-starlight-ink">
                  <MousePointerClick className="h-4 w-4 text-starlight-mint" aria-hidden="true" />
                  Canvas accepts context
                </div>
                <p className="mt-1 text-[11px] leading-4 text-starlight-muted">
                  Drop files or links anywhere. Use the controls here to map sources, notes, and Codex-ready context.
                </p>
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    data-testid="canvas-affordance-paste"
                    disabled={!canMutate}
                    onClick={() => pasteClipboardToIntake('source')}
                    className="flex min-h-8 items-center justify-center gap-1 rounded-md border border-starlight-accent/40 bg-starlight-accent/10 px-2 text-[10px] font-semibold text-starlight-accent transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
                    Paste
                  </button>
                  <button
                    type="button"
                    data-testid="canvas-affordance-note"
                    disabled={!canMutate}
                    onClick={() => addCanvasNoteAt()}
                    className="flex min-h-8 items-center justify-center gap-1 rounded-md border border-starlight-gold/40 bg-starlight-gold/10 px-2 text-[10px] font-semibold text-starlight-ink transition hover:border-starlight-gold disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
                    Note
                  </button>
                  <label className={`flex min-h-8 items-center justify-center gap-1 rounded-md border border-starlight-border bg-starlight-bg/70 px-2 text-[10px] font-semibold text-starlight-ink transition hover:border-starlight-accent ${canMutate ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'}`}>
                    <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                    File
                    <input
                      data-testid="canvas-affordance-file"
                      type="file"
                      multiple
                      accept={SOURCE_FILE_ACCEPT}
                      disabled={!canMutate}
                      onChange={(event) => {
                        void ingestFiles(Array.from(event.currentTarget.files ?? []));
                        event.currentTarget.value = '';
                      }}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
            ) : null}
            <div className="absolute left-3 right-3 top-3 z-30 max-h-[min(24vh,210px)] overflow-y-auto overscroll-contain rounded-lg border border-starlight-accent/30 bg-starlight-surface/92 p-2 shadow-command backdrop-blur md:left-4 md:right-auto md:max-h-[min(32vh,260px)] md:w-[min(420px,calc(100%-2rem))]" data-testid="live-composer">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <div className="inline-flex items-center gap-1.5 rounded-md border border-starlight-mint/35 bg-starlight-mint/10 px-2.5 py-1 text-xs font-semibold text-starlight-ink" data-testid="live-intake-heading">
                    <UploadCloud className="h-3.5 w-3.5 text-starlight-mint" aria-hidden="true" />
                    Paste / Drop Anything
                  </div>
                  <div className="grid grid-cols-3 gap-1 rounded-md border border-starlight-border bg-starlight-bg/80 p-1" data-testid="composer-mode">
                    {COMPOSER_MODES.map((mode) => (
                      <button
                        key={mode.id}
                        type="button"
                        aria-pressed={composerMode === mode.id}
                        onClick={() => setComposerMode(mode.id)}
                        className={`flex min-h-8 items-center justify-center gap-1.5 rounded px-2 text-[11px] font-semibold transition ${
                          composerMode === mode.id
                            ? 'bg-starlight-ink text-starlight-bg'
                            : 'text-starlight-muted hover:bg-starlight-surface hover:text-starlight-ink'
                        }`}
                        title={mode.detail}
                      >
                        {composerModeIcon(mode.id)}
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-starlight-muted" data-testid="canvas-live-state">
                  <span className="rounded-md border border-starlight-border bg-starlight-bg/80 px-2 py-1">{canvas?.nodes.length ?? 0} nodes</span>
                  <span className="rounded-md border border-starlight-border bg-starlight-bg/80 px-2 py-1">{canvas?.artifacts.length ?? 0} artifacts</span>
                  <span className="rounded-md border border-starlight-border bg-starlight-bg/80 px-2 py-1">{canvas?.runs.length ?? 0} runs</span>
                </div>
              </div>
              <p className="mt-2 text-xs leading-5 text-starlight-muted" data-testid="live-intake-helper">
                Paste a YouTube link, any video URL, screenshot, PDF, file, transcript, or notes. Agent Canvas maps it into typed nodes, chunks, readiness, and Codex-readable context.
              </p>
              {shouldShowCanvasIntakeTarget ? (
                <div className="mt-2 rounded-md border border-starlight-accent/30 bg-starlight-accent/10 p-2.5 md:hidden" data-testid="mobile-first-source-actions">
                  <div className="flex items-center gap-2 text-xs font-semibold text-starlight-ink">
                    <UploadCloud className="h-3.5 w-3.5 text-starlight-accent" aria-hidden="true" />
                    Add your first context
                  </div>
                  <p className="mt-1 text-[11px] leading-4 text-starlight-muted">
                    Paste a source, add your note, or upload a file to create the first canvas node.
                  </p>
                  <div className="mt-2 grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      data-testid="mobile-first-source-paste"
                      disabled={!canMutate}
                      onClick={() => pasteClipboardToIntake('source')}
                      className="flex min-h-9 items-center justify-center gap-1 rounded-md border border-starlight-accent/45 bg-starlight-bg/70 px-2 text-[10px] font-semibold text-starlight-accent disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
                      Paste
                    </button>
                    <button
                      type="button"
                      data-testid="mobile-first-source-note"
                      disabled={!canMutate}
                      onClick={submitCanvasNote}
                      className="flex min-h-9 items-center justify-center gap-1 rounded-md border border-starlight-gold/45 bg-starlight-bg/70 px-2 text-[10px] font-semibold text-starlight-ink disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
                      Note
                    </button>
                    <label className={`flex min-h-9 items-center justify-center gap-1 rounded-md border border-starlight-border bg-starlight-bg/70 px-2 text-[10px] font-semibold text-starlight-ink ${canMutate ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'}`}>
                      <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                      File
                      <input
                        data-testid="mobile-first-source-file"
                        type="file"
                        multiple
                        accept={SOURCE_FILE_ACCEPT}
                        disabled={!canMutate}
                        onChange={(event) => {
                          void ingestFiles(Array.from(event.currentTarget.files ?? []));
                          event.currentTarget.value = '';
                        }}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>
              ) : null}
              <div className="mt-2 grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
                <div className="flex flex-wrap gap-1.5" data-testid="canvas-quick-start">
                  <button
                    data-testid="load-demo-canvas"
                    type="button"
                    disabled={busy}
                    onClick={loadDemoCanvas}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-starlight-gold/45 bg-starlight-gold/10 px-2.5 text-[11px] font-semibold text-starlight-ink transition hover:border-starlight-gold disabled:cursor-not-allowed disabled:opacity-45"
                    title="Import the bundled proof canvas"
                  >
                    <LayoutTemplate className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Demo</span>
                    <span className="hidden font-normal text-starlight-muted 2xl:inline">proof canvas</span>
                  </button>
                  <button
                    data-testid="new-blank-canvas"
                    type="button"
                    disabled={busy}
                    onClick={() => createTemplate('blank')}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-starlight-accent/45 bg-starlight-accent/10 px-2.5 text-[11px] font-semibold text-starlight-accent transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45"
                    title="Create a fresh local canvas"
                  >
                    <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>New</span>
                    <span className="hidden font-normal text-starlight-muted 2xl:inline">blank canvas</span>
                  </button>
                  {QUICK_STARTERS.map((starter) => (
                    <button
                      key={starter.id}
                      type="button"
                      onClick={() => applyQuickStarter(starter.id)}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-starlight-border bg-starlight-bg/70 px-2.5 text-[11px] font-semibold text-starlight-ink transition hover:border-starlight-accent hover:bg-starlight-accent/10"
                      title={starter.detail}
                    >
                      {quickStarterIcon(starter.id)}
                      <span>{starter.label}</span>
                      <span className="hidden font-normal text-starlight-muted 2xl:inline">{starter.detail}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-starlight-muted" data-testid="context-loop">
                  {CONTEXT_LOOP_STEPS.map((step, index) => (
                    <div key={step.label} className="flex items-center gap-1.5">
                      {index ? <span className="text-starlight-border">/</span> : null}
                      <span className="rounded-md border border-starlight-border bg-starlight-bg/70 px-2 py-1">
                        <span className="font-semibold text-starlight-ink">{step.label}</span>
                        <span className="hidden 2xl:inline"> {step.detail}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <details className="mt-2 rounded-md border border-starlight-border bg-starlight-bg/72 p-2 text-xs" data-testid="shared-context-contract">
                <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2 text-starlight-ink marker:hidden">
                  <span className="inline-flex min-w-0 items-center gap-1.5 font-semibold">
                    <Network className="h-3.5 w-3.5 text-starlight-mint" aria-hidden="true" />
                    <span>Shared context contract</span>
                  </span>
                  <span className="truncate text-[10px] text-starlight-muted">Open for input types, operator loop, and Codex handoff state</span>
                </summary>
                <div className="mt-2 space-y-2">
                  {setupStatus?.firstSuccess.inputContracts.length ? (
                    <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4 xl:grid-cols-7" data-testid="input-contract-strip">
                      {setupStatus.firstSuccess.inputContracts.map((contract) => (
                        <div
                          key={contract.id}
                          data-testid={`input-contract-${contract.id}`}
                          title={`${contract.input}: ${contract.output}`}
                          className="min-w-0 rounded-md border border-starlight-border bg-starlight-bg/72 px-2 py-1.5"
                        >
                          <span className="flex min-w-0 items-center gap-1.5 text-[10px] font-semibold text-starlight-ink">
                            <span className="shrink-0 text-starlight-accent">{inputContractIcon(contract.id)}</span>
                            <span className="truncate">{contract.label}</span>
                          </span>
                          <span className="mt-0.5 block truncate text-[9px] text-starlight-muted">{contract.outputLabel}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="rounded-md border border-starlight-border bg-starlight-surface/72 p-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="min-w-0 truncate rounded-md border border-starlight-border bg-starlight-surface px-2 py-1 text-[10px] text-starlight-muted" data-testid="shared-context-home">
                        {shortPath(setupStatus?.canvasHome || apiState.home || 'local canvas home', 44)}
                      </span>
                      <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
                        <button
                          type="button"
                          data-testid="shared-context-add"
                          disabled={!canMutate}
                          onClick={() => requestComposerInput('source')}
                          className="flex min-h-7 items-center justify-center gap-1 rounded-md border border-starlight-accent/35 bg-starlight-accent/10 px-2 text-[10px] font-semibold text-starlight-accent transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <UploadCloud className="h-3 w-3" aria-hidden="true" />
                          Add
                        </button>
                        <button
                          type="button"
                          data-testid="shared-context-ask"
                          disabled={!canMutate || !canvas?.nodes.length}
                          onClick={() => requestComposerInput('ask')}
                          className="flex min-h-7 items-center justify-center gap-1 rounded-md border border-starlight-border bg-starlight-surface/85 px-2 text-[10px] font-semibold text-starlight-ink transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <Sparkles className="h-3 w-3" aria-hidden="true" />
                          Ask
                        </button>
                        <button
                          type="button"
                          data-testid="shared-context-codex"
                          disabled={!canvas || busy}
                          onClick={copyCodexHandoff}
                          className="flex min-h-7 items-center justify-center gap-1 rounded-md border border-starlight-gold/45 bg-starlight-gold/10 px-2 text-[10px] font-semibold text-starlight-ink transition hover:border-starlight-gold disabled:cursor-not-allowed disabled:opacity-45"
                        >
                          <Bot className="h-3 w-3" aria-hidden="true" />
                          Codex
                        </button>
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5 md:grid-cols-4" data-testid="shared-context-contract-steps">
                      {sharedContextContract.map((item) => (
                        <div key={item.label} className={`min-w-0 rounded-md border px-2 py-1.5 ${item.ok ? 'border-starlight-mint/35 bg-starlight-mint/10' : 'border-starlight-border bg-starlight-bg/78'}`}>
                          <div className="flex min-w-0 items-center gap-1.5">
                            {item.ok ? (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-starlight-mint" aria-hidden="true" />
                            ) : (
                              <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-starlight-gold" aria-hidden="true" />
                            )}
                            <span className="truncate text-[10px] font-semibold text-starlight-ink">{item.label}</span>
                          </div>
                          <div className="mt-1 truncate text-[11px] font-semibold text-starlight-ink">{item.value}</div>
                          <div className="mt-0.5 truncate text-[9px] text-starlight-muted">{item.detail}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 md:grid-cols-5" data-testid="operator-loop">
                    {operatorLoop.map((step) => (
                      <button
                        key={step.id}
                        type="button"
                        data-testid={`operator-loop-${step.id}`}
                        disabled={!step.enabled}
                        onClick={() => void runOperatorLoopStep(step.id)}
                        aria-label={`${step.label}: ${step.actionLabel}`}
                        className={`min-h-14 rounded-md border px-2 py-1.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                          step.ok
                            ? 'border-starlight-mint/40 bg-starlight-mint/10 hover:border-starlight-mint'
                            : 'border-starlight-border bg-starlight-bg/75 hover:border-starlight-accent/70'
                        }`}
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          {step.ok ? (
                            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-starlight-mint" aria-hidden="true" />
                          ) : (
                            <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-starlight-gold" aria-hidden="true" />
                          )}
                          <span className="truncate text-[11px] font-semibold text-starlight-ink">{step.label}</span>
                          <span className="ml-auto shrink-0 rounded border border-starlight-border bg-starlight-surface px-1.5 py-0.5 text-[9px] uppercase text-starlight-muted">
                            {step.actionLabel}
                          </span>
                        </span>
                        <span className="mt-1 block truncate text-[10px] text-starlight-muted">{step.detail}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </details>
              {composerMode === 'source' && intakeMapPreview.length ? (
                <div
                  className="mt-2 flex flex-wrap items-center gap-1.5 rounded-md border border-starlight-accent/25 bg-starlight-accent/10 px-2.5 py-2 text-[11px]"
                  data-testid="intake-map-preview-summary"
                >
                  <GitBranch className="h-3.5 w-3.5 text-starlight-accent" aria-hidden="true" />
                  <span className="font-semibold text-starlight-ink">{intakeMapPreview.length} mapped node{intakeMapPreview.length === 1 ? '' : 's'}</span>
                  <span className="rounded border border-starlight-accent/35 bg-starlight-bg/70 px-1.5 py-0.5 text-starlight-accent">{intakeMapPreview[0]?.nodeKind}</span>
                  <span className="rounded border border-starlight-border bg-starlight-bg/70 px-1.5 py-0.5 text-starlight-ink">{intakeMapPreview[0]?.artifactKind}</span>
                  <span className="min-w-0 truncate text-starlight-muted">{intakeMapPreview[0]?.readiness}</span>
                  <span className="ml-auto rounded border border-starlight-border bg-starlight-surface px-1.5 py-0.5 uppercase text-starlight-muted">{intakeActionPreview.label}</span>
                </div>
              ) : null}
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                <textarea
                  data-testid="intake-text"
                  ref={composerRef}
                  value={composerText}
                  onChange={(event) => {
                    setClipboardFallback(null);
                    if (composerMode === 'ask') {
                      setAskPrompt(event.target.value);
                    } else {
                      setIntakeText(event.target.value);
                    }
                  }}
                  onKeyDown={(event) => {
                    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                      event.preventDefault();
                      void submitActiveComposer();
                    }
                  }}
                  aria-label="Add source, note, or question to canvas"
                  className="col-span-3 min-h-12 w-full resize-none rounded-md border border-starlight-border bg-starlight-bg/80 px-3 py-2 text-sm leading-5 text-starlight-ink"
                  placeholder={composerPlaceholder(composerMode)}
                />
                <button
                  data-testid="intake-paste"
                  type="button"
                  disabled={!canMutate}
                  onClick={() => pasteClipboardToIntake(composerMode)}
                  className="flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-starlight-border px-2 text-xs font-semibold text-starlight-ink transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45 md:h-10 md:gap-2 md:px-3 md:text-sm"
                >
                  <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
                  {clipboardButtonLabel(composerMode)}
                </button>
                <button
                  data-testid="intake-ingest"
                  type="button"
                  disabled={composerActionDisabled}
                  onClick={submitActiveComposer}
                  className="flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-starlight-ink px-2 text-xs font-semibold text-starlight-bg transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45 md:h-10 md:gap-2 md:px-3 md:text-sm"
                >
                  {composerPrimaryIcon(composerMode, intakeAction)}
                  {composerButtonLabel(composerMode, intakeAction)}
                </button>
                <button
                  data-testid="quick-note"
                  type="button"
                  disabled={!canMutate}
                  onClick={submitCanvasNote}
                  className="flex h-9 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-starlight-border px-2 text-xs font-semibold text-starlight-ink transition hover:border-starlight-gold disabled:cursor-not-allowed disabled:opacity-45 md:h-10 md:gap-2 md:px-3 md:text-sm"
                >
                  <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                  Note
                </button>
              </div>
              {composerMode === 'source' && intakeMapPreview.length ? (
                <div
                  className="mt-2 rounded-md border border-starlight-accent/25 bg-starlight-bg/86 p-2.5"
                  data-testid="intake-map-preview"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-starlight-ink">
                      <GitBranch className="h-3.5 w-3.5 text-starlight-accent" aria-hidden="true" />
                      <span>Map preview</span>
                      <span className="rounded border border-starlight-border bg-starlight-surface px-1.5 py-0.5 text-[9px] uppercase text-starlight-muted">
                        {intakeMapPreview.length} node{intakeMapPreview.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-starlight-muted" data-testid="intake-map-action-preview">
                      <span className="rounded border border-starlight-border bg-starlight-surface px-1.5 py-0.5 uppercase">{intakeActionPreview.label}</span>
                      <span>{intakeActionPreview.detail}</span>
                    </div>
                  </div>
                  <div className="mt-2 grid gap-1.5 lg:grid-cols-2" data-testid="intake-map-preview-items">
                    {intakeMapPreview.slice(0, 4).map((item) => (
                      <div
                        key={item.id}
                        className="min-w-0 rounded-md border border-starlight-border bg-starlight-surface/78 p-2"
                        data-testid={`intake-map-preview-item-${item.kind}`}
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          <span className="shrink-0 text-starlight-accent">{intakePlanIcon(item.kind)}</span>
                          <span className="truncate text-[11px] font-semibold text-starlight-ink">{item.title}</span>
                          <span className="ml-auto shrink-0 rounded border border-starlight-accent/30 px-1.5 py-0.5 text-[9px] text-starlight-accent">
                            {item.nodeKind}
                          </span>
                        </div>
                        <div className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-[10px] leading-4">
                          <span className="text-starlight-muted">Artifact</span>
                          <span className="truncate text-starlight-ink">{item.artifactKind}</span>
                          <span className="text-starlight-muted">Readiness</span>
                          <span className="truncate text-starlight-ink">{item.readiness}</span>
                          <span className="text-starlight-muted">Next</span>
                          <span className="truncate text-starlight-muted">{item.nextAction}</span>
                        </div>
                        {item.source ? (
                          <div className="mt-1 truncate text-[10px] text-starlight-mint">{item.source}</div>
                        ) : null}
                      </div>
                    ))}
                    {intakeMapPreview.length > 4 ? (
                      <div className="rounded-md border border-starlight-border bg-starlight-surface/78 p-2 text-[11px] text-starlight-muted">
                        +{intakeMapPreview.length - 4} more mapped item{intakeMapPreview.length - 4 === 1 ? '' : 's'}
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
              {clipboardFallback ? (
                <div
                  className="mt-2 rounded-md border border-starlight-gold/35 bg-starlight-gold/10 px-3 py-2 text-xs leading-5 text-starlight-ink"
                  data-testid="clipboard-fallback"
                  role="status"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <ClipboardPaste className="h-3.5 w-3.5 text-starlight-gold" aria-hidden="true" />
                    <span className="font-semibold">Paste manually</span>
                    <span className="rounded border border-starlight-gold/30 px-1.5 py-0.5 text-[10px] uppercase text-starlight-gold">{clipboardFallback.mode}</span>
                  </div>
                  <p className="mt-1 text-starlight-muted">{clipboardFallback.message}</p>
                </div>
              ) : null}
              {intakeReceipt ? (
                <div
                  className="mt-2 rounded-md border border-starlight-mint/35 bg-starlight-surface/95 p-2 shadow-command backdrop-blur md:p-2.5"
                  data-testid="context-mapping-receipt"
                  role="status"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-starlight-ink">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-starlight-mint" aria-hidden="true" />
                        <span>Mapped context receipt</span>
                        <span className="hidden rounded border border-starlight-mint/35 bg-starlight-bg/70 px-1.5 py-0.5 text-[9px] uppercase text-starlight-mint sm:inline-flex">
                          {intakeReceipt.sourceLabel}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-starlight-muted">
                        <span data-testid="context-receipt-node-count">{intakeReceipt.nodeIds.length} context node(s)</span>
                        {intakeReceipt.artifactKinds.length ? (
                          <span data-testid="context-receipt-artifacts">{intakeReceipt.artifactKinds.map(formatKind).join(', ')} artifacts</span>
                        ) : null}
                        {intakeReceipt.action ? (
                          <span data-testid="context-receipt-action">{formatKind(intakeReceipt.action)} output</span>
                        ) : null}
                        <span className="inline-flex items-center gap-1 font-semibold text-starlight-ink" data-testid="context-receipt-codex-ready">
                          <Bot className="h-3 w-3 text-starlight-gold" aria-hidden="true" />
                          Codex-ready
                        </span>
                      </div>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        data-testid="context-receipt-inspect"
                        onClick={focusIntakeReceipt}
                        className="inline-flex min-h-7 w-8 items-center justify-center gap-1.5 rounded-md border border-starlight-border bg-starlight-bg/80 text-[11px] font-semibold text-starlight-ink transition hover:border-starlight-mint sm:w-auto sm:px-2"
                      >
                        <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only sm:not-sr-only">Inspect</span>
                      </button>
                      <button
                        type="button"
                        data-testid="context-receipt-copy-context"
                        disabled={busy}
                        onClick={() => void copyIntakeReceiptExport('context')}
                        className="inline-flex min-h-7 w-8 items-center justify-center gap-1.5 rounded-md border border-starlight-border bg-starlight-bg/80 text-[11px] font-semibold text-starlight-ink transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:px-2"
                      >
                        <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only sm:not-sr-only">Context</span>
                      </button>
                      <button
                        type="button"
                        data-testid="context-receipt-copy-codex"
                        disabled={busy}
                        onClick={() => void copyIntakeReceiptExport('codex')}
                        className="inline-flex min-h-7 w-8 items-center justify-center gap-1.5 rounded-md border border-starlight-gold/45 bg-starlight-gold/10 text-[11px] font-semibold text-starlight-ink transition hover:border-starlight-gold disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto sm:px-2"
                      >
                        <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                        <span className="sr-only sm:not-sr-only">Codex</span>
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 hidden flex-wrap gap-1.5 sm:flex" data-testid="context-receipt-items">
                    {intakeReceipt.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          const target = canvas?.nodes.find((node) => node.id === item.id);
                          if (target) focusNode(target, intakeReceiptExportIds);
                        }}
                        className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-starlight-border bg-starlight-bg/75 px-2 py-1 text-[10px] text-starlight-muted transition hover:border-starlight-mint hover:text-starlight-ink"
                      >
                        <span className="shrink-0 font-semibold text-starlight-mint">{formatKind(item.kind)}</span>
                        <span className="truncate">{item.title}</span>
                      </button>
                    ))}
                    {intakeReceipt.nodeIds.length > intakeReceipt.items.length ? (
                      <span className="rounded-md border border-starlight-border bg-starlight-bg/75 px-2 py-1 text-[10px] text-starlight-muted">
                        +{intakeReceipt.nodeIds.length - intakeReceipt.items.length} more
                      </span>
                    ) : null}
                    {intakeReceipt.outputNodeId ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-starlight-gold/35 bg-starlight-gold/10 px-2 py-1 text-[10px] font-semibold text-starlight-ink">
                        <Sparkles className="h-3 w-3 text-starlight-gold" aria-hidden="true" />
                        output linked
                      </span>
                    ) : null}
                  </div>
                </div>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-starlight-muted" data-testid="intake-preview">
                {composerMode === 'source' ? (
                  <>
                    {intakePlan.map((item) => (
                      <span
                        key={`${item.id}-${item.label}`}
                        className={`inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 ${
                          item.active ? 'border-starlight-accent/45 bg-starlight-accent/10 text-starlight-ink' : 'border-starlight-border bg-starlight-bg/80 text-starlight-muted'
                        }`}
                      >
                        {intakePlanIcon(item.id)}
                        <span className="truncate font-medium">{item.label}</span>
                        <span className="hidden text-starlight-muted sm:inline">{item.detail}</span>
                      </span>
                    ))}
                    {INTAKE_ACTIONS.map((action) => (
                      <button
                        key={action.id}
                        type="button"
                        aria-pressed={intakeAction === action.id}
                        onClick={() => setIntakeAction(action.id)}
                        className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 font-semibold transition ${
                          intakeAction === action.id
                            ? 'border-starlight-accent bg-starlight-accent/15 text-starlight-ink'
                            : 'border-starlight-border bg-starlight-bg/80 text-starlight-muted hover:border-starlight-accent/60 hover:text-starlight-ink'
                        }`}
                        title={action.detail}
                      >
                        {intakeActionIcon(action.id)}
                        <span>{action.label}</span>
                      </button>
                    ))}
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-starlight-border px-2 py-1 text-starlight-muted transition hover:border-starlight-accent hover:text-starlight-ink">
                      <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                      Upload
                      <input
                        data-testid="composer-upload-source"
                        type="file"
                        aria-label="Upload source"
                        multiple
                        accept={SOURCE_FILE_ACCEPT}
                        disabled={!canMutate}
                        onChange={(event) => {
                          const files = Array.from(event.currentTarget.files ?? []);
                          event.currentTarget.value = '';
                          void ingestFiles(files);
                        }}
                        className="sr-only"
                      />
                    </label>
                  </>
                ) : (
                  <>
                    <span className="inline-flex items-center gap-1 rounded-md border border-starlight-border bg-starlight-bg/80 px-2 py-1 text-starlight-muted">
                      {composerModeIcon(composerMode)}
                      {composerMode === 'note' ? `${intakeText.trim().length || 0} note chars` : `${selectedNodes.length || canvas?.nodes.length || 0} context nodes`}
                    </span>
                    {composerMode === 'ask' ? (
                      <span className="inline-flex items-center gap-1 rounded-md border border-starlight-accent/35 bg-starlight-accent/10 px-2 py-1 text-starlight-accent">
                        <Search className="h-3.5 w-3.5" aria-hidden="true" />
                        {selectedNodes.length ? 'selected scope' : 'whole canvas'}
                      </span>
                    ) : null}
                  </>
                )}
              </div>
            </div>
            {pendingImport ? (
              <div
                className="absolute inset-0 z-40 flex items-center justify-center bg-starlight-bg/70 p-4 backdrop-blur-sm"
                data-testid="import-preview"
                role="dialog"
                aria-modal="true"
                aria-label="Review canvas import"
              >
                <div className="w-[min(620px,100%)] rounded-lg border border-starlight-accent/30 bg-starlight-surface/96 p-4 shadow-command">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-semibold text-starlight-ink">
                        <FileUp className="h-4 w-4 text-starlight-accent" aria-hidden="true" />
                        Review Import
                      </div>
                      <h2 className="mt-2 truncate text-base font-semibold text-starlight-ink">{pendingImport.canvas.title}</h2>
                      <p className="mt-1 truncate text-xs text-starlight-muted">{pendingImport.fileName}</p>
                    </div>
                    <span
                      className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold ${
                        pendingImport.conflict
                          ? 'border-starlight-gold/45 bg-starlight-gold/10 text-starlight-ink'
                          : 'border-starlight-mint/45 bg-starlight-mint/10 text-starlight-mint'
                      }`}
                      data-testid="import-preview-conflict"
                    >
                      {pendingImport.conflict ? <TriangleAlert className="h-3.5 w-3.5" aria-hidden="true" /> : <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                      {pendingImport.conflict ? 'copy on import' : 'new canvas id'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="import-preview-counts">
                    {[
                      { label: 'Nodes', value: pendingImport.canvas.nodes.length },
                      { label: 'Artifacts', value: pendingImport.canvas.artifacts.length },
                      { label: 'Edges', value: pendingImport.canvas.edges.length },
                      { label: 'Runs', value: pendingImport.canvas.runs.length },
                    ].map((item) => (
                      <div key={item.label} className="rounded-md border border-starlight-border bg-starlight-bg/80 p-2">
                        <div className="text-[10px] uppercase text-starlight-muted">{item.label}</div>
                        <div className="mt-1 text-sm font-semibold text-starlight-ink">{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-md border border-starlight-border bg-starlight-bg/80 p-3 text-xs leading-5 text-starlight-muted" data-testid="import-preview-diff">
                    {pendingImport.conflict ? (
                      <>
                        Existing local canvas <span className="font-semibold text-starlight-ink">{pendingImport.conflict.title}</span> will be preserved. This import will create a copy with a fresh canvas id.
                      </>
                    ) : (
                      <>
                        This canvas id is not present in the local home. Import will preserve the portable canvas id.
                      </>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5" data-testid="import-preview-kinds">
                    {pendingImport.kindCounts.slice(0, 6).map((item) => (
                      <span key={item.kind} className="rounded-md border border-starlight-border bg-starlight-bg/70 px-2 py-1 text-[11px] text-starlight-muted">
                        <span className="font-semibold text-starlight-ink">{item.count}</span> {formatKind(item.kind)}
                      </span>
                    ))}
                    {!pendingImport.kindCounts.length ? (
                      <span className="rounded-md border border-starlight-border bg-starlight-bg/70 px-2 py-1 text-[11px] text-starlight-muted">0 nodes</span>
                    ) : null}
                  </div>
                  {pendingImport.nodePreview.length ? (
                    <div className="mt-3 space-y-1.5" data-testid="import-preview-nodes">
                      {pendingImport.nodePreview.map((node) => (
                        <div key={node.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-md border border-starlight-border bg-starlight-bg/70 px-2 py-1.5">
                          <span className="rounded border border-starlight-accent/30 px-1.5 py-0.5 text-[10px] text-starlight-accent">{formatKind(node.kind)}</span>
                          <span className="truncate text-[11px] text-starlight-ink">{node.title}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      data-testid="import-preview-cancel"
                      onClick={cancelImportPreview}
                      disabled={busy}
                      className="rounded-md border border-starlight-border px-3 py-2 text-xs font-semibold text-starlight-ink transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      data-testid="import-preview-confirm"
                      onClick={confirmImportCanvas}
                      disabled={busy}
                      className="rounded-md bg-starlight-ink px-3 py-2 text-xs font-semibold text-starlight-bg transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {pendingImport.conflict ? 'Import Copy' : 'Import Canvas'}
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            <div
              className="absolute bottom-3 left-3 top-auto z-30 flex max-w-[calc(100%-1.5rem)] flex-nowrap items-center gap-2 overflow-x-auto rounded-lg border border-starlight-border bg-starlight-surface/88 p-1.5 shadow-command backdrop-blur sm:bottom-4 sm:left-4 sm:max-w-[calc(100%-2rem)] sm:flex-wrap sm:overflow-visible sm:p-2"
              data-testid="canvas-command-tray"
            >
              <span className="hidden px-2 text-xs text-starlight-muted sm:inline">{canvas?.title ?? 'Loading canvas'}</span>
              <span className="shrink-0 rounded-md border border-starlight-border px-2 py-1 text-xs text-starlight-muted">
                {selectedIds.length ? `${selectedIds.length} selected` : `${canvas?.nodes.length ?? 0} nodes`}
              </span>
              <button
                type="button"
                data-testid="canvas-toolbar-source"
                onClick={() => requestComposerInput('source')}
                disabled={!canMutate}
                className="flex shrink-0 items-center gap-1 rounded-md border border-starlight-accent/45 bg-starlight-accent/10 px-2 py-1 text-xs font-semibold text-starlight-accent disabled:cursor-not-allowed disabled:opacity-40"
              >
                <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
                Source
              </button>
              <button
                type="button"
                data-testid="canvas-toolbar-paste"
                onClick={() => pasteClipboardToIntake('source')}
                disabled={!canMutate}
                className="flex shrink-0 items-center gap-1 rounded-md border border-starlight-border px-2 py-1 text-xs text-starlight-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
                Paste & Map
              </button>
              <label className={`flex shrink-0 items-center gap-1 rounded-md border border-starlight-border px-2 py-1 text-xs text-starlight-ink ${canMutate ? 'cursor-pointer hover:border-starlight-accent' : 'cursor-not-allowed opacity-45'}`}>
                <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                File
                <input
                  data-testid="canvas-toolbar-file-source"
                  type="file"
                  aria-label="Upload source to canvas"
                  multiple
                  accept={SOURCE_FILE_ACCEPT}
                  disabled={!canMutate}
                  onChange={(event) => {
                    void ingestFiles(Array.from(event.currentTarget.files ?? []));
                    event.currentTarget.value = '';
                  }}
                  className="sr-only"
                />
              </label>
              <button type="button" onClick={() => addCanvasNoteAt()} disabled={!canMutate} className="flex shrink-0 items-center gap-1 rounded-md border border-starlight-gold/45 bg-starlight-gold/10 px-2 py-1 text-xs font-semibold text-starlight-ink disabled:cursor-not-allowed disabled:opacity-40">
                <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
                Note
              </button>
              <button
                type="button"
                data-testid="canvas-toolbar-ask"
                onClick={() => requestComposerInput('ask')}
                disabled={!canMutate}
                className="flex shrink-0 items-center gap-1 rounded-md border border-starlight-violet/45 bg-starlight-violet/10 px-2 py-1 text-xs font-semibold text-starlight-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Ask
              </button>
              <select
                aria-label="Connection kind"
                value={edgeKind}
                onChange={(event) => setEdgeKind(event.target.value as CanvasEdgeKind)}
                className="max-w-[132px] shrink-0 rounded-md border border-starlight-border bg-starlight-surface px-2 py-1 text-xs text-starlight-ink"
              >
                {EDGE_KINDS.map((kind) => (
                  <option key={kind.id} value={kind.id}>{kind.label}</option>
                ))}
              </select>
              <button
                type="button"
                data-testid="canvas-toolbar-connect"
                onClick={connectSelected}
                disabled={!canMutate || selectedIds.length < 2}
                className="flex shrink-0 items-center gap-1 rounded-md border border-starlight-border px-2 py-1 text-xs text-starlight-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Connect</span>
              </button>
              <a aria-label="Export JSON" href={canvas ? `/api/canvases/${canvas.id}/export?format=json${selectedExportQuery}` : '#'} className="flex shrink-0 items-center gap-1 rounded-md border border-starlight-border px-2 py-1 text-xs text-starlight-ink">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                JSON
              </a>
              <a aria-label="Export Markdown" href={canvas ? `/api/canvases/${canvas.id}/export?format=markdown${selectedExportQuery}` : '#'} className="flex shrink-0 items-center gap-1 rounded-md border border-starlight-border px-2 py-1 text-xs text-starlight-ink">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                MD
              </a>
              <button type="button" data-testid="copy-context" onClick={copyCanvasContext} disabled={!canvas || busy} className="flex shrink-0 items-center gap-1 rounded-md border border-starlight-border px-2 py-1 text-xs text-starlight-ink disabled:cursor-not-allowed disabled:opacity-40">
                <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
                Context
              </button>
              <button type="button" data-testid="copy-codex-handoff" onClick={copyCodexHandoff} disabled={!canvas || busy} className="flex shrink-0 items-center gap-1 rounded-md border border-starlight-gold/45 bg-starlight-gold/10 px-2 py-1 text-xs font-semibold text-starlight-ink disabled:cursor-not-allowed disabled:opacity-40">
                <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                Codex
              </button>
              <button type="button" data-testid="load-demo-canvas-toolbar" onClick={loadDemoCanvas} disabled={busy} className="flex shrink-0 items-center gap-1 rounded-md border border-starlight-gold/45 bg-starlight-gold/10 px-2 py-1 text-xs font-semibold text-starlight-ink disabled:cursor-not-allowed disabled:opacity-40">
                <LayoutTemplate className="h-3.5 w-3.5" aria-hidden="true" />
                Demo
              </button>
              <label className={`flex shrink-0 items-center gap-1 rounded-md border border-starlight-border px-2 py-1 text-xs text-starlight-ink ${canMutate ? 'cursor-pointer hover:border-starlight-accent' : 'cursor-not-allowed opacity-45'}`}>
                <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                Import
                <input
                  data-testid="import-canvas-file"
                  type="file"
                  accept="application/json,.json"
                  disabled={!canMutate}
                  onChange={(event) => {
                    void prepareImportCanvasFile(event.currentTarget.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                  className="sr-only"
                />
              </label>
            </div>
            <div className="absolute inset-0">
              {shouldShowCanvasIntakeTarget ? (
                <div className="absolute left-1/2 top-[54%] z-10 hidden w-[min(560px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-starlight-accent/25 bg-starlight-surface/88 p-5 text-center shadow-command backdrop-blur md:block" data-testid="empty-canvas-actions">
                  <UploadCloud className="mx-auto h-7 w-7 text-starlight-accent" aria-hidden="true" />
                  <h2 className="mt-3 text-base font-semibold text-starlight-ink">
                    {canvas?.nodes.length ? 'Add your first source' : 'Paste, drop, or upload context here'}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-starlight-muted">
                    YouTube, video links, images, URLs, PDFs, transcripts, markdown, and raw notes become source nodes, chunks, citations, and Codex-readable context.
                  </p>
                  <div className="mt-3 grid grid-cols-4 gap-1.5 text-[10px]" data-testid="canvas-intake-contract">
                    {[
                      { label: 'Video', detail: 'transcript or notes' },
                      { label: 'Web', detail: 'readable source' },
                      { label: 'File', detail: 'PDF / image / text' },
                      { label: 'Note', detail: 'human context' },
                    ].map((item) => (
                      <div key={item.label} className="min-w-0 rounded-md border border-starlight-border bg-starlight-bg/72 px-2 py-1.5">
                        <span className="block truncate font-semibold text-starlight-ink">{item.label}</span>
                        <span className="block truncate text-starlight-muted">{item.detail}</span>
                      </div>
                    ))}
                  </div>
                  <textarea
                    data-testid="empty-intake-text"
                    value={intakeText}
                    onFocus={() => setComposerMode('source')}
                    onChange={(event) => {
                      setComposerMode('source');
                      setIntakeText(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
                        event.preventDefault();
                        void submitCanvasIntake();
                      }
                    }}
                    className="mt-4 min-h-20 w-full resize-none rounded-md border border-starlight-accent/35 bg-starlight-bg/88 px-3 py-2 text-left text-sm leading-5 text-starlight-ink"
                    placeholder="Paste a YouTube link, video URL, screenshot notes, PDF text, or raw idea"
                  />
                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <button
                      type="button"
                      disabled={composerActionDisabled}
                      onClick={submitActiveComposer}
                      className="flex items-center justify-center gap-2 rounded-md bg-starlight-ink px-3 py-2 text-sm font-semibold text-starlight-bg transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      {composerPrimaryIcon(composerMode, intakeAction)}
                      {composerButtonLabel(composerMode, intakeAction)}
                    </button>
                    <button
                      type="button"
                      disabled={!canMutate}
                      onClick={() => addCanvasNoteAt({ x: 120, y: 140 })}
                      className="flex items-center justify-center gap-2 rounded-md border border-starlight-gold/45 bg-starlight-gold/10 px-3 py-2 text-sm font-semibold text-starlight-ink transition hover:border-starlight-gold disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                      Note
                    </button>
                    <label className={`flex items-center justify-center gap-2 rounded-md border border-starlight-accent/45 bg-starlight-accent/10 px-3 py-2 text-sm font-semibold text-starlight-accent transition hover:border-starlight-accent ${canMutate ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'}`}>
                      <FileUp className="h-4 w-4" aria-hidden="true" />
                      Upload
                      <input
                        data-testid="empty-upload-source"
                        type="file"
                        multiple
                        accept={SOURCE_FILE_ACCEPT}
                        disabled={!canMutate}
                        onChange={(event) => {
                          const files = Array.from(event.currentTarget.files ?? []);
                          event.currentTarget.value = '';
                          void ingestFiles(files, { x: 120, y: 140 });
                        }}
                        className="sr-only"
                      />
                    </label>
                  </div>
                </div>
              ) : null}
              <ReactFlow
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={nodeTypes}
                onNodesChange={onNodesChange}
                onSelectionChange={onSelectionChange}
                onNodeDragStop={persistNodePosition}
                onConnect={connectFlow}
                onDrop={onDrop}
                onDragOver={onDragOver}
                fitView
                fitViewOptions={{ padding: compactCanvas ? 0.18 : 0.2, maxZoom: 1.1 }}
                minZoom={compactCanvas ? 0.5 : 0.55}
                maxZoom={2}
                nodesConnectable
                onlyRenderVisibleElements
                proOptions={{ hideAttribution: true }}
              >
                <Background color="#6EA8FE22" gap={48} size={1} />
                <Controls />
                <MiniMap
                  className="hidden lg:block"
                  pannable
                  zoomable
                  bgColor="rgba(10, 12, 20, 0.92)"
                  maskColor="rgba(5, 6, 10, 0.72)"
                  nodeColor={(node) => KIND_STYLE[(node.data as AgentNodeData).kind].accent}
                />
              </ReactFlow>
            </div>
          </section>

          <aside className="order-3 border-t border-starlight-border bg-starlight-surface/78 p-4 lg:order-none lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
            <section className="rounded-lg border border-starlight-border bg-starlight-panel/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-starlight-accent" aria-hidden="true" />
                Action Drawer
              </div>
              <div className="mt-3 rounded-md border border-starlight-accent/25 bg-starlight-accent/10 p-3" data-testid="selected-context">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold text-starlight-ink">
                    {selectedNodes.length ? `${selectedNodes.length} node context` : 'Whole canvas context'}
                  </span>
                  <span className="text-[11px] text-starlight-muted">{selectedNodes.length ? selectedChars : canvas?.nodes.reduce((total, node) => total + node.body.length, 0) ?? 0} chars</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {(selectedNodes.length ? selectedNodes : canvas?.nodes.slice(0, 4) ?? []).map((node) => (
                    <button
                      key={node.id}
                      type="button"
                      onClick={() => {
                        setSelectedIds([node.id]);
                        setCenter(node.position.x + 130, node.position.y + 80, { zoom: compactCanvas ? 0.72 : 1, duration: 350 });
                      }}
                      className="max-w-full truncate rounded-md border border-starlight-border bg-starlight-surface px-2 py-1 text-[11px] text-starlight-muted transition hover:border-starlight-accent hover:text-starlight-ink"
                    >
                      {node.title}
                    </button>
                  ))}
                  {!canvas?.nodes.length ? <span className="text-[11px] text-starlight-muted">No context yet.</span> : null}
                </div>
              </div>
              <div className="mt-3 rounded-md border border-starlight-mint/30 bg-starlight-mint/10 p-3" data-testid="intake-trace-panel">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-starlight-ink">
                      <ClipboardPaste className="h-3.5 w-3.5 text-starlight-mint" aria-hidden="true" />
                      Latest intake trace
                    </div>
                    <p className="mt-1 truncate text-[11px] text-starlight-muted" data-testid="intake-trace-summary">
                      {latestTrace ? latestTrace.inputSummary : 'Paste, drop, or upload anything to create source nodes.'}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-md border border-starlight-mint/35 bg-starlight-bg px-2 py-1 text-[10px] font-semibold text-starlight-mint" data-testid="intake-trace-count">
                    {latestTrace ? `${latestTrace.nodeIds.length} node${latestTrace.nodeIds.length === 1 ? '' : 's'}` : 'empty'}
                  </span>
                </div>
                {latestTrace ? (
                  <>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-[10px]" data-testid="intake-trace-stats">
                      <div className="rounded-md border border-starlight-border bg-starlight-bg/80 p-2">
                        <div className="uppercase text-starlight-muted">Ready</div>
                        <div className="mt-1 font-semibold text-starlight-ink">{intakeTraceReadyCount(latestTrace)} / {latestTrace.items.length}</div>
                      </div>
                      <div className="rounded-md border border-starlight-border bg-starlight-bg/80 p-2">
                        <div className="uppercase text-starlight-muted">Kinds</div>
                        <div className="mt-1 truncate font-semibold text-starlight-ink">{latestTrace.detectedKinds.map(formatKind).join(', ')}</div>
                      </div>
                      <div className="rounded-md border border-starlight-border bg-starlight-bg/80 p-2">
                        <div className="uppercase text-starlight-muted">Scope</div>
                        <div className="mt-1 font-semibold text-starlight-ink">{latestTraceExportIds.length} handoff</div>
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5" data-testid="intake-trace-items">
                      {latestTrace.items.slice(0, 5).map((item) => (
                        <button
                          key={`${latestTrace.id}-${item.nodeId ?? item.title}`}
                          type="button"
                          disabled={!item.nodeId}
                          onClick={() => {
                            const target = canvas?.nodes.find((node) => node.id === item.nodeId);
                            if (target) focusNode(target, latestTrace.nodeIds);
                          }}
                          className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-md border border-starlight-border bg-starlight-bg/80 px-2 py-1 text-[10px] text-starlight-muted transition hover:border-starlight-mint hover:text-starlight-ink disabled:cursor-default disabled:opacity-60"
                          title={item.readinessLabel ?? item.title}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${item.readinessStatus === 'ready' ? 'bg-starlight-mint' : item.readinessStatus === 'reference_only' ? 'bg-starlight-gold' : 'bg-starlight-muted'}`} aria-hidden="true" />
                          <span className="shrink-0 font-semibold text-starlight-ink">{formatKind(item.kind)}</span>
                          <span className="truncate">{item.title}</span>
                        </button>
                      ))}
                      {latestTrace.items.length > 5 ? (
                        <span className="rounded-md border border-starlight-border bg-starlight-bg/80 px-2 py-1 text-[10px] text-starlight-muted">
                          +{latestTrace.items.length - 5} more
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        data-testid="intake-trace-inspect"
                        onClick={() => focusIntakeTrace(latestTrace)}
                        className="flex items-center justify-center gap-1.5 rounded-md border border-starlight-border bg-starlight-bg/80 px-2 py-2 text-[11px] font-semibold text-starlight-ink transition hover:border-starlight-mint"
                      >
                        <Crosshair className="h-3.5 w-3.5" aria-hidden="true" />
                        Inspect
                      </button>
                      <button
                        type="button"
                        data-testid="intake-trace-context"
                        disabled={busy}
                        onClick={() => void copyIntakeTraceExport(latestTrace, 'context')}
                        className="flex items-center justify-center gap-1.5 rounded-md border border-starlight-border bg-starlight-bg/80 px-2 py-2 text-[11px] font-semibold text-starlight-ink transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
                        Context
                      </button>
                      <button
                        type="button"
                        data-testid="intake-trace-codex"
                        disabled={busy}
                        onClick={() => void copyIntakeTraceExport(latestTrace, 'codex')}
                        className="flex items-center justify-center gap-1.5 rounded-md border border-starlight-gold/45 bg-starlight-gold/10 px-2 py-2 text-[11px] font-semibold text-starlight-ink transition hover:border-starlight-gold disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                        Codex
                      </button>
                    </div>
                    {recentIntakeTraces.length > 1 ? (
                      <div className="mt-2 space-y-1.5" data-testid="intake-trace-history">
                        {recentIntakeTraces.slice(1).map((trace) => (
                          <button
                            key={trace.id}
                            type="button"
                            onClick={() => focusIntakeTrace(trace)}
                            className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2 rounded-md border border-starlight-border bg-starlight-bg/72 px-2 py-1.5 text-left text-[10px] text-starlight-muted transition hover:border-starlight-mint hover:text-starlight-ink"
                          >
                            <span className="truncate">{trace.inputSummary || trace.sourceLabel}</span>
                            <span>{trace.nodeIds.length} node{trace.nodeIds.length === 1 ? '' : 's'}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="intake-trace-start"
                      disabled={!canMutate}
                      onClick={() => requestComposerInput('source')}
                      className="flex items-center justify-center gap-1.5 rounded-md border border-starlight-accent/40 bg-starlight-accent/10 px-2 py-2 text-[11px] font-semibold text-starlight-accent transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
                      Add source
                    </button>
                    <label className={`flex items-center justify-center gap-1.5 rounded-md border border-starlight-border bg-starlight-bg/80 px-2 py-2 text-[11px] font-semibold text-starlight-ink transition hover:border-starlight-mint ${canMutate ? 'cursor-pointer' : 'cursor-not-allowed opacity-45'}`}>
                      <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                      Upload
                      <input
                        type="file"
                        multiple
                        accept={SOURCE_FILE_ACCEPT}
                        disabled={!canMutate}
                        onChange={(event) => {
                          const files = Array.from(event.currentTarget.files ?? []);
                          event.currentTarget.value = '';
                          void ingestFiles(files);
                        }}
                        className="sr-only"
                      />
                    </label>
                  </div>
                )}
              </div>
              <p className="mt-2 text-xs leading-5 text-starlight-muted">
                Runs are local and deterministic in v0.1. Select nodes to scope an action, or leave empty to use the canvas.
              </p>
              {contextGaps.length ? (
                <div className="mt-3 rounded-md border border-starlight-gold/35 bg-starlight-gold/10 p-3" data-testid="context-gaps">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-starlight-ink">
                        <TriangleAlert className="h-3.5 w-3.5 text-starlight-gold" aria-hidden="true" />
                        Context gaps
                      </div>
                      <p className="mt-1 text-[11px] leading-5 text-starlight-muted">
                        These sources are saved, but need transcript, OCR, notes, claims, or excerpts before deep Ask/Codex work.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md border border-starlight-gold/35 bg-starlight-bg px-2 py-1 text-[10px] font-semibold text-starlight-gold">
                      {contextGaps.length} open
                    </span>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {contextGaps.map(({ node, readiness }) => (
                      <div
                        key={node.id}
                        className="grid gap-2 rounded-md border border-starlight-border bg-starlight-bg/80 p-2"
                        data-testid="context-gap-item"
                      >
                        <button
                          type="button"
                          onClick={() => focusContextGap(node)}
                          className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-2 text-left transition hover:text-starlight-ink"
                          title={readiness.nextAction}
                        >
                          <span className={`mt-0.5 h-1.5 w-1.5 rounded-full ${readiness.status === 'needs_context' ? 'bg-starlight-gold' : 'bg-starlight-muted'}`} aria-hidden="true" />
                          <span className="min-w-0">
                            <span className="block truncate text-[11px] font-semibold text-starlight-ink">{node.title}</span>
                            <span className="mt-0.5 block truncate text-[10px] text-starlight-muted">{readiness.label}</span>
                          </span>
                        </button>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-md border border-starlight-border bg-starlight-surface px-2 py-1 text-[10px] text-starlight-muted">
                            {readiness.evidence.chunks} chunks
                          </span>
                          <span className="rounded-md border border-starlight-border bg-starlight-surface px-2 py-1 text-[10px] text-starlight-muted">
                            {formatKind(readiness.evidence.ingest)}
                          </span>
                          <button
                            type="button"
                            data-testid="context-gap-attach"
                            onClick={() => focusContextGap(node)}
                            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-starlight-gold/45 bg-starlight-gold/10 px-2 py-1 text-[10px] font-semibold text-starlight-ink transition hover:border-starlight-gold"
                          >
                            <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
                            Attach context
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {contextScope ? (
                <div className="mt-3 rounded-md border border-starlight-gold/35 bg-starlight-gold/10 p-3" data-testid="codex-export-preview">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-starlight-ink">
                      <Bot className="h-3.5 w-3.5 text-starlight-gold" aria-hidden="true" />
                      Codex export preview
                    </span>
                    <span className="rounded-md border border-starlight-gold/35 bg-starlight-bg px-2 py-1 text-[10px] font-semibold uppercase text-starlight-gold" data-testid="codex-export-mode">
                      {contextScope.mode === 'selection' ? 'selected' : 'canvas'}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2" data-testid="codex-export-counts">
                    {[
                      { label: 'Nodes', value: contextScope.nodes.length },
                      { label: 'Sources', value: contextScope.sourceCount },
                      { label: 'Chunks', value: contextScope.chunkCount },
                      { label: 'Edges', value: contextScope.edgeCount },
                      { label: 'Runs', value: contextScope.runCount },
                      { label: 'Chars', value: contextScope.charCount.toLocaleString() },
                    ].map((item) => (
                      <div key={item.label} className="rounded-md border border-starlight-border bg-starlight-bg/80 p-2">
                        <div className="text-[10px] uppercase text-starlight-muted">{item.label}</div>
                        <div className="mt-1 truncate text-xs font-semibold text-starlight-ink">{item.value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 space-y-1.5" data-testid="codex-export-nodes">
                    {contextScope.nodes.slice(0, 5).map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => {
                          const target = canvas?.nodes.find((candidate) => candidate.id === node.id);
                          if (target) focusNode(target);
                        }}
                        className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-md border border-starlight-border bg-starlight-bg/80 px-2 py-1.5 text-left transition hover:border-starlight-gold/70"
                      >
                        <span className="rounded border border-starlight-gold/35 px-1.5 py-0.5 text-[10px] text-starlight-gold">{formatKind(node.kind)}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[11px] font-semibold text-starlight-ink">{node.title}</span>
                          <span className="block truncate font-mono text-[10px] text-starlight-muted">{node.id}</span>
                        </span>
                      </button>
                    ))}
                    {contextScope.nodes.length > 5 ? (
                      <div className="rounded-md border border-starlight-border bg-starlight-bg/80 px-2 py-1.5 text-[11px] text-starlight-muted">
                        +{contextScope.nodes.length - 5} more included node(s)
                      </div>
                    ) : null}
                    {!contextScope.nodes.length ? (
                      <div className="rounded-md border border-starlight-border bg-starlight-bg/80 px-2 py-1.5 text-[11px] text-starlight-muted">
                        No mapped context yet.
                      </div>
                    ) : null}
                  </div>
                  <div className="mt-3 rounded-md border border-starlight-border bg-starlight-bg/80 p-2 text-[11px] leading-5 text-starlight-muted" data-testid="codex-export-rules">
                    {contextScope.mode === 'selection' ? (
                      <div className="mb-1 font-semibold text-starlight-ink">
                        Excludes {contextScope.excludedNodeCount} other node(s){contextScope.nearbyNodeCount ? `; ${contextScope.nearbyNodeCount} connected neighbor(s) stay out unless selected` : ''}.
                      </div>
                    ) : null}
                    {contextScope.rules.map((rule) => (
                      <div key={rule}>{rule}</div>
                    ))}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      data-testid="codex-preview-context"
                      disabled={!canvas || busy}
                      onClick={copyCanvasContext}
                      className="flex items-center justify-center gap-1.5 rounded-md border border-starlight-border bg-starlight-bg/80 px-2 py-2 text-[11px] font-semibold text-starlight-ink transition hover:border-starlight-gold disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
                      Context
                    </button>
                    <button
                      type="button"
                      data-testid="codex-preview-handoff"
                      disabled={!canvas || busy}
                      onClick={copyCodexHandoff}
                      className="flex items-center justify-center gap-1.5 rounded-md border border-starlight-gold/45 bg-starlight-gold/10 px-2 py-2 text-[11px] font-semibold text-starlight-ink transition hover:border-starlight-gold disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                      Codex
                    </button>
                  </div>
                </div>
              ) : null}
              <div className="mt-3 rounded-md border border-starlight-border bg-starlight-surface/70 p-3" data-testid="workflow-map">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-starlight-ink">
                    <GitBranch className="h-3.5 w-3.5 text-starlight-accent" aria-hidden="true" />
                    Workflow map
                  </span>
                  <span className="rounded-md border border-starlight-border bg-starlight-bg px-2 py-1 text-[10px] text-starlight-muted">
                    {workflowMap.length} steps
                  </span>
                </div>
                <div className="mt-3 space-y-1.5">
                  {workflowMap.map((step, index) => (
                    <button
                      key={`${step.label}-${index}`}
                      type="button"
                      disabled={!step.node}
                      onClick={() => focusNode(step.node)}
                      className="grid w-full grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-md border border-starlight-border bg-starlight-bg/80 p-2 text-left transition hover:border-starlight-accent/60 disabled:cursor-default disabled:opacity-75"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded border border-starlight-accent/35 bg-starlight-accent/10 text-[10px] font-semibold text-starlight-accent">
                        {index + 1}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[11px] font-semibold text-starlight-ink">{step.label}</span>
                        <span className="mt-0.5 block truncate text-[10px] text-starlight-muted">{step.detail}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 rounded-md border border-starlight-border bg-starlight-surface/70 p-3" data-testid="handoff-readiness">
                <div className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-starlight-ink">
                    <Bot className="h-3.5 w-3.5 text-starlight-gold" aria-hidden="true" />
                    Handoff readiness
                  </span>
                  <span className="rounded-md border border-starlight-border bg-starlight-bg px-2 py-1 text-[10px] text-starlight-muted">
                    {selectedIds.length ? 'selected' : 'canvas'}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {handoffReadiness.map((step) => (
                    <div key={step.label} className="rounded-md border border-starlight-border bg-starlight-bg/80 p-2">
                      <div className="flex items-center gap-1.5">
                        {step.ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-starlight-mint" aria-hidden="true" />
                        ) : (
                          <TriangleAlert className="h-3.5 w-3.5 text-starlight-gold" aria-hidden="true" />
                        )}
                        <span className="text-[11px] font-semibold text-starlight-ink">{step.label}</span>
                      </div>
                      <div className="mt-1 truncate text-[10px] text-starlight-muted">{step.detail}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    data-testid="handoff-readiness-source"
                    disabled={!canMutate}
                    onClick={() => requestComposerInput('source')}
                    className="flex items-center justify-center gap-1.5 rounded-md border border-starlight-accent/40 bg-starlight-accent/10 px-2 py-2 text-[11px] font-semibold text-starlight-accent transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
                    Add evidence
                  </button>
                  <button
                    type="button"
                    data-testid="handoff-readiness-codex"
                    disabled={!canvas || busy}
                    onClick={copyCodexHandoff}
                    className="flex items-center justify-center gap-1.5 rounded-md border border-starlight-gold/45 bg-starlight-gold/10 px-2 py-2 text-[11px] font-semibold text-starlight-ink transition hover:border-starlight-gold disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                    Codex handoff
                  </button>
                </div>
              </div>
              <textarea
                data-testid="ask-prompt"
                value={askPrompt}
                onChange={(event) => setAskPrompt(event.target.value)}
                className="mt-3 min-h-20 w-full rounded-md border border-starlight-border bg-starlight-surface px-3 py-2 text-sm leading-6"
                placeholder="Ask across selected nodes or the whole canvas"
              />
              <button
                data-testid="ask-canvas"
                type="button"
                disabled={!canMutate}
                onClick={askCanvas}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-starlight-accent px-3 py-2 text-sm font-semibold text-[#05060A] transition hover:bg-[#8CBAFF] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Ask Canvas
              </button>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={!canMutate}
                    onClick={() => runAction(action.id)}
                    className="flex items-center justify-center gap-2 rounded-md border border-starlight-accent/35 bg-starlight-accent/10 px-3 py-2 text-xs font-semibold text-starlight-accent transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                    {action.label}
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-4 rounded-lg border border-starlight-border bg-starlight-panel/70 p-4" data-testid="inspector">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Braces className="h-4 w-4 text-starlight-violet" aria-hidden="true" />
                Inspector
              </div>
              {selectedNode ? (
                <div className="mt-3 space-y-3">
                  <div>
                    <span className="text-[11px] text-starlight-muted">{formatKind(selectedNode.kind)}</span>
                    <input
                      data-testid="inspector-title"
                      value={editTitle}
                      onChange={(event) => setEditTitle(event.target.value)}
                      className="mt-1 w-full rounded-md border border-starlight-border bg-starlight-surface px-3 py-2 text-sm font-semibold text-starlight-ink"
                      placeholder="Node title"
                    />
                  </div>
                  <div className="rounded-md border border-starlight-mint/25 bg-starlight-mint/10 p-3" data-testid="source-receipt">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-xs font-semibold text-starlight-mint">Context receipt</div>
                        <div className="mt-1 text-[11px] text-starlight-muted">
                          {selectedArtifact ? selectedArtifact.title : selectedNode.title}
                        </div>
                      </div>
                      <span className="rounded-md border border-starlight-mint/35 bg-starlight-bg px-2 py-1 text-[10px] font-semibold text-starlight-mint">
                        {selectedArtifact ? 'artifact linked' : 'node body'}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-md border border-starlight-border bg-starlight-surface p-2">
                        <div className="text-[10px] uppercase text-starlight-muted">Kind</div>
                        <div className="mt-1 truncate text-xs font-semibold text-starlight-ink" data-testid="source-receipt-kind">
                          {selectedArtifact?.kind ?? formatKind(selectedNode.kind)}
                        </div>
                      </div>
                      <div className="rounded-md border border-starlight-border bg-starlight-surface p-2">
                        <div className="text-[10px] uppercase text-starlight-muted">Ingest</div>
                        <div className="mt-1 truncate text-xs font-semibold text-starlight-ink" data-testid="source-receipt-ingest">
                          {formatKind(selectedIngest)}
                        </div>
                      </div>
                      <div className="rounded-md border border-starlight-border bg-starlight-surface p-2">
                        <div className="text-[10px] uppercase text-starlight-muted">Chunks</div>
                        <div className="mt-1 text-xs font-semibold text-starlight-ink" data-testid="source-receipt-chunks">
                          {selectedChunkCount}{selectedPageCount ? ` / ${selectedPageCount} pages` : ''}
                        </div>
                      </div>
                      <div className="rounded-md border border-starlight-border bg-starlight-surface p-2">
                        <div className="text-[10px] uppercase text-starlight-muted">Chars</div>
                        <div className="mt-1 text-xs font-semibold text-starlight-ink" data-testid="source-receipt-chars">
                          {selectedArtifactChars.toLocaleString()}
                        </div>
                      </div>
                    </div>
                    {selectedSource ? (
                      <div className="mt-2 truncate rounded-md border border-starlight-border bg-starlight-bg px-2 py-1.5 text-[11px] text-starlight-mint" data-testid="source-receipt-source">
                        {selectedSource}
                      </div>
                    ) : null}
                    {selectedReadiness ? (
                      <div
                        className={`mt-2 rounded-md border p-2.5 ${sourceReadinessTone(selectedReadiness.status).panel}`}
                        data-testid="source-readiness"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase text-starlight-muted">Source readiness</div>
                            <div className="mt-1 text-xs font-semibold text-starlight-ink" data-testid="source-readiness-label">
                              {selectedReadiness.label}
                            </div>
                          </div>
                          <span
                            className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-semibold ${sourceReadinessTone(selectedReadiness.status).badge}`}
                            data-testid="source-readiness-state"
                          >
                            {sourceReadinessTone(selectedReadiness.status).icon}
                            {selectedReadiness.canRunActions ? 'Actions ready' : 'Needs context'}
                          </span>
                        </div>
                        <p className="mt-2 text-[11px] leading-5 text-starlight-muted" data-testid="source-readiness-detail">
                          {selectedReadiness.detail}
                        </p>
                        <p className="mt-1 text-[11px] leading-5 text-starlight-ink" data-testid="source-readiness-next">
                          {selectedReadiness.nextAction}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-starlight-muted" data-testid="source-readiness-evidence">
                          <span className="rounded-md border border-starlight-border bg-starlight-bg px-2 py-1">
                            {selectedReadiness.evidence.usableChars.toLocaleString()} usable chars
                          </span>
                          <span className="rounded-md border border-starlight-border bg-starlight-bg px-2 py-1">
                            {selectedReadiness.evidence.chunks} chunks
                          </span>
                          <span className="rounded-md border border-starlight-border bg-starlight-bg px-2 py-1">
                            {formatKind(selectedReadiness.evidence.ingest)}
                          </span>
                        </div>
                      </div>
                    ) : null}
                    {canEnrichSelectedSource ? (
                      <div className="mt-2 rounded-md border border-starlight-accent/30 bg-starlight-accent/10 p-3" data-testid="source-enrichment">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <div className="text-xs font-semibold text-starlight-accent">Attach context</div>
                            <p className="mt-1 text-[11px] leading-5 text-starlight-muted">
                              Add transcript, OCR, notes, or claims to make this source usable by actions and MCP.
                            </p>
                          </div>
                          <button
                            type="button"
                            data-testid="source-enrichment-paste"
                            onClick={pasteClipboardToEnrichment}
                            disabled={!canMutate}
                            className="inline-flex items-center gap-1.5 rounded-md border border-starlight-border bg-starlight-bg px-2 py-1 text-[10px] font-semibold text-starlight-ink transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <ClipboardPaste className="h-3.5 w-3.5" aria-hidden="true" />
                            Paste
                          </button>
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-1.5" data-testid="source-enrichment-kind">
                          {ENRICHMENT_KINDS.map((kind) => (
                            <button
                              key={kind.id}
                              type="button"
                              onClick={() => setEnrichmentKind(kind.id)}
                              className={`rounded-md border px-2 py-1.5 text-left text-[10px] transition ${
                                enrichmentKind === kind.id
                                  ? 'border-starlight-accent bg-starlight-accent/15 text-starlight-ink'
                                  : 'border-starlight-border bg-starlight-bg text-starlight-muted hover:border-starlight-accent/60'
                              }`}
                              aria-pressed={enrichmentKind === kind.id}
                            >
                              <span className="block font-semibold">{kind.label}</span>
                              <span className="mt-0.5 block truncate">{kind.detail}</span>
                            </button>
                          ))}
                        </div>
                        <textarea
                          data-testid="source-enrichment-body"
                          value={enrichmentBody}
                          onChange={(event) => setEnrichmentBody(event.target.value)}
                          className="mt-3 min-h-24 w-full rounded-md border border-starlight-border bg-starlight-bg px-3 py-2 text-xs leading-5 text-starlight-ink"
                          placeholder={enrichmentPlaceholder(enrichmentKind, selectedNode)}
                        />
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            data-testid="source-enrichment-attach"
                            onClick={attachSourceContext}
                            disabled={!canMutate || !enrichmentBody.trim()}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-md bg-starlight-accent px-3 py-2 text-xs font-semibold text-[#05060A] transition hover:bg-[#8CBAFF] disabled:cursor-not-allowed disabled:opacity-45"
                          >
                            <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
                            Attach Context
                          </button>
                          <span className="text-[10px] text-starlight-muted">
                            Chunks rebuild for search, Ask, export, and Codex.
                          </span>
                        </div>
                      </div>
                    ) : null}
                    {selectedImageSrc ? (
                      <div className="mt-2 overflow-hidden rounded-md border border-starlight-border bg-starlight-bg" data-testid="source-image-preview">
                        <img
                          src={selectedImageSrc}
                          alt={`Preview for ${selectedNode.title}`}
                          className="max-h-56 w-full object-contain"
                          loading="lazy"
                        />
                      </div>
                    ) : null}
                    {selectedChunkPreviews.length ? (
                      <div className="mt-2 space-y-1.5" data-testid="source-chunk-preview">
                        {selectedChunkPreviews.map((chunk) => (
                          <div
                            key={chunk.id}
                            className={`rounded-md border p-2 ${
                              chunk.id === focusedChunkId
                                ? 'border-starlight-mint/60 bg-starlight-mint/10'
                                : 'border-starlight-border bg-starlight-bg'
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2 text-[10px] font-semibold text-starlight-mint">
                              <span className="truncate">{chunk.id}</span>
                              {chunk.id === focusedChunkId ? <span className="shrink-0 text-starlight-ink">focused</span> : null}
                            </div>
                            <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-starlight-muted">{chunk.text}</p>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        data-testid="selected-source-summary"
                        type="button"
                        disabled={!canMutate}
                        onClick={() => runAction('summarize', '', [selectedNode.id])}
                        className="flex items-center justify-center gap-1.5 rounded-md border border-starlight-accent/40 bg-starlight-accent/10 px-2 py-2 text-[11px] font-semibold text-starlight-accent transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        Source summary
                      </button>
                      <button
                        data-testid="selected-source-claims"
                        type="button"
                        disabled={!canMutate}
                        onClick={() => runAction('extract_claims', '', [selectedNode.id])}
                        className="flex items-center justify-center gap-1.5 rounded-md border border-starlight-accent/40 bg-starlight-accent/10 px-2 py-2 text-[11px] font-semibold text-starlight-accent transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Braces className="h-3.5 w-3.5" aria-hidden="true" />
                        Extract claims
                      </button>
                      <button
                        data-testid="selected-source-ask"
                        type="button"
                        disabled={!canMutate}
                        onClick={askSelectedSource}
                        className="flex items-center justify-center gap-1.5 rounded-md border border-starlight-violet/40 bg-starlight-violet/10 px-2 py-2 text-[11px] font-semibold text-starlight-ink transition hover:border-starlight-violet disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                        Ask selected
                      </button>
                      <button
                        data-testid="selected-source-copy"
                        type="button"
                        disabled={!selectedNode}
                        onClick={copySelectedContext}
                        className="flex items-center justify-center gap-1.5 rounded-md border border-starlight-border bg-starlight-surface px-2 py-2 text-[11px] font-semibold text-starlight-ink transition hover:border-starlight-mint disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                        Copy source
                      </button>
                    </div>
                  </div>
                  <textarea
                    data-testid="inspector-body"
                    value={editBody}
                    onChange={(event) => setEditBody(event.target.value)}
                    className="min-h-44 w-full rounded-md border border-starlight-border bg-starlight-surface p-3 text-xs leading-5 text-starlight-ink"
                    placeholder="Node body"
                  />
                  <button
                    data-testid="save-node"
                    type="button"
                    onClick={saveSelectedNode}
                    disabled={!canMutate || !editTitle.trim()}
                    className="flex w-full items-center justify-center gap-2 rounded-md border border-starlight-violet/45 bg-starlight-violet/10 px-3 py-2 text-sm font-semibold text-starlight-ink transition hover:border-starlight-violet disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Braces className="h-4 w-4" aria-hidden="true" />
                    Save Node
                  </button>
                  <pre className="max-h-48 overflow-y-auto rounded-md border border-starlight-border bg-starlight-bg p-3 text-[11px] leading-5 text-starlight-muted">
                    {JSON.stringify(selectedNode.metadata, null, 2)}
                  </pre>
                  {selectedCitations.length ? (
                    <div className="rounded-md border border-starlight-mint/30 bg-starlight-mint/10 p-3">
                      <div className="text-xs font-semibold text-starlight-mint">Citations</div>
                      <div className="mt-2 space-y-2">
                        {selectedCitations.slice(0, 6).map((citation) => (
                          <button
                            key={citation.id}
                            data-testid="citation-focus"
                            type="button"
                            onClick={() => focusCitation(citation)}
                            className="block w-full rounded-md border border-starlight-border bg-starlight-surface p-2 text-left transition hover:border-starlight-mint/70 hover:bg-starlight-mint/5"
                          >
                            <span className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="font-semibold text-starlight-ink">{citation.id}</span>
                              <span className="inline-flex shrink-0 items-center gap-1 text-starlight-mint">
                                <Crosshair className="h-3 w-3" aria-hidden="true" />
                                Focus source
                              </span>
                            </span>
                            <span className="mt-1 block truncate text-[11px] text-starlight-muted">{citation.chunkId ?? citation.artifactId ?? citation.nodeId}</span>
                            {citation.source ? <span className="mt-1 block truncate text-[11px] text-starlight-mint">{citation.source}</span> : null}
                            <span className="mt-1 block line-clamp-3 text-xs leading-5 text-starlight-muted">{citation.quote}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-3 space-y-3">
                  <p className="text-xs leading-5 text-starlight-muted">Select a node to edit source metadata and body text, or create the first node directly.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => addCanvasNoteAt()} disabled={!canMutate} className="flex items-center justify-center gap-2 rounded-md border border-starlight-gold/45 bg-starlight-gold/10 px-3 py-2 text-xs font-semibold text-starlight-ink transition hover:border-starlight-gold disabled:cursor-not-allowed disabled:opacity-45">
                      <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
                      Add note
                    </button>
                    <button type="button" onClick={submitCanvasIntake} disabled={!canMutate} className="flex items-center justify-center gap-2 rounded-md border border-starlight-accent/45 bg-starlight-accent/10 px-3 py-2 text-xs font-semibold text-starlight-accent transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45">
                      <UploadCloud className="h-3.5 w-3.5" aria-hidden="true" />
                      Map source
                    </button>
                  </div>
                </div>
              )}
            </section>

            <section className="mt-4 rounded-lg border border-starlight-border bg-starlight-panel/70 p-4" data-testid="setup-panel">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Settings2 className="h-4 w-4 text-starlight-mint" aria-hidden="true" />
                  Setup / MCP
                </div>
                <span className="rounded-md border border-starlight-border bg-starlight-surface px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-starlight-muted">
                  local
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {setupChecks.length ? setupChecks.map((check) => (
                  <div key={check.label} className="rounded-md border border-starlight-border bg-starlight-surface p-2">
                    <div className="flex items-center gap-1.5">
                      {check.ok ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-starlight-mint" aria-hidden="true" />
                      ) : (
                        <TriangleAlert className="h-3.5 w-3.5 text-starlight-gold" aria-hidden="true" />
                      )}
                      <span className="truncate text-[11px] font-semibold text-starlight-ink">{check.label}</span>
                    </div>
                    <div className="mt-1 text-[10px] text-starlight-muted">{check.detail}</div>
                  </div>
                )) : (
                  <div className="col-span-2 rounded-md border border-starlight-border bg-starlight-surface p-3 text-xs text-starlight-muted">
                    Loading setup status...
                  </div>
                )}
              </div>
              {setupStatus ? (
                <>
                  <div className="mt-3 space-y-1.5 rounded-md border border-starlight-border bg-starlight-bg p-3 text-[11px] leading-5 text-starlight-muted">
                    <div className="truncate">Home: {shortPath(setupStatus.canvasHome)}</div>
                    <div className="truncate">MCP: {shortPath(setupStatus.mcp.cliPath)}</div>
                    <div className="truncate">Codex: {shortPath(setupStatus.codex.configPath)}</div>
                    <div className="truncate">Codex proof: {setupStatus.codex.smokeCommand}</div>
                  </div>
                  <div className="mt-3 rounded-md border border-starlight-border bg-starlight-surface/70 p-3" data-testid="activation-runway">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-starlight-ink">Activation runway</span>
                      <button
                        type="button"
                        data-testid="activation-copy-prompt"
                        onClick={() => copyCommand(setupStatus.activation.codexPrompt, 'Codex activation prompt')}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-starlight-violet/35 bg-starlight-violet/10 px-2 py-1 text-[10px] font-semibold text-starlight-ink transition hover:border-starlight-violet"
                      >
                        <Bot className="h-3 w-3" aria-hidden="true" />
                        Prompt
                      </button>
                    </div>
                    <div className="mt-3 space-y-1.5">
                      {activationRunway.map((step) => (
                        <div
                          key={step.id}
                          data-testid={`activation-step-${step.id}`}
                          className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 rounded-md border p-2 ${
                            step.ok ? 'border-starlight-mint/30 bg-starlight-mint/10' : 'border-starlight-border bg-starlight-bg'
                          }`}
                        >
                          <span className={`flex h-5 w-5 items-center justify-center rounded border text-[10px] font-semibold ${
                            step.ok ? 'border-starlight-mint/45 text-starlight-mint' : 'border-starlight-accent/35 text-starlight-accent'
                          }`}>
                            {step.ok ? <CheckCircle2 className="h-3 w-3" aria-hidden="true" /> : step.order}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[11px] font-semibold text-starlight-ink">{step.label}</span>
                            <span className="mt-0.5 block truncate text-[10px] text-starlight-muted">{step.detail}</span>
                          </span>
                          <button
                            type="button"
                            data-testid={`activation-action-${step.id}`}
                            disabled={busy || (step.id === 'handoff' && !canvas)}
                            onClick={() => runActivationStep(step)}
                            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-starlight-border bg-starlight-surface px-2 py-1 text-[10px] font-semibold text-starlight-muted transition hover:border-starlight-accent hover:text-starlight-ink disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {step.command ? <Copy className="h-3 w-3" aria-hidden="true" /> : step.id === 'proof' ? <LayoutTemplate className="h-3 w-3" aria-hidden="true" /> : <Play className="h-3 w-3" aria-hidden="true" />}
                            {step.command ? 'Copy' : step.id === 'proof' ? 'Demo' : step.id === 'context' ? 'Map' : step.id === 'handoff' ? 'Copy' : 'Run'}
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] text-starlight-muted">
                      <button type="button" onClick={() => copyCommand(setupStatus.activation.firstRunCheckCommand, 'first-run check command')} className="rounded-md border border-starlight-border bg-starlight-bg px-2 py-1 transition hover:border-starlight-accent hover:text-starlight-ink">
                        first-run check
                      </button>
                      <button type="button" onClick={() => copyCommand(setupStatus.activation.previewCommand, 'production preview command')} className="rounded-md border border-starlight-border bg-starlight-bg px-2 py-1 transition hover:border-starlight-accent hover:text-starlight-ink">
                        prod preview
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 rounded-md border border-starlight-mint/25 bg-starlight-mint/10 p-3" data-testid="first-success-contract">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-starlight-ink">
                        <ShieldCheck className="h-3.5 w-3.5 text-starlight-mint" aria-hidden="true" />
                        First success
                      </span>
                      <button
                        type="button"
                        data-testid="first-success-copy"
                        onClick={() => copyCommand(setupStatus.firstSuccess.contractCommand, 'first success contract command')}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-starlight-mint/35 bg-starlight-bg px-2 py-1 text-[10px] font-semibold text-starlight-ink transition hover:border-starlight-mint"
                      >
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        Contract
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      {setupStatus.firstSuccess.phases.map((phase, index) => (
                        <div
                          key={phase.id}
                          data-testid={`first-success-phase-${phase.id}`}
                          className="min-w-0 rounded-md border border-starlight-border bg-starlight-bg/85 p-2"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-starlight-mint/35 text-[9px] font-semibold text-starlight-mint">
                              {index + 1}
                            </span>
                            <span className="truncate text-[11px] font-semibold text-starlight-ink">{phase.label}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-starlight-muted">{phase.detail}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 rounded-md border border-starlight-border bg-starlight-bg/70 p-2" data-testid="first-success-input-contracts">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold uppercase text-starlight-muted">Input contracts</span>
                        <span className="rounded border border-starlight-mint/30 px-1.5 py-0.5 text-[9px] font-semibold text-starlight-mint">
                          {setupStatus.firstSuccess.inputContracts.length} ready
                        </span>
                      </div>
                      <div className="mt-2 grid gap-1.5">
                        {setupStatus.firstSuccess.inputContracts.map((contract) => (
                          <div
                            key={contract.id}
                            data-testid={`first-success-input-${contract.id}`}
                            className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 rounded-md border border-starlight-border bg-starlight-surface/70 p-2"
                          >
                            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border border-starlight-accent/35 text-starlight-accent">
                              {inputContractIcon(contract.id)}
                            </span>
                            <span className="min-w-0">
                              <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                                <span className="truncate text-[11px] font-semibold text-starlight-ink">{contract.input}</span>
                                <span className="rounded border border-starlight-border bg-starlight-bg px-1.5 py-0.5 font-mono text-[9px] text-starlight-muted">
                                  {contract.nodeKind}
                                </span>
                              </span>
                              <span className="mt-1 block line-clamp-2 text-[10px] leading-4 text-starlight-muted">{contract.output}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        data-testid="first-success-json"
                        onClick={() => copyCommand(setupStatus.firstSuccess.jsonCommand, 'first success JSON command')}
                        className="inline-flex items-center justify-center gap-1 rounded-md border border-starlight-border bg-starlight-bg px-2 py-1.5 text-[10px] font-semibold text-starlight-muted transition hover:border-starlight-mint hover:text-starlight-ink"
                      >
                        <Braces className="h-3 w-3" aria-hidden="true" />
                        JSON
                      </button>
                      <button
                        type="button"
                        data-testid="first-success-proof"
                        onClick={() => copyCommand(setupStatus.firstSuccess.proofCommands.join(' && '), 'first success proof commands')}
                        className="inline-flex items-center justify-center gap-1 rounded-md border border-starlight-border bg-starlight-bg px-2 py-1.5 text-[10px] font-semibold text-starlight-muted transition hover:border-starlight-mint hover:text-starlight-ink"
                      >
                        <Terminal className="h-3 w-3" aria-hidden="true" />
                        Proof
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 rounded-md border border-starlight-violet/25 bg-starlight-violet/10 p-3" data-testid="agent-toolbelt">
                    <div className="flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-starlight-ink">
                        <Network className="h-3.5 w-3.5 text-starlight-violet" aria-hidden="true" />
                        Agent toolbelt
                      </span>
                      <button
                        type="button"
                        data-testid="agent-toolbelt-prompt"
                        onClick={() => copyCommand(setupStatus.agent.prompt, 'agent toolbelt prompt')}
                        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-starlight-violet/35 bg-starlight-bg px-2 py-1 text-[10px] font-semibold text-starlight-ink transition hover:border-starlight-violet"
                      >
                        <Bot className="h-3 w-3" aria-hidden="true" />
                        Prompt
                      </button>
                    </div>
                    <div className="mt-3 grid gap-1.5">
                      {setupStatus.agent.tools.map((tool, index) => (
                        <div
                          key={tool.name}
                          data-testid={`agent-tool-${tool.name}`}
                          className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-2 rounded-md border border-starlight-border bg-starlight-bg/85 p-2"
                        >
                          <span className="flex h-5 w-5 items-center justify-center rounded border border-starlight-violet/35 text-[10px] font-semibold text-starlight-violet">
                            {index + 1}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate font-mono text-[11px] font-semibold text-starlight-ink">{tool.name}</span>
                            <span className="mt-0.5 block truncate text-[10px] text-starlight-muted">{tool.detail}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        data-testid="agent-toolbelt-report"
                        onClick={() => copyCommand(setupStatus.adoption.reportCommand, 'adoption report command')}
                        className="inline-flex items-center justify-center gap-1 rounded-md border border-starlight-border bg-starlight-bg px-2 py-1.5 text-[10px] font-semibold text-starlight-muted transition hover:border-starlight-accent hover:text-starlight-ink"
                      >
                        <Terminal className="h-3 w-3" aria-hidden="true" />
                        Report
                      </button>
                      <button
                        type="button"
                        data-testid="agent-toolbelt-terminal-handoff"
                        onClick={() => copyCommand(setupStatus.agent.terminalHandoffCommand, 'terminal Codex handoff command')}
                        className="inline-flex items-center justify-center gap-1 rounded-md border border-starlight-border bg-starlight-bg px-2 py-1.5 text-[10px] font-semibold text-starlight-muted transition hover:border-starlight-gold hover:text-starlight-ink"
                      >
                        <Copy className="h-3 w-3" aria-hidden="true" />
                        CLI handoff
                      </button>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {setupCommands.map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        onClick={() => copyCommand(item.command, `${item.label} command`)}
                        className="flex items-center justify-center gap-1.5 rounded-md border border-starlight-mint/35 bg-starlight-mint/10 px-2 py-2 text-[11px] font-semibold text-starlight-mint transition hover:border-starlight-mint"
                      >
                        {item.label === 'Smoke' ? <Terminal className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
                        {item.label}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    data-testid="setup-codex-handoff"
                    onClick={copyCodexHandoff}
                    disabled={!canvas || busy}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-starlight-gold/45 bg-starlight-gold/10 px-3 py-2 text-xs font-semibold text-starlight-ink transition hover:border-starlight-gold disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                    Codex handoff
                  </button>
                </>
              ) : null}
            </section>

            <section className="mt-4 rounded-lg border border-starlight-border bg-starlight-panel/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Search className="h-4 w-4 text-starlight-mint" aria-hidden="true" />
                Local Search
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-starlight-border bg-starlight-surface px-3 py-2 text-sm"
                  placeholder="Search canvases"
                />
                <button type="button" onClick={runSearch} className="rounded-md bg-starlight-mint px-3 py-2 text-sm font-semibold text-starlight-bg">
                  Go
                </button>
              </div>
              <div className="mt-3 space-y-2" data-testid="search-results">
                {searchResults.map((result, index) => (
                  <button
                    key={`${result.canvasId}-${result.nodeId}-${result.chunkId ?? index}`}
                    data-testid={`search-result-${result.canvasId}-${result.nodeId || 'artifact'}`}
                    type="button"
                    disabled={!result.nodeId}
                    onClick={() => focusSearchResult(result)}
                    className="w-full rounded-md border border-starlight-border bg-starlight-surface p-3 text-left transition hover:border-starlight-mint/70 disabled:cursor-not-allowed disabled:opacity-55"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 text-xs font-semibold text-starlight-ink">{result.title}</div>
                      <Crosshair className="mt-0.5 h-3.5 w-3.5 shrink-0 text-starlight-mint" aria-hidden="true" />
                    </div>
                    <div className="mt-1 text-[11px] text-starlight-muted">
                      {formatKind(result.kind)}
                      {result.chunkId ? ` · ${result.chunkId}` : result.artifactId ? ` · ${result.artifactId}` : ''}
                      {typeof result.score === 'number' ? ` · score ${result.score}` : ''}
                    </div>
                    {result.source ? <p className="mt-1 truncate text-[11px] text-starlight-mint">{result.source}</p> : null}
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-starlight-muted">{result.excerpt}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-4 rounded-lg border border-starlight-border bg-starlight-panel/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Bot className="h-4 w-4 text-starlight-gold" aria-hidden="true" />
                Run Log
              </div>
              <div className="mt-3 space-y-2">
                {canvas?.runs.slice().reverse().slice(0, 8).map((run) => {
                  const citations = metadataCitations(run.metadata);
                  return (
                    <div key={run.id} className="rounded-md border border-starlight-border bg-starlight-surface p-3">
                      <div className="text-xs font-semibold">{run.action.replace(/_/g, ' ')}</div>
                      <div className="mt-1 text-[11px] text-starlight-muted">{new Date(run.createdAt).toLocaleString()}</div>
                      <p className="mt-2 text-xs leading-5 text-starlight-muted">{run.summary}</p>
                      {citations.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {citations.slice(0, 5).map((citation) => (
                            <button
                              key={citation.id}
                              data-testid="run-citation-focus"
                              type="button"
                              onClick={() => focusCitation(citation)}
                              className="rounded-md border border-starlight-mint/30 bg-starlight-mint/10 px-1.5 py-0.5 text-[10px] text-starlight-mint transition hover:border-starlight-mint hover:bg-starlight-mint/15"
                            >
                              {citation.id}{citation.chunkId ? ` ${citation.chunkId}` : ''}
                            </button>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                }) ?? null}
                {!canvas?.runs.length ? <p className="text-xs leading-5 text-starlight-muted">No runs yet. Select sources and run an action.</p> : null}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
