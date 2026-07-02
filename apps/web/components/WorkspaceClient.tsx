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
  Youtube,
} from 'lucide-react';
import type { CanvasActionType, CanvasArtifact, CanvasEdge, CanvasEdgeKind, CanvasNode, CanvasNodeKind, CanvasRecord, SourceCitation } from '@starlight-agent-canvas/core';

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
  outputNode?: CanvasNode;
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
  };
  setup: {
    localCommand: string;
    verifyCommand: string;
    docs: string[];
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
  id: 'youtube' | 'video' | 'url' | 'text' | 'pdf' | 'file';
  label: string;
  detail: string;
  active: boolean;
};

type IntakeActionMode = 'map' | 'summarize' | 'claims' | 'ask';
type ComposerMode = 'source' | 'note' | 'ask';
type QuickStarterId = 'video' | 'web' | 'note' | 'ask';

type WorkflowMapStep = {
  label: string;
  order: number;
  detail: string;
  node?: CanvasNode;
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

function AgentNode({ data, selected }: NodeProps<Node<AgentNodeData>>) {
  const style = KIND_STYLE[data.kind];
  const source = typeof data.metadata.url === 'string'
    ? data.metadata.url
    : typeof data.metadata.source === 'string'
      ? data.metadata.source
      : undefined;
  return (
    <div
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
        ? { x: 48 + (index % 2) * 330, y: 96 + Math.floor(index / 2) * 220 }
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

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const YOUTUBE_ID_PATTERN = /^[a-zA-Z0-9_-]{11}$/;
const VIDEO_FILE_PATTERN = /\.(mp4|m4v|mov|webm|mkv)(\?.*)?$/i;
const VIDEO_HOSTS = [
  'loom.com',
  'vimeo.com',
  'wistia.com',
  'tiktok.com',
  'drive.google.com',
  'dropbox.com',
];

function extractUrls(value: string): string[] {
  return Array.from(new Set((value.match(URL_PATTERN) ?? [])
    .map((item) => item.replace(/[),.;]+$/, ''))
    .filter(Boolean)));
}

function removeUrls(value: string, urls: string[]): string {
  return urls.reduce((text, url) => text.replace(url, ' '), value).replace(/\s+/g, ' ').trim();
}

function isYoutubeLink(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host.includes('youtube.com') || host.includes('youtu.be');
  } catch {
    return false;
  }
}

function isKnownVideoLink(value: string): boolean {
  if (isYoutubeLink(value)) return true;
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    return VIDEO_HOSTS.some((knownHost) => host === knownHost || host.endsWith(`.${knownHost}`))
      || VIDEO_FILE_PATTERN.test(parsed.pathname);
  } catch {
    return false;
  }
}

function isYoutubeVideoId(value: string): boolean {
  return YOUTUBE_ID_PATTERN.test(value.trim());
}

function normalizeYoutubeReference(value: string): string {
  const trimmed = value.trim();
  return isYoutubeVideoId(trimmed) ? `https://www.youtube.com/watch?v=${trimmed}` : trimmed;
}

function buildIntakePlan(value: string): IntakePlanItem[] {
  const text = value.trim();
  if (!text) {
    return [
      { id: 'youtube', label: 'YouTube', detail: 'captions or transcript', active: false },
      { id: 'video', label: 'Video link', detail: 'reference plus notes', active: false },
      { id: 'url', label: 'URL', detail: 'readable text', active: false },
      { id: 'pdf', label: 'PDF', detail: 'file upload', active: false },
      { id: 'text', label: 'Notes', detail: 'source text', active: false },
    ];
  }

  const urls = isYoutubeVideoId(text) ? [normalizeYoutubeReference(text)] : extractUrls(text);
  const youtubeUrls = urls.filter(isYoutubeLink);
  const videoUrls = urls.filter((item) => !isYoutubeLink(item) && isKnownVideoLink(item));
  const webUrls = urls.filter((item) => !isYoutubeLink(item) && !isKnownVideoLink(item));
  const remaining = removeUrls(text, urls);
  const textChars = (remaining || (!urls.length ? text : '')).length;
  const singleVideoWithAttachedText = urls.length === 1 && (youtubeUrls.length === 1 || videoUrls.length === 1);
  const plan: IntakePlanItem[] = [];

  if (youtubeUrls.length) {
    plan.push({
      id: 'youtube',
      label: youtubeUrls.length === 1 ? 'Video source' : `${youtubeUrls.length} video sources`,
      detail: remaining.length > 24 ? 'manual transcript attached' : 'captions first',
      active: true,
    });
  }

  if (videoUrls.length) {
    plan.push({
      id: 'video',
      label: videoUrls.length === 1 ? 'Video link' : `${videoUrls.length} video links`,
      detail: remaining.length > 24 ? 'manual notes attached' : 'reference plus notes',
      active: true,
    });
  }

  if (webUrls.length) {
    plan.push({
      id: 'url',
      label: webUrls.length === 1 ? 'Web source' : `${webUrls.length} web sources`,
      detail: 'fetch readable text',
      active: true,
    });
  }

  if ((textChars > 24 && !singleVideoWithAttachedText) || !urls.length) {
    plan.push({
      id: 'text',
      label: urls.length ? 'Source notes' : 'Text source',
      detail: `${Math.max(textChars, text.length)} chars`,
      active: true,
    });
  }

  return plan.length ? plan : [{ id: 'url', label: `${urls.length} source link${urls.length === 1 ? '' : 's'}`, detail: 'reference node', active: true }];
}

function intakePlanIcon(id: IntakePlanItem['id']) {
  if (id === 'youtube') return <Youtube className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'video') return <Film className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'url') return <Link className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'pdf' || id === 'file') return <FileText className="h-3.5 w-3.5" aria-hidden="true" />;
  return <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />;
}

function quickStarterIcon(id: QuickStarterId) {
  if (id === 'video') return <Film className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'web') return <Link className="h-3.5 w-3.5" aria-hidden="true" />;
  if (id === 'ask') return <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />;
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
  return 'Paste a YouTube link, URL, transcript, PDF notes, or raw idea';
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
  const { screenToFlowPosition, setCenter } = useReactFlow<Node<AgentNodeData>, Edge>();
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
  const [askPrompt, setAskPrompt] = useState('What capabilities, gaps, and next build moves does this canvas show?');
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [setupStatus, setSetupStatus] = useState<SetupStatus | null>(null);
  const [focusedChunkId, setFocusedChunkId] = useState<string | null>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const compactCanvas = useCompactCanvas();

  const selectedNode = useMemo(() => canvas?.nodes.find((node) => node.id === selectedIds[0]) ?? null, [canvas, selectedIds]);
  const selectedNodes = useMemo(() => canvas?.nodes.filter((node) => selectedIds.includes(node.id)) ?? [], [canvas, selectedIds]);
  const selectedChars = useMemo(() => selectedNodes.reduce((total, node) => total + node.body.length, 0), [selectedNodes]);
  const selectedExportQuery = useMemo(() => (
    selectedIds.length ? `&nodeIds=${encodeURIComponent(selectedIds.join(','))}` : ''
  ), [selectedIds]);
  const selectedCitations = useMemo(() => selectedNode ? metadataCitations(selectedNode.metadata) : [], [selectedNode]);
  const selectedArtifact = useMemo(() => {
    const artifactId = metadataString(selectedNode?.metadata, 'artifactId');
    if (!canvas || !artifactId) return null;
    return canvas.artifacts.find((artifact) => artifact.id === artifactId) ?? null;
  }, [canvas, selectedNode]);
  const selectedSource = selectedNode ? sourceForNode(selectedNode, selectedArtifact) : undefined;
  const selectedIngest = metadataString(selectedArtifact?.metadata, 'ingest') ?? metadataString(selectedNode?.metadata, 'ingest') ?? metadataString(selectedNode?.metadata, 'createdFrom') ?? 'node';
  const selectedArtifactChars = selectedArtifact?.body.length ?? selectedNode?.body.length ?? 0;
  const selectedChunkCount = selectedArtifact?.chunks.length ?? 0;
  const selectedPageCount = metadataNumber(selectedArtifact?.metadata, 'pages') ?? metadataNumber(selectedNode?.metadata, 'pages');
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
        ok: setupStatus.mcp.built,
        detail: setupStatus.mcp.built ? 'ready' : 'run build',
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
  ] : [], [setupStatus]);
  const activationRunway = useMemo(() => {
    if (!setupStatus) return [];
    const sourceCount = canvas?.nodes.filter((node) => node.kind.startsWith('source_')).length ?? 0;
    return setupStatus.activation.steps.map((step, index) => {
      const ok = step.id === 'install'
        ? setupStatus.mcp.built
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
        : 'Paste or drop a YouTube link, video link, URL, transcript, PDF, file, or raw notes.';
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

  useEffect(() => {
    setFlowNodes(baseFlow.nodes);
    setFlowEdges(baseFlow.edges);
  }, [baseFlow]);

  useEffect(() => {
    setEditTitle(selectedNode?.title ?? '');
    setEditBody(selectedNode?.body ?? '');
  }, [selectedNode?.id, selectedNode?.title, selectedNode?.body]);

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
        focusNode(result.node);
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

  const addUrl = useCallback(async () => {
    if (!canvas || !url.trim()) return;
    await mutateCanvas(
      () => api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/nodes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'source_url', title: hostTitle(url), body: '', metadata: { url } }),
      }),
      'Ingested URL source.',
      (result) => focusNode(result.node),
    );
  }, [canvas, focusNode, mutateCanvas, url]);

  const addYoutube = useCallback(async () => {
    if (!canvas || !youtubeUrl.trim()) return;
    await mutateCanvas(
      () => api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/nodes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'source_youtube', title: hostTitle(youtubeUrl), body: transcript, metadata: { url: youtubeUrl } }),
      }),
      'Ingested video source.',
      (result) => focusNode(result.node),
    );
  }, [canvas, focusNode, mutateCanvas, transcript, youtubeUrl]);

  const finishIntake = useCallback(async (
    createdNodeIds: string[],
    latest: CanvasMutationResponse | null,
    actionMode: IntakeActionMode,
    mappedStatus: string,
  ) => {
    const mappedCanvas = latest?.canvas;
    const createdNodeIdSet = new Set(createdNodeIds);
    const createdNodes = mappedCanvas?.nodes.filter((node) => createdNodeIdSet.has(node.id)) ?? (latest?.node ? [latest.node] : []);
    const createdIds = createdNodes.map((node) => node.id);
    const lastCreated = createdNodes[createdNodes.length - 1] ?? latest?.node;

    if (mappedCanvas) setCanvas(mappedCanvas);
    focusNode(lastCreated, createdIds);

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
      await refreshList();
      setStatus(`${mappedStatus} Ran ${actionInput.action.replace(/_/g, ' ')} on ${createdIds.length} new item(s).`);
      return;
    }

    await refreshList();
    setStatus(mappedStatus);
  }, [canvas, focusNode, refreshList]);

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
        if (last.node?.id) createdNodeIds.push(last.node.id);
        count += 1;
      }
      await finishIntake(createdNodeIds, last, actionMode, `Ingested ${count} file source(s).`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [canvas, finishIntake, intakeAction]);

  const intakeAnything = useCallback(async (value: string, position?: FlowPosition, actionMode: IntakeActionMode = intakeAction) => {
    if (!canvas || !value.trim()) return;
    const trimmedValue = value.trim();
    const directYoutubeId = isYoutubeVideoId(trimmedValue);
    const urls = directYoutubeId ? [normalizeYoutubeReference(trimmedValue)] : extractUrls(value);
    const remaining = directYoutubeId ? '' : removeUrls(value, urls);
    setBusy(true);
    try {
      const createdNodeIds: string[] = [];
      let last: CanvasMutationResponse | null = null;
      let count = 0;
      for (const sourceUrl of urls) {
        const youtube = isYoutubeLink(sourceUrl);
        const videoReference = !youtube && isKnownVideoLink(sourceUrl);
        const nodePosition = offsetPosition(position, count);
        last = await api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/nodes`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            kind: youtube ? 'source_youtube' : videoReference ? 'source_video' : 'source_url',
            body: (youtube || videoReference) && urls.length === 1 ? remaining : '',
            position: nodePosition,
            metadata: { url: sourceUrl, media: videoReference ? 'video_reference' : undefined },
          }),
        });
        if (last.node?.id) createdNodeIds.push(last.node.id);
        count += 1;
      }

      const singleVideoReferenceWithAttachedText = urls.length === 1 && (isYoutubeLink(urls[0]) || isKnownVideoLink(urls[0]));
      const shouldKeepText = !urls.length || (remaining.length > 24 && !singleVideoReferenceWithAttachedText);
      if (shouldKeepText) {
        const nodePosition = offsetPosition(position, count);
        last = await api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/ingest/text`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            title: textTitle(remaining || value),
            body: remaining || value,
            metadata: { intake: urls.length ? 'text_with_links' : 'manual_text' },
            position: nodePosition,
          }),
        });
        if (last.node?.id) createdNodeIds.push(last.node.id);
        count += 1;
      }

      const summary = buildIntakePlan(value).filter((item) => item.active).map((item) => item.label).join(', ');
      await finishIntake(createdNodeIds, last, actionMode, summary ? `Mapped ${count} item(s): ${summary}.` : `Mapped ${count} source item(s).`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [canvas, finishIntake, intakeAction]);

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

  const importCanvasFile = useCallback(async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const raw = await file.text();
      const result = await api<{ canvas: CanvasRecord }>('/api/canvases/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: raw,
      });
      setCanvas(result.canvas);
      setSelectedIds([]);
      await refreshList();
      setStatus(`Imported ${result.canvas.title}.`);
    } catch (error) {
      setStatus((error as Error).message);
    } finally {
      setBusy(false);
    }
  }, [refreshList]);

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
    if (!askPrompt.trim()) {
      requestComposerInput('ask');
      return;
    }
    await runAction('answer_question', askPrompt);
  }, [askPrompt, requestComposerInput, runAction]);

  const askSelectedSource = useCallback(async () => {
    if (!selectedNode) return;
    await runAction('answer_question', `Using the selected node "${selectedNode.title}", extract the most useful takeaways, gaps, and next actions. Cite source chunks when available.`, [selectedNode.id]);
  }, [runAction, selectedNode]);

  const pasteClipboardToIntake = useCallback(async (mode: ComposerMode = composerMode) => {
    if (!canvas || busy) return;
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) throw new Error('Clipboard is empty.');

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
    } catch (error) {
      setStatus((error as Error).message);
    }
  }, [addCanvasNoteAt, busy, canvas, composerMode, intakeAnything, runAction]);

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

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, [contenteditable="true"]')) return;
      const text = event.clipboardData?.getData('text/plain')?.trim();
      if (!text || !canvas || busy) return;
      event.preventDefault();
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
  }, [addCanvasNoteAt, busy, canvas, composerMode, intakeAnything, runAction]);

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
                placeholder="Paste a YouTube link, URL, transcript, or note"
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
                    accept="application/pdf,text/*,.txt,.md,.markdown,.json,.csv,.log"
                    disabled={!canMutate}
                    onChange={(event) => ingestFiles(Array.from(event.currentTarget.files ?? []))}
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
                <Youtube className="h-4 w-4 text-starlight-danger" aria-hidden="true" />
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
                <Youtube className="h-4 w-4" aria-hidden="true" />
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
                accept="application/pdf,text/*,.txt,.md,.markdown,.json,.csv,.log"
                disabled={!canMutate}
                onChange={(event) => ingestFiles(Array.from(event.currentTarget.files ?? []))}
                className="w-full rounded-md border border-starlight-border bg-starlight-panel px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-starlight-ink file:px-2 file:py-1 file:text-xs file:text-starlight-bg disabled:cursor-not-allowed disabled:opacity-45"
              />
            </section>
          </aside>

          <section
            className={`relative order-1 h-[620px] min-h-[620px] overflow-hidden bg-starlight-bg sm:h-[680px] lg:order-none lg:h-auto lg:min-h-0 ${dragActive ? 'ring-2 ring-inset ring-starlight-accent/70' : ''}`}
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
            {canvas?.nodes.length ? (
              <div
                className="pointer-events-none absolute right-4 top-[188px] z-10 hidden max-w-[260px] rounded-lg border border-starlight-border bg-starlight-surface/82 p-3 shadow-command backdrop-blur xl:block"
                data-testid="canvas-drop-affordance"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-starlight-ink">
                  <MousePointerClick className="h-4 w-4 text-starlight-mint" aria-hidden="true" />
                  Drop or paste onto the graph
                </div>
                <p className="mt-1 text-[11px] leading-4 text-starlight-muted">
                  Video links, URLs, PDFs, markdown, transcripts, and notes become typed context nodes at the drop point.
                </p>
              </div>
            ) : null}
            <div className="absolute left-3 right-3 top-3 z-20 rounded-lg border border-starlight-accent/30 bg-starlight-surface/92 p-2 shadow-command backdrop-blur md:left-4 md:right-auto md:w-[min(760px,calc(100%-2rem))]" data-testid="live-composer">
              <div className="flex flex-wrap items-center justify-between gap-2">
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
                <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-starlight-muted" data-testid="canvas-live-state">
                  <span className="rounded-md border border-starlight-border bg-starlight-bg/80 px-2 py-1">{canvas?.nodes.length ?? 0} nodes</span>
                  <span className="rounded-md border border-starlight-border bg-starlight-bg/80 px-2 py-1">{canvas?.artifacts.length ?? 0} artifacts</span>
                  <span className="rounded-md border border-starlight-border bg-starlight-bg/80 px-2 py-1">{canvas?.runs.length ?? 0} runs</span>
                </div>
              </div>
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
                    <span className="hidden font-normal text-starlight-muted sm:inline">proof canvas</span>
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
                    <span className="hidden font-normal text-starlight-muted sm:inline">blank canvas</span>
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
                      <span className="hidden font-normal text-starlight-muted sm:inline">{starter.detail}</span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-starlight-muted" data-testid="context-loop">
                  {CONTEXT_LOOP_STEPS.map((step, index) => (
                    <div key={step.label} className="flex items-center gap-1.5">
                      {index ? <span className="text-starlight-border">/</span> : null}
                      <span className="rounded-md border border-starlight-border bg-starlight-bg/70 px-2 py-1">
                        <span className="font-semibold text-starlight-ink">{step.label}</span> {step.detail}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-2 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto_auto] md:items-start">
                <textarea
                  data-testid="intake-text"
                  ref={composerRef}
                  value={composerText}
                  onChange={(event) => {
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
                  className="min-h-16 w-full resize-none rounded-md border border-starlight-border bg-starlight-bg/80 px-3 py-2 text-sm leading-5 text-starlight-ink"
                  placeholder={composerPlaceholder(composerMode)}
                />
                <button
                  data-testid="intake-paste"
                  type="button"
                  disabled={!canMutate}
                  onClick={() => pasteClipboardToIntake(composerMode)}
                  className="flex h-10 items-center justify-center gap-2 rounded-md border border-starlight-border px-3 text-sm font-semibold text-starlight-ink transition hover:border-starlight-accent disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
                  {clipboardButtonLabel(composerMode)}
                </button>
                <button
                  data-testid="intake-ingest"
                  type="button"
                  disabled={composerActionDisabled}
                  onClick={submitActiveComposer}
                  className="flex h-10 items-center justify-center gap-2 rounded-md bg-starlight-ink px-3 text-sm font-semibold text-starlight-bg transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {composerPrimaryIcon(composerMode, intakeAction)}
                  {composerButtonLabel(composerMode, intakeAction)}
                </button>
                <button
                  data-testid="quick-note"
                  type="button"
                  disabled={!canMutate}
                  onClick={submitCanvasNote}
                  className="flex h-10 items-center justify-center gap-2 rounded-md border border-starlight-border px-3 text-sm font-semibold text-starlight-ink transition hover:border-starlight-gold disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                  Note
                </button>
              </div>
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
                        accept="application/pdf,text/*,.txt,.md,.markdown,.json,.csv,.log"
                        disabled={!canMutate}
                        onChange={(event) => ingestFiles(Array.from(event.currentTarget.files ?? []))}
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
            <div
              className="absolute bottom-3 left-3 top-auto z-10 flex max-w-[calc(100%-1.5rem)] flex-nowrap items-center gap-2 overflow-x-auto rounded-lg border border-starlight-border bg-starlight-surface/88 p-1.5 shadow-command backdrop-blur sm:bottom-4 sm:left-4 sm:max-w-[calc(100%-2rem)] sm:flex-wrap sm:overflow-visible sm:p-2"
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
                  accept="application/pdf,text/*,.txt,.md,.markdown,.json,.csv,.log"
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
              <button type="button" onClick={connectSelected} disabled={!canMutate || selectedIds.length < 2} className="flex shrink-0 items-center gap-1 rounded-md border border-starlight-border px-2 py-1 text-xs text-starlight-ink disabled:cursor-not-allowed disabled:opacity-40">
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
                    void importCanvasFile(event.currentTarget.files?.[0]);
                    event.currentTarget.value = '';
                  }}
                  className="sr-only"
                />
              </label>
            </div>
            <div className="absolute inset-0 pt-[250px] sm:pt-0">
              {!canvas?.nodes.length ? (
                <div className="absolute left-1/2 top-[54%] z-10 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-lg border border-starlight-accent/25 bg-starlight-surface/88 p-5 text-center shadow-command backdrop-blur" data-testid="empty-canvas-actions">
                  <UploadCloud className="mx-auto h-7 w-7 text-starlight-accent" aria-hidden="true" />
                  <h2 className="mt-3 text-base font-semibold text-starlight-ink">Drop context here</h2>
                  <p className="mt-2 text-sm leading-6 text-starlight-muted">
                    Paste or drop a YouTube link, URL, transcript, PDF, markdown, or raw notes. The canvas will turn it into source nodes, chunks, citations, and agent-ready context.
                  </p>
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
                        type="file"
                        multiple
                        accept="application/pdf,text/*,.txt,.md,.markdown,.json,.csv,.log"
                        disabled={!canMutate}
                        onChange={(event) => ingestFiles(Array.from(event.currentTarget.files ?? []), { x: 120, y: 140 })}
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
              <p className="mt-2 text-xs leading-5 text-starlight-muted">
                Runs are local and deterministic in v0.1. Select nodes to scope an action, or leave empty to use the canvas.
              </p>
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
                  <div className="mt-3 grid grid-cols-3 gap-2">
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
              <div className="mt-3 space-y-2">
                {searchResults.map((result, index) => (
                  <button
                    key={`${result.canvasId}-${result.nodeId}-${result.chunkId ?? index}`}
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
