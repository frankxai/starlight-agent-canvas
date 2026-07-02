import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

type FirstSuccessContract = {
  schemaVersion: string;
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

function getAgentCanvasHome(): string {
  return process.env.AGENT_CANVAS_HOME?.trim() || path.join(os.homedir(), '.starlight', 'agent-canvas');
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(/*turbopackIgnore: true*/ filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileIncludes(filePath: string, terms: string[]): Promise<boolean> {
  try {
    const raw = await readFile(/*turbopackIgnore: true*/ filePath, 'utf8');
    return terms.every((term) => raw.includes(term));
  } catch {
    return false;
  }
}

async function loadFirstSuccessContract(repoRoot: string): Promise<FirstSuccessContract> {
  const raw = await readFile(/*turbopackIgnore: true*/ path.join(repoRoot, 'docs', 'first-success.contract.json'), 'utf8');
  return JSON.parse(raw) as FirstSuccessContract;
}

function normalizeRuntimePath(value: string): string {
  const normalized = slash(path.normalize(value)).replace(/\/+$/, '');
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

function repoRootFromRuntime(): string {
  const configured = process.env.AGENT_CANVAS_REPO_ROOT?.trim();
  const base = path.normalize(configured || process.cwd());
  if (path.basename(base) === 'web' && path.basename(path.dirname(base)) === 'apps') {
    return path.dirname(path.dirname(base));
  }
  return base;
}

function slash(value: string): string {
  return value.replace(/\\/g, '/');
}

function section(raw: string, name: string): string {
  const lines = raw.split(/\r?\n/);
  const collected: string[] = [];
  let inSection = false;
  for (const line of lines) {
    const match = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (match) {
      if (inSection) break;
      inSection = match[1].trim() === name;
      continue;
    }
    if (inSection) collected.push(line);
  }
  return collected.join('\n');
}

function parseTomlString(block: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`^\\s*${escaped}\\s*=\\s*(['"])([\\s\\S]*?)\\1\\s*$`, 'm'));
  return match?.[2];
}

function parseTomlFirstArrayString(block: string, key: string): string | undefined {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`^\\s*${escaped}\\s*=\\s*\\[\\s*(['"])([\\s\\S]*?)\\1`, 'm'));
  return match?.[2];
}

async function codexConfigStatus(configPath: string) {
  if (!(await exists(configPath))) {
    return {
      exists: false,
      hasServer: false,
      hasEnv: false,
      configuredCliPath: '',
      configuredHome: '',
      serverPathMatches: false,
      homeMatches: false,
    };
  }
  const raw = await readFile(/*turbopackIgnore: true*/ configPath, 'utf8');
  const server = section(raw, 'mcp_servers.starlight-agent-canvas');
  const env = section(raw, 'mcp_servers.starlight-agent-canvas.env');
  return {
    exists: true,
    hasServer: Boolean(server.trim()),
    hasEnv: Boolean(env.trim()),
    configuredCliPath: parseTomlFirstArrayString(server, 'args') ?? '',
    configuredHome: parseTomlString(env, 'AGENT_CANVAS_HOME') ?? '',
    serverPathMatches: false,
    homeMatches: false,
  };
}

export async function GET() {
  const repoRoot = repoRootFromRuntime();
  const mcpCliPath = path.join(repoRoot, 'packages', 'mcp', 'dist', 'cli.js');
  const coreSchemaDistPath = path.join(repoRoot, 'packages', 'core', 'dist', 'schemas.js');
  const mcpIndexDistPath = path.join(repoRoot, 'packages', 'mcp', 'dist', 'index.js');
  const codexConfigPath = path.join(os.homedir(), '.codex', 'config.toml');
  const codex = await codexConfigStatus(codexConfigPath);
  const canvasHome = getAgentCanvasHome();
  const firstSuccessContract = await loadFirstSuccessContract(repoRoot);
  const serverPathMatches = Boolean(codex.configuredCliPath)
    && normalizeRuntimePath(codex.configuredCliPath) === normalizeRuntimePath(mcpCliPath);
  const homeMatches = Boolean(codex.configuredHome)
    && normalizeRuntimePath(codex.configuredHome) === normalizeRuntimePath(canvasHome);

  return NextResponse.json({
    repoRoot,
    canvasHome,
    homeMode: process.env.AGENT_CANVAS_HOME ? 'custom' : 'default',
    mcp: {
      built: await exists(mcpCliPath),
      mediaReady: (await fileIncludes(coreSchemaDistPath, ['source_video', 'source_image', 'video', 'image']))
        && (await fileIncludes(mcpIndexDistPath, ['ingest_video', 'ingest_image', 'source_video', 'source_image'])),
      cliPath: mcpCliPath,
      smokeCommand: 'pnpm mcp:smoke',
      buildCommand: 'pnpm mcp:build',
    },
    codex: {
      configPath: codexConfigPath,
      configExists: codex.exists,
      serverBlockExists: codex.hasServer,
      envBlockExists: codex.hasEnv,
      serverConfigured: codex.hasServer && codex.hasEnv && serverPathMatches && homeMatches,
      serverPathMatches,
      homeMatches,
      configuredCliPath: codex.configuredCliPath,
      configuredHome: codex.configuredHome,
      installDryRunCommand: 'pnpm mcp:install:codex',
      installWriteCommand: 'pnpm mcp:install:codex -- --write',
    },
    setup: {
      localCommand: 'pnpm setup:local',
      verifyCommand: 'pnpm verify',
      docs: [
        'docs/install.md',
        'docs/adoption-report.md',
        'docs/mcp-setup.md',
        'docs/codex-integration.md',
      ],
    },
    adoption: {
      reportCommand: 'pnpm adoption:report',
      jsonCommand: 'pnpm adoption:report:json',
      docs: ['docs/adoption-report.md', 'docs/readiness-evidence.md'],
    },
    firstSuccess: {
      schemaVersion: firstSuccessContract.schemaVersion,
      contractCommand: 'pnpm first-success',
      jsonCommand: 'pnpm first-success:json',
      docs: ['docs/first-success.md', 'docs/first-success.contract.json', 'docs/operator-loop.md'],
      proofCommands: ['pnpm first-run:check', 'pnpm canvas:smoke', 'pnpm mcp:smoke'],
      phases: firstSuccessContract.phases.map((phase) => ({
        id: phase.id,
        label: phase.label,
        detail: phase.detail,
      })),
      inputContracts: firstSuccessContract.inputContracts,
    },
    agent: {
      prompt: [
        'Use starlight-agent-canvas as shared local context.',
        'Call get_latest_canvas, read the graph before writing, add durable evidence through ingest_anything when new context appears, run the smallest useful action, then export_canvas with format "codex".',
        'Return node ids, artifact ids, chunk ids, and every node/action changed.',
      ].join(' '),
      terminalHandoffCommand: 'pnpm canvas -- export latest --format codex --out .agent-canvas/latest-codex.md',
      tools: [
        {
          name: 'get_latest_canvas',
          detail: 'resume freshest graph',
        },
        {
          name: 'ingest_anything',
          detail: 'map links, notes, media',
        },
        {
          name: 'run_node_action',
          detail: 'brief, claims, ask',
        },
        {
          name: 'export_canvas',
          detail: 'codex/context handoff',
        },
      ],
    },
    activation: {
      firstRunCheckCommand: 'pnpm first-run:check',
      previewCommand: 'pnpm preview:prod',
      codexPrompt: [
        'Use starlight-agent-canvas as shared local context.',
        'Find the most recently updated canvas, read it before writing, identify the source nodes and artifacts that matter, run one useful action, then export format "codex".',
        'Return the node ids, artifact ids, chunk ids, and every node/action you changed.',
      ].join(' '),
      steps: [
        {
          id: 'install',
          label: 'Install and health',
          detail: 'Run setup, build MCP, smoke the server, seed a canvas, and verify local health.',
          command: 'node scripts/setup.mjs',
        },
        {
          id: 'proof',
          label: 'Load proof canvas',
          detail: 'Use Demo or a workflow template so the first viewport contains real nodes, chunks, and handoff context.',
          action: 'load_demo',
        },
        {
          id: 'context',
          label: 'Map your own source',
          detail: 'Paste a YouTube/video link, transcript, URL, PDF, file, or note and turn it into typed context.',
          action: 'focus_intake',
        },
        {
          id: 'handoff',
          label: 'Export context',
          detail: 'Copy Context for any agent, or Codex for a ready continuation prompt scoped to selected nodes.',
          action: 'copy_context',
        },
        {
          id: 'codex',
          label: 'Wire Codex MCP',
          detail: 'Install the MCP config, restart Codex, and keep future work on the same local canvas.',
          command: 'pnpm mcp:install:codex -- --write',
        },
      ],
    },
  });
}
