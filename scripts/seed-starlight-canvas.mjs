import { FileCanvasStore, CANVAS_SCHEMA_VERSION, nowIso } from '../packages/core/dist/index.js';

const homeArg = process.argv.find((arg) => arg.startsWith('--home='));
if (homeArg) {
  process.env.AGENT_CANVAS_HOME = homeArg.slice('--home='.length);
}

const createdAt = nowIso();

const node = (id, kind, title, body, position, metadata = {}) => ({
  id,
  kind,
  title,
  body,
  position,
  metadata,
  createdAt,
  updatedAt: createdAt,
});

const edge = (id, source, target, kind) => ({
  id,
  source,
  target,
  kind,
  createdAt,
});

const canvas = {
  schemaVersion: CANVAS_SCHEMA_VERSION,
  id: 'canvas-starlight-agent-canvas-os',
  title: 'Starlight Agent Canvas OS',
  description: 'The live operating canvas for building, using, and governing Starlight Agent Canvas with Codex, Claude, Gemini, MCP tools, and Starlight workflows.',
  createdAt,
  updatedAt: createdAt,
  nodes: [
    node(
      'node-north-star',
      'note',
      'North Star',
      [
        'Build an OSS-first, local-first MCP-native research and workflow canvas that turns sources, prompts, tool calls, and agent outputs into reusable context.',
        'The product promise is simple: creators and agents can see the work, run safe actions, connect evidence, and export the result without handing the operating memory to a closed SaaS layer.',
      ].join('\n\n'),
      { x: 80, y: 80 },
      { owner: 'Product Orchestrator', status: 'active' },
    ),
    node(
      'node-technology-stack',
      'mcp_tool',
      'Technology Stack',
      [
        'Web: Next.js App Router, React, TypeScript, Tailwind, lucide-react, @xyflow/react.',
        'Core: Zod schemas, typed canvas records, local file store, deterministic action runner, import/export.',
        'MCP: @modelcontextprotocol/sdk stdio server with safe local tools only.',
        'AI path: Vercel AI SDK dependency is present for provider adapters, while v0.1 actions stay deterministic and keyless.',
        'Quality: Vitest, Playwright desktop/mobile, security scan, visual QA evidence, CI.',
      ].join('\n'),
      { x: 430, y: 70 },
      { docs: ['docs/technology-stack.md', 'docs/system-design.md'] },
    ),
    node(
      'node-mcp-boundary',
      'mcp_tool',
      'MCP Boundary',
      [
        'Exposed tools: list_canvases, get_canvas, create_canvas, add_node, connect_nodes, run_node_action, search_artifacts, export_canvas.',
        'No destructive tools. No posting. No social scraping. No payments. No external account mutation.',
        'Runtime state is under AGENT_CANVAS_HOME. Frank local default: C:/Users/frank/.starlight/agent-canvas.',
      ].join('\n'),
      { x: 430, y: 305 },
      { config: '.mcp.json', codexConfigured: true },
    ),
    node(
      'node-agent-workflows',
      'prompt',
      'Agent Workflows',
      [
        'Primary workflows to prove v0.1:',
        '1. Competitor teardown for Poppy, Nodeflow, AI Flow Chat, and Superly alternatives.',
        '2. Starlight repo estate product planning canvas.',
        '3. MCP agent/tool design brief.',
        'Each workflow should finish in under 10 minutes and export JSON/Markdown for reuse by Codex, Claude, Gemini, and Starlight systems.',
      ].join('\n'),
      { x: 800, y: 80 },
      { action: 'implementation_brief' },
    ),
    node(
      'node-mobile-access',
      'note',
      'Mobile Access',
      [
        'The first viewport remains the actual workspace on mobile.',
        'The graph compacts into a vertical layout, minimap hides, side rails stack, and controls stay touch-size enough for source capture and action review.',
        'Hosted/Vercel deployment is a v0.2 path after remote storage/auth decisions; local production preview is available now.',
      ].join('\n'),
      { x: 80, y: 335 },
      { qa: ['desktop', 'mobile', 'reduced-motion'] },
    ),
    node(
      'node-production-gates',
      'agent_run',
      'Production Gates',
      [
        'Fast gates: security scan, pnpm verify, MCP stdio smoke, Playwright desktop/mobile.',
        'Visual gates: Premium Web OS first-read test, overlap check, mobile viewport, reduced-motion path, screenshot evidence.',
        'Release gates: no secrets, no runtime data committed, local state outside Git, OSS docs complete, remote deploy only after project connection is intentional.',
      ].join('\n'),
      { x: 800, y: 330 },
      { docs: ['docs/production-readiness.md', 'docs/visual-qa'] },
    ),
    node(
      'node-output-brief',
      'output',
      'Implementation Brief Output',
      [
        'Recommendation: keep v0.1 focused on local ownership, typed context, safe agent actions, and excellent inspectability.',
        'Next best investments: richer URL ingestion evidence, optional provider-backed action adapters, hosted preview with auth/storage, and a tldraw sketch mode once the typed workflow core is stable.',
      ].join('\n\n'),
      { x: 1160, y: 190 },
      { generatedBy: 'seed-starlight-canvas.mjs' },
    ),
  ],
  edges: [
    edge('edge-north-tech', 'node-north-star', 'node-technology-stack', 'derives_from'),
    edge('edge-tech-mcp', 'node-technology-stack', 'node-mcp-boundary', 'references'),
    edge('edge-north-mobile', 'node-north-star', 'node-mobile-access', 'references'),
    edge('edge-mcp-workflows', 'node-mcp-boundary', 'node-agent-workflows', 'runs'),
    edge('edge-mobile-gates', 'node-mobile-access', 'node-production-gates', 'references'),
    edge('edge-workflows-output', 'node-agent-workflows', 'node-output-brief', 'exports'),
    edge('edge-gates-output', 'node-production-gates', 'node-output-brief', 'derives_from'),
  ],
  runs: [
    {
      id: 'run-seed-implementation-brief',
      action: 'implementation_brief',
      inputNodeIds: ['node-north-star', 'node-technology-stack', 'node-mcp-boundary', 'node-agent-workflows', 'node-production-gates'],
      outputNodeId: 'node-output-brief',
      summary: 'Seeded the operating canvas with the product promise, technology stack, MCP boundary, workflows, production gates, and next investment path.',
      status: 'completed',
      createdAt,
      metadata: { local: true, deterministic: true },
    },
  ],
  artifacts: [
    {
      id: 'artifact-production-docs',
      kind: 'markdown',
      title: 'Production readiness docs',
      body: 'docs/production-readiness.md, docs/mcp-setup.md, docs/technology-stack.md',
      source: 'repo',
      createdAt,
      metadata: {},
    },
  ],
};

const store = new FileCanvasStore();
const saved = await store.importCanvas(canvas);

console.log(JSON.stringify({
  canvasId: saved.id,
  title: saved.title,
  home: store.home,
  nodeCount: saved.nodes.length,
  edgeCount: saved.edges.length,
}, null, 2));
