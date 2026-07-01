'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  ReactFlowProvider,
  type Edge,
  type Node,
  type NodeProps,
  type OnSelectionChangeParams,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Bot,
  Boxes,
  Braces,
  Download,
  FileText,
  GitBranch,
  LayoutTemplate,
  Link,
  Loader2,
  MessageSquarePlus,
  Network,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Youtube,
} from 'lucide-react';
import type { CanvasActionType, CanvasEdge, CanvasNode, CanvasNodeKind, CanvasRecord } from '@starlight-agent-canvas/core';

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
};

type ApiState = {
  canvases: CanvasSummary[];
  templates: TemplateSummary[];
  home: string;
};

type CanvasMutationResponse = {
  canvas?: CanvasRecord;
};

type AgentNodeData = {
  title: string;
  kind: CanvasNodeKind;
  body: string;
  metadata: Record<string, unknown>;
};

const KIND_STYLE: Record<CanvasNodeKind, { label: string; accent: string; bg: string }> = {
  note: { label: 'Note', accent: '#F5C36A', bg: 'rgba(245,195,106,0.08)' },
  source_url: { label: 'URL', accent: '#79E6C5', bg: 'rgba(121,230,197,0.08)' },
  source_pdf: { label: 'PDF', accent: '#F1F3F9', bg: 'rgba(241,243,249,0.07)' },
  source_youtube: { label: 'Video', accent: '#F97066', bg: 'rgba(249,112,102,0.08)' },
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
];

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
  const source = typeof data.metadata.url === 'string' ? data.metadata.url : undefined;
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
  const [apiState, setApiState] = useState<ApiState>({ canvases: [], templates: [], home: '' });
  const [canvas, setCanvas] = useState<CanvasRecord | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Booting local canvas...');
  const [noteTitle, setNoteTitle] = useState('Research note');
  const [noteBody, setNoteBody] = useState('What matters, why it matters, and what to do next.');
  const [noteKind, setNoteKind] = useState<CanvasNodeKind>('note');
  const [url, setUrl] = useState('https://get.nodeflowai.com/');
  const [youtubeUrl, setYoutubeUrl] = useState('https://www.youtube.com/watch?v=');
  const [transcript, setTranscript] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{ title: string; kind: string; excerpt: string }>>([]);
  const compactCanvas = useCompactCanvas();

  const selectedNode = useMemo(() => canvas?.nodes.find((node) => node.id === selectedIds[0]) ?? null, [canvas, selectedIds]);
  const flow = useMemo(() => (canvas ? toFlow(canvas, compactCanvas) : { nodes: [], edges: [] }), [canvas, compactCanvas]);
  const canMutate = Boolean(canvas) && !busy;

  const loadCanvas = useCallback(async (id: string) => {
    const data = await api<{ canvas: CanvasRecord }>(`/api/canvases/${id}`);
    setCanvas(data.canvas);
    setSelectedIds([]);
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
            body: JSON.stringify({ title: 'Competitor teardown starter', template: 'competitor_teardown' }),
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

  const mutateCanvas = useCallback(async (work: () => Promise<CanvasMutationResponse>, done: string) => {
    if (!canvas) return;
    setBusy(true);
    try {
      const result = await work();
      if (result.canvas) setCanvas(result.canvas);
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
    );
  }, [canvas, mutateCanvas, noteBody, noteKind, noteTitle]);

  const addUrl = useCallback(async () => {
    if (!canvas || !url.trim()) return;
    await mutateCanvas(
      () => api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/nodes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'source_url', title: new URL(url).hostname, body: '', metadata: { url } }),
      }),
      'Ingested URL source.',
    );
  }, [canvas, mutateCanvas, url]);

  const addYoutube = useCallback(async () => {
    if (!canvas || !youtubeUrl.trim()) return;
    await mutateCanvas(
      () => api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/nodes`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ kind: 'source_youtube', title: 'YouTube source', body: transcript, metadata: { url: youtubeUrl } }),
      }),
      'Added YouTube transcript source.',
    );
  }, [canvas, mutateCanvas, transcript, youtubeUrl]);

  const addPdf = useCallback(async (file: File | null) => {
    if (!canvas || !file) return;
    const form = new FormData();
    form.append('file', file);
    await mutateCanvas(
      () => api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/ingest/pdf`, { method: 'POST', body: form }),
      'Ingested PDF source.',
    );
  }, [canvas, mutateCanvas]);

  const runAction = useCallback(async (action: CanvasActionType) => {
    if (!canvas) return;
    await mutateCanvas(
      () => api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/actions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, inputNodeIds: selectedIds }),
      }),
      `Ran ${action.replace(/_/g, ' ')}.`,
    );
  }, [canvas, mutateCanvas, selectedIds]);

  const connectSelected = useCallback(async () => {
    if (!canvas || selectedIds.length < 2) return;
    await mutateCanvas(
      () => api<CanvasMutationResponse>(`/api/canvases/${canvas.id}/edges`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ source: selectedIds[0], target: selectedIds[1], kind: 'references' }),
      }),
      'Connected selected nodes.',
    );
  }, [canvas, mutateCanvas, selectedIds]);

  const runSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    const data = await api<{ results: Array<{ title: string; kind: string; excerpt: string }> }>(`/api/search?q=${encodeURIComponent(searchQuery)}`);
    setSearchResults(data.results);
    setStatus(`Found ${data.results.length} local result(s).`);
  }, [searchQuery]);

  const onSelectionChange = useCallback((params: OnSelectionChangeParams) => {
    setSelectedIds(params.nodes.map((node) => node.id));
  }, []);

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
            <section className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <LayoutTemplate className="h-4 w-4 text-starlight-gold" aria-hidden="true" />
                Templates
              </div>
              <div className="grid grid-cols-1 gap-2">
                {apiState.templates.filter((template) => template.id !== 'blank').map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    disabled={busy}
                    onClick={() => createTemplate(template.id)}
                    className="rounded-lg border border-starlight-border bg-starlight-panel/80 p-3 text-left transition hover:border-starlight-accent/60 hover:bg-starlight-panel disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <span className="block text-sm font-medium text-starlight-ink">{template.title}</span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-starlight-muted">{template.description}</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="mt-6 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Boxes className="h-4 w-4 text-starlight-accent" aria-hidden="true" />
                Canvases
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
                PDF
              </div>
              <input
                type="file"
                accept="application/pdf"
                disabled={!canMutate}
                onChange={(event) => addPdf(event.currentTarget.files?.[0] ?? null)}
                className="w-full rounded-md border border-starlight-border bg-starlight-panel px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-starlight-ink file:px-2 file:py-1 file:text-xs file:text-starlight-bg disabled:cursor-not-allowed disabled:opacity-45"
              />
            </section>
          </aside>

          <section className="relative order-1 h-[620px] min-h-[620px] overflow-hidden bg-starlight-bg sm:h-[680px] lg:order-none lg:h-auto lg:min-h-0">
            <div className="absolute inset-0 agent-grid opacity-70" aria-hidden="true" />
            <div className="absolute bottom-4 left-4 right-4 top-auto z-10 flex flex-wrap items-center gap-2 rounded-lg border border-starlight-border bg-starlight-surface/88 p-2 shadow-command backdrop-blur sm:bottom-auto sm:right-auto sm:top-4">
              <span className="px-2 text-xs text-starlight-muted">{canvas?.title ?? 'Loading canvas'}</span>
              <button type="button" onClick={connectSelected} disabled={!canMutate || selectedIds.length < 2} className="flex items-center gap-1 rounded-md border border-starlight-border px-2 py-1 text-xs text-starlight-ink disabled:cursor-not-allowed disabled:opacity-40">
                <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                Connect
              </button>
              <a href={canvas ? `/api/canvases/${canvas.id}/export?format=json` : '#'} className="flex items-center gap-1 rounded-md border border-starlight-border px-2 py-1 text-xs text-starlight-ink">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                JSON
              </a>
              <a href={canvas ? `/api/canvases/${canvas.id}/export?format=markdown` : '#'} className="flex items-center gap-1 rounded-md border border-starlight-border px-2 py-1 text-xs text-starlight-ink">
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                MD
              </a>
            </div>
            <ReactFlow
              nodes={flow.nodes}
              edges={flow.edges}
              nodeTypes={nodeTypes}
              onSelectionChange={onSelectionChange}
              fitView
              fitViewOptions={{ padding: compactCanvas ? 0.18 : 0.2, maxZoom: 1.1 }}
              minZoom={compactCanvas ? 0.5 : 0.55}
              maxZoom={2}
              nodesConnectable={false}
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
          </section>

          <aside className="order-3 border-t border-starlight-border bg-starlight-surface/78 p-4 lg:order-none lg:min-h-0 lg:overflow-y-auto lg:border-l lg:border-t-0">
            <section className="rounded-lg border border-starlight-border bg-starlight-panel/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="h-4 w-4 text-starlight-accent" aria-hidden="true" />
                Action Drawer
              </div>
              <p className="mt-2 text-xs leading-5 text-starlight-muted">
                Runs are local and deterministic in v0.1. Select nodes to scope an action, or leave empty to use the canvas.
              </p>
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
                    <h2 className="mt-1 text-base font-semibold">{selectedNode.title}</h2>
                  </div>
                  <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md border border-starlight-border bg-starlight-surface p-3 text-xs leading-5 text-starlight-muted">
                    {selectedNode.body || 'No body text.'}
                  </p>
                  <pre className="max-h-48 overflow-y-auto rounded-md border border-starlight-border bg-starlight-bg p-3 text-[11px] leading-5 text-starlight-muted">
                    {JSON.stringify(selectedNode.metadata, null, 2)}
                  </pre>
                </div>
              ) : (
                <p className="mt-3 text-xs leading-5 text-starlight-muted">Select a node to inspect source metadata and body text.</p>
              )}
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
                  <div key={`${result.title}-${index}`} className="rounded-md border border-starlight-border bg-starlight-surface p-3">
                    <div className="text-xs font-semibold">{result.title}</div>
                    <div className="mt-1 text-[11px] text-starlight-muted">{formatKind(result.kind)}</div>
                    <p className="mt-2 line-clamp-3 text-xs leading-5 text-starlight-muted">{result.excerpt}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mt-4 rounded-lg border border-starlight-border bg-starlight-panel/70 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Bot className="h-4 w-4 text-starlight-gold" aria-hidden="true" />
                Run Log
              </div>
              <div className="mt-3 space-y-2">
                {canvas?.runs.slice().reverse().slice(0, 8).map((run) => (
                  <div key={run.id} className="rounded-md border border-starlight-border bg-starlight-surface p-3">
                    <div className="text-xs font-semibold">{run.action.replace(/_/g, ' ')}</div>
                    <div className="mt-1 text-[11px] text-starlight-muted">{new Date(run.createdAt).toLocaleString()}</div>
                    <p className="mt-2 text-xs leading-5 text-starlight-muted">{run.summary}</p>
                  </div>
                )) ?? null}
                {!canvas?.runs.length ? <p className="text-xs leading-5 text-starlight-muted">No runs yet. Select sources and run an action.</p> : null}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </main>
  );
}
