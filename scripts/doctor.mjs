import { existsSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const root = process.cwd();
const minNode = [22, 13, 0];
const jsonOutput = process.argv.includes('--json');
const checks = [];

function compareVersions(current, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    const value = current[index] ?? 0;
    if (value > minimum[index]) return 1;
    if (value < minimum[index]) return -1;
  }
  return 0;
}

async function commandVersion(command, args) {
  const candidates = process.platform === 'win32' ? [`${command}.cmd`, command] : [command];
  if (command === 'pnpm' && process.env.npm_execpath) {
    candidates.unshift(process.env.npm_execpath);
  }
  try {
    for (const executable of candidates) {
      try {
        const execArgs = executable === process.env.npm_execpath ? [executable, ...args] : args;
        const execCommand = executable === process.env.npm_execpath ? process.execPath : executable;
        const { stdout } = await execFileAsync(execCommand, execArgs, { cwd: root });
        return stdout.trim().split(/\r?\n/)[0] || 'available';
      } catch {
        // Try the next known executable form.
      }
    }
    const { stdout } = await execAsync(`${command} ${args.join(' ')}`, { cwd: root });
    return stdout.trim().split(/\r?\n/)[0] || 'available';
  } catch {
    return null;
  }
}

async function canRead(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function fileIncludes(file, terms) {
  try {
    const raw = await readFile(file, 'utf8');
    return terms.every((term) => raw.includes(term));
  } catch {
    return false;
  }
}

function slash(value) {
  return value.replace(/\\/g, '/');
}

function section(raw, name) {
  const lines = raw.split(/\r?\n/);
  const collected = [];
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

function parseTomlString(block, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`^\\s*${escaped}\\s*=\\s*(['"])([\\s\\S]*?)\\1\\s*$`, 'm'));
  return match?.[2];
}

function parseTomlFirstArrayString(block, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = block.match(new RegExp(`^\\s*${escaped}\\s*=\\s*\\[\\s*(['"])([\\s\\S]*?)\\1`, 'm'));
  return match?.[2];
}

async function codexConfigStatus(configPath, expectedCliPath, expectedHome) {
  if (!(await canRead(configPath))) {
    return {
      exists: false,
      hasServer: false,
      hasEnv: false,
      cliPath: '',
      home: '',
      pointsAtCurrentCli: false,
      usesExpectedHome: false,
    };
  }

  const raw = await readFile(configPath, 'utf8');
  const server = section(raw, 'mcp_servers.starlight-agent-canvas');
  const env = section(raw, 'mcp_servers.starlight-agent-canvas.env');
  const cliPath = parseTomlFirstArrayString(server, 'args') ?? '';
  const home = parseTomlString(env, 'AGENT_CANVAS_HOME') ?? '';
  const normalizedCli = slash(path.resolve(cliPath));
  const normalizedExpectedCli = slash(path.resolve(expectedCliPath));
  const normalizedHome = home ? slash(path.resolve(home)) : '';
  const normalizedExpectedHome = slash(path.resolve(expectedHome));

  return {
    exists: true,
    hasServer: Boolean(server.trim()),
    hasEnv: Boolean(env.trim()),
    cliPath,
    home,
    pointsAtCurrentCli: Boolean(cliPath) && normalizedCli === normalizedExpectedCli,
    usesExpectedHome: Boolean(home) && normalizedHome === normalizedExpectedHome,
  };
}

function status(ok, label, detail = '', options = {}) {
  const level = ok ? 'pass' : options.required ? 'fail' : 'warn';
  checks.push({
    label,
    ok,
    level,
    required: Boolean(options.required),
    detail,
  });
  if (!jsonOutput) {
    const mark = ok ? '[ok]' : options.required ? '[fail]' : '[warn]';
    console.log(`${mark} ${label}${detail ? ` - ${detail}` : ''}`);
  }
}

const nodeVersion = process.versions.node.split('.').map(Number);
const nodeOk = compareVersions(nodeVersion, minNode) >= 0;
status(nodeOk, 'Node.js', process.versions.node, { required: true });

const pnpmVersion = await commandVersion('pnpm', ['--version']);
status(Boolean(pnpmVersion), 'pnpm', pnpmVersion ?? 'not found; run corepack enable', { required: true });

const packageJsonPath = path.join(root, 'package.json');
const workspacePath = path.join(root, 'pnpm-workspace.yaml');
const mcpCliPath = path.join(root, 'packages', 'mcp', 'dist', 'cli.js');
const coreSchemaDistPath = path.join(root, 'packages', 'core', 'dist', 'schemas.js');
const mcpIndexDistPath = path.join(root, 'packages', 'mcp', 'dist', 'index.js');
const webAppPath = path.join(root, 'apps', 'web', 'package.json');
const corePackagePath = path.join(root, 'packages', 'core', 'package.json');
const mcpPackagePath = path.join(root, 'packages', 'mcp', 'package.json');
const codexConfigPath = path.join(os.homedir(), '.codex', 'config.toml');

status(await canRead(packageJsonPath), 'package.json', '', { required: true });
status(await canRead(workspacePath), 'pnpm workspace', '', { required: true });
status(await canRead(webAppPath), 'web workspace', '', { required: true });
status(await canRead(corePackagePath), 'core workspace', '', { required: true });
status(await canRead(mcpPackagePath), 'mcp workspace', '', { required: true });
status(existsSync(mcpCliPath), 'built MCP server', existsSync(mcpCliPath) ? mcpCliPath : 'run pnpm mcp:build');
status(
  await fileIncludes(coreSchemaDistPath, ['source_video', 'source_image', 'video', 'image']),
  'built core media schema',
  existsSync(coreSchemaDistPath) ? 'source/video/image kinds available' : 'run pnpm mcp:build after schema changes',
);
status(
  await fileIncludes(mcpIndexDistPath, ['ingest_video', 'ingest_image', 'ingest_anything', 'enrich_source_node', 'get_latest_canvas', 'source_video', 'source_image']),
  'built MCP media tools',
  existsSync(mcpIndexDistPath) ? 'video/image/anything ingest and enrichment tools available' : 'run pnpm mcp:build after MCP changes',
);

const home = process.env.AGENT_CANVAS_HOME
  ?? (process.platform === 'win32'
    ? path.join(process.env.USERPROFILE ?? '', '.starlight', 'agent-canvas')
    : path.join(process.env.HOME ?? '', '.starlight', 'agent-canvas'));
status(Boolean(home), 'canvas data home', home || 'set AGENT_CANVAS_HOME');

if (await canRead(path.join(root, '.mcp.json'))) {
  const raw = await readFile(path.join(root, '.mcp.json'), 'utf8');
  const config = JSON.parse(raw);
  const server = config.mcpServers?.['starlight-agent-canvas'];
  status(Boolean(server?.command), '.mcp.json command', server?.command ?? 'missing');
  status(Boolean(server?.args?.length), '.mcp.json args', server?.args?.join(' ') ?? 'missing');
  const firstArg = typeof server?.args?.[0] === 'string' ? server.args[0] : '';
  status(Boolean(firstArg) && slash(path.resolve(firstArg)) === slash(path.resolve(mcpCliPath)), '.mcp.json points at this MCP build', firstArg || 'missing');
}

const codex = await codexConfigStatus(codexConfigPath, mcpCliPath, home);
status(codex.exists, 'Codex config', codex.exists ? codexConfigPath : 'run pnpm mcp:install:codex -- --write');
status(codex.hasServer && codex.hasEnv, 'Codex MCP block', codex.hasServer && codex.hasEnv ? 'starlight-agent-canvas configured' : 'missing server/env sections');
status(codex.pointsAtCurrentCli, 'Codex MCP CLI path', codex.cliPath || 'missing');
status(codex.usesExpectedHome, 'Codex canvas home env', codex.home || 'missing');

const summary = {
  pass: checks.filter((check) => check.level === 'pass').length,
  warn: checks.filter((check) => check.level === 'warn').length,
  fail: checks.filter((check) => check.level === 'fail').length,
};

if (jsonOutput) {
  console.log(JSON.stringify({
    ok: summary.fail === 0,
    summary,
    repoRoot: root,
    canvasHome: home,
    mcpCliPath,
    codexConfigPath,
    checks,
    nextSteps: [
      'pnpm install',
      'pnpm mcp:build && pnpm mcp:smoke',
      'pnpm seed:starlight',
      'pnpm mcp:install:codex -- --write   # optional, then restart Codex',
      'pnpm dev',
    ],
  }, null, 2));
} else {
  console.log('');
  console.log('Next steps:');
  console.log('1. pnpm install');
  console.log('2. pnpm mcp:build && pnpm mcp:smoke');
  console.log('3. pnpm seed:starlight');
  console.log('4. pnpm mcp:install:codex -- --write   # optional, then restart Codex');
  console.log('5. pnpm dev');
}

if (summary.fail > 0) {
  process.exitCode = 1;
}
