import { existsSync } from 'node:fs';
import { access, readFile } from 'node:fs/promises';
import { exec, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import process from 'node:process';

const execFileAsync = promisify(execFile);
const execAsync = promisify(exec);
const root = process.cwd();
const minNode = [20, 11, 0];

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

function status(ok, label, detail = '') {
  const mark = ok ? '[ok]' : '[warn]';
  console.log(`${mark} ${label}${detail ? ` - ${detail}` : ''}`);
}

const nodeVersion = process.versions.node.split('.').map(Number);
const nodeOk = compareVersions(nodeVersion, minNode) >= 0;
status(nodeOk, 'Node.js', process.versions.node);

const pnpmVersion = await commandVersion('pnpm', ['--version']);
status(Boolean(pnpmVersion), 'pnpm', pnpmVersion ?? 'not found; run corepack enable');

const packageJsonPath = path.join(root, 'package.json');
const workspacePath = path.join(root, 'pnpm-workspace.yaml');
const mcpCliPath = path.join(root, 'packages', 'mcp', 'dist', 'cli.js');
const webAppPath = path.join(root, 'apps', 'web', 'package.json');
const corePackagePath = path.join(root, 'packages', 'core', 'package.json');
const mcpPackagePath = path.join(root, 'packages', 'mcp', 'package.json');

status(await canRead(packageJsonPath), 'package.json');
status(await canRead(workspacePath), 'pnpm workspace');
status(await canRead(webAppPath), 'web workspace');
status(await canRead(corePackagePath), 'core workspace');
status(await canRead(mcpPackagePath), 'mcp workspace');
status(existsSync(mcpCliPath), 'built MCP server', existsSync(mcpCliPath) ? mcpCliPath : 'run pnpm mcp:build');

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
}

console.log('');
console.log('Next steps:');
console.log('1. pnpm install');
console.log('2. pnpm mcp:build && pnpm mcp:smoke');
console.log('3. pnpm seed:starlight');
console.log('4. pnpm dev');

if (!nodeOk || !pnpmVersion) {
  process.exitCode = 1;
}
