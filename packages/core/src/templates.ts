import { CANVAS_SCHEMA_VERSION, type CanvasEdgeKind, type CanvasNode, type CanvasRecord, type CreateCanvasInput } from './schemas.js';
import { makeId, nowIso } from './ids.js';

type TemplateSeed = {
  title: string;
  description: string;
  nodes: Array<Pick<CanvasNode, 'kind' | 'title' | 'body' | 'position' | 'metadata'>>;
  edges?: Array<{ source: number; target: number; kind: CanvasEdgeKind }>;
};

const TEMPLATE_SEEDS: Record<NonNullable<CreateCanvasInput['template']>, TemplateSeed> = {
  blank: {
    title: 'Blank canvas',
    description: 'Start with notes, sources, prompts, and agent outputs.',
    nodes: [
      {
        kind: 'note',
        title: 'North star',
        body: 'Drop sources, run actions, connect outputs, and export agent-ready context.',
        position: { x: 80, y: 120 },
        metadata: { role: 'orientation' },
      },
    ],
    edges: [],
  },
  competitor_teardown: {
    title: 'Competitor teardown',
    description: 'Compare products, capabilities, gaps, and build wedges.',
    nodes: [
      {
        kind: 'note',
        title: 'Decision question',
        body: 'What can we build that is more agent-native, local-first, and reusable than the current SaaS tools?',
        position: { x: 80, y: 80 },
        metadata: { role: 'question' },
      },
      {
        kind: 'source_url',
        title: 'Nodeflow benchmark',
        body: 'Source-connected visual research board benchmark.',
        position: { x: 80, y: 280 },
        metadata: { url: 'https://get.nodeflowai.com/' },
      },
      {
        kind: 'source_url',
        title: 'AI Flow Chat benchmark',
        body: 'Reusable AI workflow/app packaging benchmark.',
        position: { x: 360, y: 280 },
        metadata: { url: 'https://aiflowchat.com/#pricing' },
      },
      {
        kind: 'prompt',
        title: 'Teardown prompt',
        body: 'Extract features, pricing model, onboarding pattern, supported inputs, output types, and gaps we can exploit.',
        position: { x: 640, y: 120 },
        metadata: { action: 'decision_matrix' },
      },
    ],
    edges: [
      { source: 0, target: 3, kind: 'runs' },
      { source: 1, target: 3, kind: 'references' },
      { source: 2, target: 3, kind: 'compares' },
    ],
  },
  repo_product_planning: {
    title: 'Repo/product planning',
    description: 'Route Starlight repo estate capabilities into a focused product plan.',
    nodes: [
      {
        kind: 'note',
        title: 'Estate signal',
        body: 'Reuse FrankX graph surfaces, AIS MCP shape, ACOS workflows, and Premium Web OS gates.',
        position: { x: 80, y: 120 },
        metadata: { role: 'source-of-truth' },
      },
      {
        kind: 'prompt',
        title: 'Planning action',
        body: 'Generate a build brief with scope, modules, interfaces, tests, and launch proof.',
        position: { x: 440, y: 120 },
        metadata: { action: 'implementation_brief' },
      },
    ],
    edges: [
      { source: 0, target: 1, kind: 'derives_from' },
    ],
  },
  agent_workflow_design: {
    title: 'Agent workflow design',
    description: 'Design safe agent workflows with MCP boundaries and review gates.',
    nodes: [
      {
        kind: 'mcp_tool',
        title: 'MCP boundary',
        body: 'All v0.1 tools are local, explicit, and non-destructive.',
        position: { x: 80, y: 120 },
        metadata: { allowed: ['read', 'create', 'add_node', 'connect', 'run_action', 'export'] },
      },
      {
        kind: 'agent_run',
        title: 'Agent handoff',
        body: 'Research Scout -> Systems Architect -> Frontend Engineer -> QA/Security -> Visual QA.',
        position: { x: 440, y: 120 },
        metadata: { loop: 'build-review-qa-ship-retro' },
      },
    ],
    edges: [
      { source: 0, target: 1, kind: 'runs' },
    ],
  },
  content_synthesis: {
    title: 'Content synthesis',
    description: 'Turn source notes into scripts, posts, briefs, and reusable context.',
    nodes: [
      {
        kind: 'note',
        title: 'Source pile',
        body: 'Paste transcripts, URLs, notes, and observations here.',
        position: { x: 80, y: 120 },
        metadata: { role: 'input' },
      },
      {
        kind: 'prompt',
        title: 'Synthesis prompt',
        body: 'Summarize core claims, extract proof, and generate a concise publishing brief.',
        position: { x: 440, y: 120 },
        metadata: { action: 'summarize' },
      },
    ],
    edges: [
      { source: 0, target: 1, kind: 'references' },
    ],
  },
};

export function createCanvasRecord(input: CreateCanvasInput): CanvasRecord {
  const createdAt = nowIso();
  const template = input.template ?? 'blank';
  const seed = TEMPLATE_SEEDS[template];
  const title = input.title || seed.title;
  const canvasId = makeId('canvas', title);

  const nodes = seed.nodes.map((node, index) => ({
    id: makeId('node', `${node.title}-${index}`),
    kind: node.kind,
    title: node.title,
    body: node.body,
    position: node.position,
    metadata: node.metadata,
    createdAt,
    updatedAt: createdAt,
  }));
  const edges = (seed.edges ?? [])
    .filter((edge) => nodes[edge.source] && nodes[edge.target])
    .map((edge, index) => ({
      id: makeId('edge', `${nodes[edge.source].id}-${nodes[edge.target].id}-${index}`),
      source: nodes[edge.source].id,
      target: nodes[edge.target].id,
      kind: edge.kind,
      createdAt,
    }));

  return {
    schemaVersion: CANVAS_SCHEMA_VERSION,
    id: canvasId,
    title,
    description: input.description ?? seed.description,
    createdAt,
    updatedAt: createdAt,
    nodes,
    edges,
    runs: [],
    artifacts: [],
  };
}

export function listTemplates(): Array<{ id: CreateCanvasInput['template']; title: string; description: string }> {
  return Object.entries(TEMPLATE_SEEDS).map(([id, seed]) => ({
    id: id as CreateCanvasInput['template'],
    title: seed.title,
    description: seed.description,
  }));
}
