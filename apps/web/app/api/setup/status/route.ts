import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

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

function repoRootFromCwd(cwd: string): string {
  const resolved = path.resolve(/*turbopackIgnore: true*/ process.env.AGENT_CANVAS_REPO_ROOT || cwd);
  if (path.basename(resolved) === 'web' && path.basename(path.dirname(resolved)) === 'apps') {
    return path.resolve(resolved, '..', '..');
  }
  return resolved;
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
  const repoRoot = repoRootFromCwd(/*turbopackIgnore: true*/ process.cwd());
  const mcpCliPath = path.join(repoRoot, 'packages', 'mcp', 'dist', 'cli.js');
  const codexConfigPath = path.join(os.homedir(), '.codex', 'config.toml');
  const codex = await codexConfigStatus(codexConfigPath);
  const canvasHome = getAgentCanvasHome();
  const serverPathMatches = Boolean(codex.configuredCliPath)
    && slash(path.resolve(codex.configuredCliPath)) === slash(path.resolve(mcpCliPath));
  const homeMatches = Boolean(codex.configuredHome)
    && slash(path.resolve(codex.configuredHome)) === slash(path.resolve(canvasHome));

  return NextResponse.json({
    repoRoot,
    canvasHome,
    homeMode: process.env.AGENT_CANVAS_HOME ? 'custom' : 'default',
    mcp: {
      built: await exists(mcpCliPath),
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
        'docs/mcp-setup.md',
        'docs/codex-integration.md',
      ],
    },
  });
}
