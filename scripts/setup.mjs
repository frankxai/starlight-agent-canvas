import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const pnpmExecPath = process.env.npm_execpath?.toLowerCase().includes('pnpm')
  ? process.env.npm_execpath
  : '';
const pnpm = pnpmExecPath ? process.execPath : process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const pnpmPrefixArgs = pnpmExecPath ? [pnpmExecPath] : [];
const defaultHome = path.join(os.homedir(), '.starlight', 'agent-canvas');
const canvasHome = process.env.AGENT_CANVAS_HOME || defaultHome;

function usage() {
  console.log([
    'Usage:',
    '  node scripts/setup.mjs',
    '  pnpm setup:local',
    '',
    'Options:',
    '  --skip-install       Do not run pnpm install',
    '  --skip-smoke         Do not run MCP or Codex config smoke tests',
    '  --skip-seed          Do not seed the Starlight OS canvas',
    '  --codex-write        Install Codex MCP config with backup',
    '  --verify            Run pnpm verify after setup',
  ].join('\n'));
}

function run(command, commandArgs, label, useShell = false) {
  return new Promise((resolve, reject) => {
    console.log(`\n== ${label} ==`);
    console.log(`${command} ${commandArgs.join(' ')}`);
    const child = spawn(command, commandArgs, {
      cwd: process.cwd(),
      env: process.env,
      shell: useShell,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${label} failed with exit code ${code}`));
      }
    });
  });
}

function runPnpm(commandArgs, label) {
  const useShell = !pnpmExecPath && process.platform === 'win32';
  return run(pnpm, [...pnpmPrefixArgs, ...commandArgs], label, useShell);
}

if (args.has('--help') || args.has('-h')) {
  usage();
  process.exit(0);
}

console.log('Starlight Agent Canvas local setup');
console.log(`AGENT_CANVAS_HOME=${canvasHome}`);
console.log('No provider keys are required for v0.1.');

try {
  if (!args.has('--skip-install')) {
    await runPnpm(['install'], 'Install dependencies');
  }
  await runPnpm(['mcp:build'], 'Build MCP server');
  await runPnpm(['doctor'], 'Doctor');
  if (!args.has('--skip-smoke')) {
    await runPnpm(['mcp:smoke'], 'MCP smoke test');
    await runPnpm(['mcp:codex:smoke'], 'Codex config smoke test');
  }
  if (!args.has('--skip-seed')) {
    await runPnpm(['seed:starlight'], 'Seed Starlight OS canvas');
  }
  if (args.has('--verify')) {
    await runPnpm(['verify'], 'Full verification');
  }
  if (args.has('--codex-write')) {
    await runPnpm(['mcp:install:codex', '--', '--write'], 'Install Codex MCP config');
  } else {
    await runPnpm(['mcp:install:codex'], 'Show Codex MCP config');
  }

  console.log('');
  console.log('[ok] Setup complete.');
  console.log('Proof contract: pnpm first-success');
  console.log('Next: pnpm dev');
  console.log('Then open: http://localhost:3000');
  console.log('Production preview: pnpm preview:prod');
} catch (error) {
  console.error('');
  console.error(`[setup failed] ${(error).message}`);
  process.exit(1);
}
