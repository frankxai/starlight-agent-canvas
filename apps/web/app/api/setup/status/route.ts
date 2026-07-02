import { access, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getAgentCanvasHome } from '@starlight-agent-canvas/core';

export const runtime = 'nodejs';

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findRepoRoot(start: string): Promise<string> {
  let current = path.resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    const packagePath = path.join(current, 'package.json');
    if (await exists(packagePath)) {
      try {
        const pkg = JSON.parse(await readFile(packagePath, 'utf8')) as { name?: string };
        if (pkg.name === 'starlight-agent-canvas') return current;
      } catch {
        // Continue walking; this endpoint should degrade instead of failing on a bad package file.
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return path.resolve(start);
}

async function codexConfigStatus(configPath: string) {
  if (!(await exists(configPath))) {
    return { exists: false, hasServer: false, hasEnv: false };
  }
  const raw = await readFile(configPath, 'utf8');
  return {
    exists: true,
    hasServer: /^\s*\[mcp_servers\.starlight-agent-canvas\]\s*$/m.test(raw),
    hasEnv: /^\s*\[mcp_servers\.starlight-agent-canvas\.env\]\s*$/m.test(raw),
  };
}

export async function GET() {
  const repoRoot = await findRepoRoot(process.cwd());
  const mcpCliPath = path.join(repoRoot, 'packages', 'mcp', 'dist', 'cli.js');
  const codexConfigPath = path.join(os.homedir(), '.codex', 'config.toml');
  const codex = await codexConfigStatus(codexConfigPath);
  const canvasHome = getAgentCanvasHome();

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
      serverConfigured: codex.hasServer && codex.hasEnv,
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
