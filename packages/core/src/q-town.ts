import { CANVAS_SCHEMA_VERSION, type CanvasEdge, type CanvasNode, type CanvasRecord } from './schemas.js';
import { nowIso } from './ids.js';

export const Q_TOWN_CANVAS_ID = 'canvas-q-town-second-brain';
export const Q_TOWN_SCHEMA = 'starlight.qTownDomainAgents.v1';

export type QTownDistrict = {
  id: string;
  title: string;
  kind: 'plaza' | 'vault' | 'agent' | 'practice';
  airGapped: boolean;
  purpose: string;
};

export type QTownRepoAgent = {
  id: string;
  repo: string;
  role: string;
  priority: string;
  tags: string[];
};

export type QTownLane = {
  id: string;
  title: string;
  purpose: string;
  repos: QTownRepoAgent[];
};

export type QTownRegistry = {
  schema: typeof Q_TOWN_SCHEMA;
  generatedFrom: string;
  manifestUpdatedAt?: string;
  privacy: {
    containsPrivateVaultNotes: boolean;
    containsSecrets: boolean;
    deployment: 'registry-only';
    liveProcessSpawn: boolean;
  };
  priorityControlRepos: string[];
  secondBrainDistricts: QTownDistrict[];
  lanes: QTownLane[];
};

export type QTownBuildOptions = {
  includeRepoAgents?: boolean;
  priorityReposOnly?: boolean;
  createdAt?: string;
};

type Position = { x: number; y: number };

const CENTER: Position = { x: 1180, y: 920 };

export function validateQTownRegistry(input: unknown): QTownRegistry {
  if (!input || typeof input !== 'object') {
    throw new Error('Q-Town registry must be an object');
  }
  const registry = input as QTownRegistry;
  if (registry.schema !== Q_TOWN_SCHEMA) {
    throw new Error(`Unsupported Q-Town schema: ${String((input as { schema?: string }).schema)}`);
  }
  if (registry.privacy?.containsPrivateVaultNotes) {
    throw new Error('Q-Town registry must not contain private vault notes');
  }
  if (registry.privacy?.containsSecrets) {
    throw new Error('Q-Town registry must not contain secrets');
  }
  if (registry.privacy?.deployment !== 'registry-only') {
    throw new Error('Q-Town agents are registry-only; live spawn is not admitted');
  }
  if (registry.privacy?.liveProcessSpawn) {
    throw new Error('Q-Town must not spawn live processes');
  }
  if (!Array.isArray(registry.secondBrainDistricts) || registry.secondBrainDistricts.length < 3) {
    throw new Error('Q-Town requires second-brain districts');
  }
  if (!Array.isArray(registry.lanes) || registry.lanes.length === 0) {
    throw new Error('Q-Town requires at least one estate lane');
  }
  return registry;
}

export function polar(center: Position, radius: number, index: number, count: number, offset = -Math.PI / 2): Position {
  const n = Math.max(count, 1);
  const angle = offset + (2 * Math.PI * index) / n;
  return {
    x: Math.round(center.x + radius * Math.cos(angle)),
    y: Math.round(center.y + radius * Math.sin(angle)),
  };
}

function stableId(prefix: string, value: string): string {
  const stem = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'node';
  return `${prefix}-${stem}`;
}

function node(
  id: string,
  kind: CanvasNode['kind'],
  title: string,
  body: string,
  position: Position,
  metadata: Record<string, unknown>,
  createdAt: string,
): CanvasNode {
  return {
    id,
    kind,
    title,
    body,
    position,
    metadata,
    createdAt,
    updatedAt: createdAt,
  };
}

function edge(id: string, source: string, target: string, kind: CanvasEdge['kind'], createdAt: string): CanvasEdge {
  return { id, source, target, kind, createdAt };
}

export function selectedRepoAgents(registry: QTownRegistry, options: QTownBuildOptions = {}): Array<QTownRepoAgent & { laneId: string; laneTitle: string }> {
  const includeRepoAgents = options.includeRepoAgents ?? true;
  if (!includeRepoAgents) return [];
  const priority = new Set(registry.priorityControlRepos);
  const rows: Array<QTownRepoAgent & { laneId: string; laneTitle: string }> = [];
  for (const lane of registry.lanes) {
    for (const repo of lane.repos) {
      if (options.priorityReposOnly && !priority.has(repo.repo)) continue;
      rows.push({ ...repo, laneId: lane.id, laneTitle: lane.title });
    }
  }
  return rows;
}

export function buildQTownWorld(input: unknown, options: QTownBuildOptions = {}): CanvasRecord {
  const registry = validateQTownRegistry(input);
  const createdAt = options.createdAt ?? nowIso();
  const nodes: CanvasNode[] = [];
  const edges: CanvasEdge[] = [];

  const plaza = registry.secondBrainDistricts.find((district) => district.kind === 'plaza') ?? registry.secondBrainDistricts[0];
  const plazaId = stableId('node', plaza.id);
  nodes.push(node(
    plazaId,
    'note',
    plaza.title,
    [
      plaza.purpose,
      '',
      'Q-Town is the private Starlight world graph: second-brain districts plus one registered steward per estate domain and repo.',
      'Agents are declared, not launched. Private vault content stays off this canvas and off Git.',
    ].join('\n'),
    CENTER,
    {
      district: plaza.id,
      role: 'plaza',
      world: 'q-town',
      workflowStep: 'Map the private world',
      workflowOrder: 1,
      deployment: 'registry-only',
    },
    createdAt,
  ));

  const vaultDistricts = registry.secondBrainDistricts.filter((district) => district.id !== plaza.id);
  vaultDistricts.forEach((district, index) => {
    const id = stableId('node', district.id);
    const kind: CanvasNode['kind'] = district.kind === 'agent' ? 'agent_run' : 'note';
    nodes.push(node(
      id,
      kind,
      district.title,
      district.purpose,
      polar(CENTER, 280, index, vaultDistricts.length),
      {
        district: district.id,
        airGapped: district.airGapped,
        role: district.kind,
        world: 'q-town',
        workflowStep: district.airGapped ? 'Keep the private vault sealed' : 'Register second-brain stewards',
        workflowOrder: district.airGapped ? 2 : 3,
        mount: district.airGapped ? 'none' : 'brain-only',
        status: 'registered',
      },
      createdAt,
    ));
    edges.push(edge(stableId('edge', `${plaza.id}-${district.id}`), plazaId, id, district.airGapped ? 'references' : 'derives_from', createdAt));
  });

  const privateDistrict = nodes.find((item) => item.metadata.airGapped === true);
  if (privateDistrict) {
    const chronicle = nodes.find((item) => item.id.includes('chronicle'));
    if (chronicle) {
      edges.push(edge('edge-private-chronicle', privateDistrict.id, chronicle.id, 'references', createdAt));
    }
  }

  registry.lanes.forEach((lane, index) => {
    const laneId = stableId('node-lane', lane.id);
    const position = polar(CENTER, 640, index, registry.lanes.length);
    const activation = lane.id === 'archive-candidate' ? 'hold' : 'registered';
    nodes.push(node(
      laneId,
      'agent_run',
      `${lane.title} steward`,
      [
        lane.purpose,
        '',
        `Registered domain steward for ${lane.repos.length} repos.`,
        'No live process is started by this graph.',
      ].join('\n'),
      position,
      {
        district: lane.id,
        role: 'domain-steward',
        world: 'q-town',
        status: activation,
        deployment: 'registry-only',
        repoCount: lane.repos.length,
        workflowStep: 'Register domain stewards',
        workflowOrder: 4,
      },
      createdAt,
    ));
    edges.push(edge(stableId('edge', `plaza-${lane.id}`), plazaId, laneId, 'runs', createdAt));

    const repos = selectedRepoAgents({ ...registry, lanes: [lane] }, options);
    repos.forEach((repo, repoIndex) => {
      const repoNodeId = stableId('node-agent', repo.repo);
      const ring = 150 + Math.floor(repoIndex / 10) * 70;
      const spoke = polar(position, ring, repoIndex, Math.max(repos.length, 6), (index * 0.4));
      const priority = registry.priorityControlRepos.includes(repo.repo);
      nodes.push(node(
        repoNodeId,
        'agent_run',
        `${repo.repo} agent`,
        [
          repo.role,
          '',
          `Lane: ${repo.laneTitle}`,
          `Priority: ${repo.priority}`,
          priority ? 'Priority-control repo.' : 'Estate repo.',
          'Status: registered. Live spawn: no.',
        ].join('\n'),
        spoke,
        {
          district: lane.id,
          role: 'repo-agent',
          world: 'q-town',
          repo: repo.repo,
          priority: repo.priority,
          tags: repo.tags,
          status: lane.id === 'archive-candidate' ? 'hold' : 'registered',
          deployment: 'registry-only',
          priorityControl: priority,
          workflowStep: 'Register repo agents',
          workflowOrder: 5,
        },
        createdAt,
      ));
      edges.push(edge(stableId('edge', `${lane.id}-${repo.id}`), laneId, repoNodeId, 'runs', createdAt));
    });
  });

  const boundaryId = 'node-q-town-mcp-boundary';
  nodes.push(node(
    boundaryId,
    'mcp_tool',
    'Q-Town MCP boundary',
    [
      'Allowed: create/import this canvas, inspect nodes, export context.',
      'Not allowed: mount private/, spawn a live agent per repo, publish, spend, or write secrets into the graph.',
    ].join('\n'),
    { x: CENTER.x + 820, y: CENTER.y - 420 },
    {
      tool: 'export_canvas',
      world: 'q-town',
      workflowStep: 'Lock the air-gap',
      workflowOrder: 6,
    },
    createdAt,
  ));
  edges.push(edge('edge-plaza-boundary', plazaId, boundaryId, 'references', createdAt));

  const outputId = 'node-q-town-changelog';
  nodes.push(node(
    outputId,
    'output',
    'Q-Town changelog evidence',
    'Expected output: a registered world graph, domain-agent roster, and changelog entry. Blessing stays HOLD until soak and a merged, clean target exist.',
    { x: CENTER.x + 820, y: CENTER.y + 80 },
    {
      expectedOutput: true,
      world: 'q-town',
      workflowStep: 'Record the changelog',
      workflowOrder: 7,
    },
    createdAt,
  ));
  edges.push(edge('edge-boundary-changelog', boundaryId, outputId, 'exports', createdAt));

  const canvas: CanvasRecord = {
    schemaVersion: CANVAS_SCHEMA_VERSION,
    id: Q_TOWN_CANVAS_ID,
    title: 'Q-Town — private Starlight second-brain world',
    description: 'Inspectable graph of second-brain districts and registered domain/repo stewards. Registry-only. Private vault unmounted.',
    createdAt,
    updatedAt: createdAt,
    nodes,
    edges,
    runs: [],
    artifacts: [],
    intakeTraces: [],
  };

  assertQTownInvariants(canvas);
  return canvas;
}

export function compactQTownTemplateNodes(): {
  nodes: Array<Pick<CanvasNode, 'kind' | 'title' | 'body' | 'position' | 'metadata'>>;
  edges: Array<{ source: number; target: number; kind: CanvasEdge['kind'] }>;
} {
  return {
    nodes: [
      {
        kind: 'note',
        title: 'Q-Town Plaza',
        body: [
          'Private Starlight world hub for the second brain.',
          'Map districts first. Register stewards second. Do not launch a live agent fleet from this template.',
        ].join('\n'),
        position: { x: 80, y: 80 },
        metadata: { role: 'plaza', world: 'q-town', workflowStep: 'Map the private world', workflowOrder: 1 },
      },
      {
        kind: 'note',
        title: 'Brain vault',
        body: 'MCP-wired operational vault. Summaries and indexes only. No raw private transcripts.',
        position: { x: 80, y: 300 },
        metadata: { district: 'brain', mount: 'brain-only', world: 'q-town', workflowStep: 'Register second-brain stewards', workflowOrder: 2 },
      },
      {
        kind: 'note',
        title: 'Private vault',
        body: 'Air-gapped. No MCP server, no live agent mount, no Git dump of private notes.',
        position: { x: 360, y: 300 },
        metadata: { district: 'private', airGapped: true, mount: 'none', world: 'q-town', workflowStep: 'Keep the private vault sealed', workflowOrder: 3 },
      },
      {
        kind: 'agent_run',
        title: 'People-map steward',
        body: 'Registered SBO people-map agent. Writes person indexes in the brain vault only.',
        position: { x: 640, y: 300 },
        metadata: { status: 'registered', deployment: 'registry-only', world: 'q-town', workflowStep: 'Register second-brain stewards', workflowOrder: 2 },
      },
      {
        kind: 'agent_run',
        title: 'Pattern-detector steward',
        body: 'Registered weekly pattern steward. Reads inbox summaries, never the air-gapped vault.',
        position: { x: 920, y: 300 },
        metadata: { status: 'registered', deployment: 'registry-only', world: 'q-town', workflowStep: 'Register second-brain stewards', workflowOrder: 2 },
      },
      {
        kind: 'agent_run',
        title: 'Domain steward roster',
        body: 'One registered steward per estate lane and repo from docs/q-town/domain-agents.v1.json. Seed with pnpm seed:q-town to materialize the full graph.',
        position: { x: 360, y: 540 },
        metadata: { status: 'registered', deployment: 'registry-only', world: 'q-town', workflowStep: 'Register domain stewards', workflowOrder: 4 },
      },
      {
        kind: 'note',
        title: 'Bless / Chronicle',
        body: 'Witness one whole artifact. Refuse dirty, untested, open-PR, or younger-than-seven-day work unless an explicit override exists.',
        position: { x: 640, y: 540 },
        metadata: { district: 'chronicle', world: 'q-town', workflowStep: 'Witness, do not bless mid-flight', workflowOrder: 5 },
      },
      {
        kind: 'mcp_tool',
        title: 'Export Q-Town context',
        body: 'Export format=context for a local handoff. Do not publish the private world.',
        position: { x: 920, y: 540 },
        metadata: { tool: 'export_canvas', world: 'q-town', workflowStep: 'Export local context', workflowOrder: 6 },
      },
    ],
    edges: [
      { source: 0, target: 1, kind: 'derives_from' },
      { source: 0, target: 2, kind: 'references' },
      { source: 0, target: 3, kind: 'runs' },
      { source: 0, target: 4, kind: 'runs' },
      { source: 0, target: 5, kind: 'runs' },
      { source: 2, target: 6, kind: 'references' },
      { source: 5, target: 7, kind: 'exports' },
      { source: 6, target: 7, kind: 'references' },
    ],
  };
}

export function assertQTownInvariants(canvas: CanvasRecord): void {
  const privateNodes = canvas.nodes.filter((item) => item.metadata.airGapped === true || item.metadata.district === 'private');
  if (privateNodes.some((item) => item.kind === 'mcp_tool')) {
    throw new Error('Air-gapped private district cannot expose an MCP tool');
  }
  if (canvas.nodes.some((item) => /sk-[A-Za-z0-9]{8,}/.test(`${item.title}\n${item.body}`))) {
    throw new Error('Q-Town canvas appears to contain a secret-shaped token');
  }
  const repoAgents = canvas.nodes.filter((item) => item.metadata.role === 'repo-agent');
  if (repoAgents.some((item) => item.metadata.status === 'running' || item.metadata.deployment !== 'registry-only')) {
    throw new Error('Repo agents must stay registered/registry-only');
  }
}

export function qTownCensus(canvas: CanvasRecord): {
  nodes: number;
  edges: number;
  domainStewards: number;
  repoAgents: number;
  airGapped: number;
} {
  return {
    nodes: canvas.nodes.length,
    edges: canvas.edges.length,
    domainStewards: canvas.nodes.filter((item) => item.metadata.role === 'domain-steward').length,
    repoAgents: canvas.nodes.filter((item) => item.metadata.role === 'repo-agent').length,
    airGapped: canvas.nodes.filter((item) => item.metadata.airGapped === true).length,
  };
}

export function renderQTownSvg(canvas: CanvasRecord): string {
  const padding = 80;
  const xs = canvas.nodes.map((item) => item.position.x);
  const ys = canvas.nodes.map((item) => item.position.y);
  const minX = Math.min(...xs) - padding;
  const minY = Math.min(...ys) - padding;
  const width = Math.max(...xs) - minX + padding;
  const height = Math.max(...ys) - minY + padding;
  const nodeMap = new Map(canvas.nodes.map((item) => [item.id, item]));

  const edges = canvas.edges.map((item) => {
    const source = nodeMap.get(item.source);
    const target = nodeMap.get(item.target);
    if (!source || !target) return '';
    const tone = item.kind === 'runs' ? '#6EA8FE' : item.kind === 'exports' ? '#79E6C5' : '#3A4258';
    return `<line x1="${source.position.x - minX}" y1="${source.position.y - minY}" x2="${target.position.x - minX}" y2="${target.position.y - minY}" stroke="${tone}" stroke-width="1.2" stroke-opacity="0.55" />`;
  }).join('\n');

  const nodes = canvas.nodes.map((item) => {
    const isPlaza = item.metadata.role === 'plaza';
    const isLane = item.metadata.role === 'domain-steward';
    const isPrivate = item.metadata.airGapped === true;
    const r = isPlaza ? 22 : isLane ? 12 : 6;
    const fill = isPrivate ? '#F5C36A' : isPlaza ? '#A78BFA' : isLane ? '#6EA8FE' : '#79E6C5';
    const label = isPlaza || isLane ? item.title.replace(/ steward$/, '') : '';
    const safeTitle = escapeXml(item.title);
    return `<g><circle cx="${item.position.x - minX}" cy="${item.position.y - minY}" r="${r}" fill="${fill}" fill-opacity="${isPlaza ? 0.95 : 0.82}"><title>${safeTitle}</title></circle>${label ? `<text x="${item.position.x - minX}" y="${item.position.y - minY + r + 14}" text-anchor="middle" fill="#F1F3F9" font-size="${isPlaza ? 13 : 10}" font-family="IBM Plex Sans, Segoe UI, sans-serif">${escapeXml(label)}</text>` : ''}</g>`;
  }).join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="Q-Town second-brain graph">
    <rect width="${width}" height="${height}" fill="#05060A" />
    ${edges}
    ${nodes}
  </svg>`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
