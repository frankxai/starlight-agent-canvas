import { CANVAS_SCHEMA_VERSION, type CanvasEdgeKind, type CanvasNode, type CanvasRecord, type CreateCanvasInput } from './schemas.js';
import { makeId, nowIso } from './ids.js';

type TemplateSeed = {
  title: string;
  description: string;
  bestFor: string;
  outcome: string;
  steps: string[];
  nodes: Array<Pick<CanvasNode, 'kind' | 'title' | 'body' | 'position' | 'metadata'>>;
  edges?: Array<{ source: number; target: number; kind: CanvasEdgeKind }>;
};

const TEMPLATE_SEEDS: Record<NonNullable<CreateCanvasInput['template']>, TemplateSeed> = {
  blank: {
    title: 'Blank canvas',
    description: 'Start with notes, sources, prompts, and agent outputs.',
    bestFor: 'Open-ended research',
    outcome: 'A freeform local canvas ready for sources, notes, actions, and agent handoff.',
    steps: ['Capture sources', 'Map relationships', 'Ask or run actions', 'Export context'],
    nodes: [],
    edges: [],
  },
  competitor_teardown: {
    title: 'Competitor teardown',
    description: 'Compare products, capabilities, gaps, and build wedges.',
    bestFor: 'Poppy, Nodeflow, AI Flow Chat, Superly, and adjacent agent canvas products',
    outcome: 'A cited capability matrix, wedge decision, and Codex implementation brief.',
    steps: ['Capture evidence', 'Normalize capabilities', 'Compare wedges', 'Decide build path', 'Handoff to Codex'],
    nodes: [
      {
        kind: 'note',
        title: 'Workflow brief',
        body: [
          'Goal: understand the competitor landscape without becoming a clone.',
          '',
          'Success criteria:',
          '- Capture at least 3 sources or notes per competitor.',
          '- Extract input types, output types, workflow model, agent integration, pricing, and lock-in.',
          '- Produce a decision matrix and a concrete build wedge for Starlight Agent Canvas.',
        ].join('\n'),
        position: { x: 80, y: 80 },
        metadata: { role: 'workflow_brief', workflowStep: 'Capture evidence', workflowOrder: 1 },
      },
      {
        kind: 'source_url',
        title: 'Poppy source slot',
        body: 'Paste Poppy pages, videos, notes, screenshots-as-text, or pricing observations here. Capture what inputs it accepts, how context maps to outputs, and where agent handoff feels strong or weak.',
        position: { x: 80, y: 300 },
        metadata: { sourceSlot: true, competitor: 'Poppy', workflowStep: 'Capture evidence', workflowOrder: 1 },
      },
      {
        kind: 'source_url',
        title: 'Nodeflow source slot',
        body: 'Paste Nodeflow pages, videos, notes, and workflow examples here. Focus on visual workflow construction, supported source types, collaboration, and export/reuse.',
        position: { x: 360, y: 300 },
        metadata: { sourceSlot: true, competitor: 'Nodeflow', workflowStep: 'Capture evidence', workflowOrder: 1 },
      },
      {
        kind: 'source_url',
        title: 'AI Flow Chat / Superly source slot',
        body: 'Paste AI Flow Chat, Superly, and adjacent product material here. Focus on packaging, templates, agent loops, and what a creator can do in the first 10 minutes.',
        position: { x: 640, y: 300 },
        metadata: { sourceSlot: true, competitor: 'AI Flow Chat / Superly', workflowStep: 'Capture evidence', workflowOrder: 1 },
      },
      {
        kind: 'prompt',
        title: 'Capability extraction prompt',
        body: 'For each competitor source, extract: supported inputs, canvas model, agent integration, output formats, collaboration, pricing posture, onboarding friction, unique magic, and evidence quotes.',
        position: { x: 220, y: 560 },
        metadata: { action: 'extract_claims', workflowStep: 'Normalize capabilities', workflowOrder: 2 },
      },
      {
        kind: 'prompt',
        title: 'Decision matrix prompt',
        body: 'Compare competitors against Starlight Agent Canvas on local-first trust, MCP interoperability, human editability, source traceability, Codex handoff, media intake, and OSS community value.',
        position: { x: 560, y: 560 },
        metadata: { action: 'decision_matrix', workflowStep: 'Compare wedges', workflowOrder: 3 },
      },
      {
        kind: 'output',
        title: 'Build wedge output',
        body: 'Expected output: the smallest 10-star v0.1/v0.2 wedge that makes Starlight Agent Canvas more useful than a closed visual AI canvas for creators and coding agents.',
        position: { x: 900, y: 220 },
        metadata: { expectedOutput: true, workflowStep: 'Decide build path', workflowOrder: 4 },
      },
      {
        kind: 'mcp_tool',
        title: 'Codex handoff target',
        body: 'When the matrix is useful, export format=codex with selected evidence and ask Codex to implement the chosen wedge. Keep citations and source chunks attached.',
        position: { x: 900, y: 520 },
        metadata: { tool: 'export_canvas', format: 'codex', workflowStep: 'Handoff to Codex', workflowOrder: 5 },
      },
    ],
    edges: [
      { source: 0, target: 4, kind: 'references' },
      { source: 1, target: 4, kind: 'references' },
      { source: 2, target: 4, kind: 'references' },
      { source: 3, target: 4, kind: 'references' },
      { source: 4, target: 5, kind: 'derives_from' },
      { source: 5, target: 6, kind: 'derives_from' },
      { source: 6, target: 7, kind: 'exports' },
    ],
  },
  repo_product_planning: {
    title: 'Repo/product planning',
    description: 'Route Starlight repo estate capabilities into a focused product plan.',
    bestFor: 'Turning local repo estate knowledge into a shippable product slice',
    outcome: 'A build brief with scope, interfaces, tests, evidence, and release gates.',
    steps: ['Capture estate signal', 'Choose product wedge', 'Plan architecture', 'Lock gates', 'Export implementation brief'],
    nodes: [
      {
        kind: 'note',
        title: 'Estate signal intake',
        body: 'Paste repo manifest excerpts, existing product notes, architecture sketches, and local constraints here. Keep runtime state out of Git and reference the canonical repo-estate control file when doing broad estate work.',
        position: { x: 80, y: 120 },
        metadata: { role: 'source-of-truth', workflowStep: 'Capture estate signal', workflowOrder: 1 },
      },
      {
        kind: 'note',
        title: 'Candidate product wedge',
        body: 'State the strongest product candidate in one paragraph. Include target user, urgent job, differentiator, and why this repo should own it.',
        position: { x: 420, y: 120 },
        metadata: { role: 'decision', workflowStep: 'Choose product wedge', workflowOrder: 2 },
      },
      {
        kind: 'prompt',
        title: 'Architecture planning prompt',
        body: 'Generate modules, package boundaries, data flow, API contracts, failure modes, and test responsibilities. Prefer existing local patterns over new abstractions.',
        position: { x: 760, y: 120 },
        metadata: { action: 'implementation_brief', workflowStep: 'Plan architecture', workflowOrder: 3 },
      },
      {
        kind: 'mcp_tool',
        title: 'Release gate checklist',
        body: 'Run doctor:json, typecheck, tests, e2e, build, release:audit, first-run check, security scan, and visual QA when UI changes. Record evidence before handoff.',
        position: { x: 760, y: 360 },
        metadata: { gates: ['doctor:json', 'typecheck', 'test', 'test:e2e', 'build', 'release:audit'], workflowStep: 'Lock gates', workflowOrder: 4 },
      },
      {
        kind: 'prompt',
        title: 'Implementation brief output prompt',
        body: 'Create a Codex-ready build brief with success criteria, exact files to inspect, proposed edits, test plan, rollout, and open risks.',
        position: { x: 420, y: 420 },
        metadata: { action: 'implementation_brief', workflowStep: 'Export implementation brief', workflowOrder: 5 },
      },
    ],
    edges: [
      { source: 0, target: 1, kind: 'derives_from' },
      { source: 1, target: 2, kind: 'runs' },
      { source: 2, target: 3, kind: 'references' },
      { source: 3, target: 4, kind: 'exports' },
    ],
  },
  agent_workflow_design: {
    title: 'Agent workflow design',
    description: 'Design safe agent workflows with MCP boundaries and review gates.',
    bestFor: 'Designing a Codex/Claude/Gemini workflow before tools mutate local state',
    outcome: 'A safe MCP operating contract, role map, tool boundary, and review loop.',
    steps: ['Define job', 'Set tool boundary', 'Route agents', 'Add review gates', 'Export agent contract'],
    nodes: [
      {
        kind: 'note',
        title: 'Agent job definition',
        body: 'Describe the user job, what the agent may change, what it must ask before doing, and which evidence it should cite. Keep the workflow local-first and reviewable.',
        position: { x: 80, y: 80 },
        metadata: { role: 'job', workflowStep: 'Define job', workflowOrder: 1 },
      },
      {
        kind: 'mcp_tool',
        title: 'MCP boundary',
        body: 'Allowed: list/get/create/import canvas, add/update nodes, ingest text/URL/YouTube/video/PDF, connect nodes, run deterministic actions, search artifacts, export JSON/Markdown/context/Codex. Not allowed: delete, post externally, pay, scrape social platforms, or mutate unrelated local files.',
        position: { x: 420, y: 80 },
        metadata: { allowed: ['read', 'create', 'add_node', 'connect', 'run_action', 'export'], workflowStep: 'Set tool boundary', workflowOrder: 2 },
      },
      {
        kind: 'agent_run',
        title: 'Subagent route',
        body: 'Product Orchestrator -> Research Scout -> Systems Architect -> Frontend Engineer -> Ingestion/MCP Engineer -> QA/Security -> Visual QA -> OSS/Growth.',
        position: { x: 760, y: 80 },
        metadata: { loop: 'office-hours-plan-review-qa-ship-retro', workflowStep: 'Route agents', workflowOrder: 3 },
      },
      {
        kind: 'prompt',
        title: 'Review gate prompt',
        body: 'Before shipping, inspect source provenance, MCP safety, selected context scope, run logs, citation traceability, mobile layout, reduced motion, release audit, and staged security scan.',
        position: { x: 420, y: 360 },
        metadata: { action: 'implementation_brief', workflowStep: 'Add review gates', workflowOrder: 4 },
      },
      {
        kind: 'output',
        title: 'Agent contract output',
        body: 'Expected output: a prompt or context packet an agent can follow without broad credentials, ambiguous authority, or hidden destructive behavior.',
        position: { x: 760, y: 360 },
        metadata: { expectedOutput: true, workflowStep: 'Export agent contract', workflowOrder: 5 },
      },
    ],
    edges: [
      { source: 0, target: 1, kind: 'references' },
      { source: 1, target: 2, kind: 'runs' },
      { source: 2, target: 3, kind: 'references' },
      { source: 3, target: 4, kind: 'exports' },
    ],
  },
  content_synthesis: {
    title: 'Content synthesis',
    description: 'Turn source notes into scripts, posts, briefs, and reusable context.',
    bestFor: 'Turning mixed transcripts, pages, and notes into reusable creator output',
    outcome: 'A cited synthesis brief with claims, proof, angle, and exportable context.',
    steps: ['Collect source pile', 'Extract claims', 'Choose angle', 'Draft output', 'Export context'],
    nodes: [
      {
        kind: 'note',
        title: 'Source pile',
        body: 'Paste transcripts, URLs, notes, and observations here. Use source nodes for durable evidence and notes for your own synthesis.',
        position: { x: 80, y: 120 },
        metadata: { role: 'input', workflowStep: 'Collect source pile', workflowOrder: 1 },
      },
      {
        kind: 'prompt',
        title: 'Claims extraction prompt',
        body: 'Extract claims, evidence quotes, contradictions, useful examples, and missing context. Keep citation ids attached.',
        position: { x: 420, y: 120 },
        metadata: { action: 'extract_claims', workflowStep: 'Extract claims', workflowOrder: 2 },
      },
      {
        kind: 'note',
        title: 'Angle decision',
        body: 'Choose one audience, one promise, one useful transformation, and one proof path. Cut anything generic.',
        position: { x: 760, y: 120 },
        metadata: { role: 'decision', workflowStep: 'Choose angle', workflowOrder: 3 },
      },
      {
        kind: 'prompt',
        title: 'Synthesis prompt',
        body: 'Generate a concise publishing brief or script outline with hook, claims, proof, caveats, and next action. Preserve citations.',
        position: { x: 420, y: 380 },
        metadata: { action: 'summarize', workflowStep: 'Draft output', workflowOrder: 4 },
      },
      {
        kind: 'mcp_tool',
        title: 'Context export target',
        body: 'Export format=context for a general agent packet or format=codex when Codex should continue implementation or production from the selected evidence.',
        position: { x: 760, y: 380 },
        metadata: { tool: 'export_canvas', workflowStep: 'Export context', workflowOrder: 5 },
      },
    ],
    edges: [
      { source: 0, target: 1, kind: 'references' },
      { source: 1, target: 2, kind: 'derives_from' },
      { source: 2, target: 3, kind: 'runs' },
      { source: 3, target: 4, kind: 'exports' },
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

export function listTemplates(): Array<{
  id: CreateCanvasInput['template'];
  title: string;
  description: string;
  bestFor: string;
  outcome: string;
  steps: string[];
}> {
  return Object.entries(TEMPLATE_SEEDS).map(([id, seed]) => ({
    id: id as CreateCanvasInput['template'],
    title: seed.title,
    description: seed.description,
    bestFor: seed.bestFor,
    outcome: seed.outcome,
    steps: seed.steps,
  }));
}
