import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'packages', 'mcp', 'dist', 'cli.js');
const home = process.env.AGENT_CANVAS_HOME || path.join(os.homedir(), '.starlight', 'agent-canvas');
const command = process.execPath;
const args = process.argv.slice(2);
const write = args.includes('--write');
const configIndex = args.indexOf('--config');
const configPath = path.resolve(configIndex >= 0 ? args[configIndex + 1] : path.join(os.homedir(), '.codex', 'config.toml'));

function slash(value) {
  return value.replace(/\\/g, '/');
}

function tomlLiteral(value) {
  return `'${value.replace(/'/g, "''")}'`;
}

function timestamp() {
  return new Date().toISOString().replace(/[^0-9A-Za-z_-]/g, '-');
}

function codexBlock() {
  return [
    '[mcp_servers.starlight-agent-canvas]',
    `command = ${tomlLiteral(command)}`,
    `args = ["${slash(cliPath)}"]`,
    'startup_timeout_sec = 60',
    '',
    '[mcp_servers.starlight-agent-canvas.env]',
    `AGENT_CANVAS_HOME = "${slash(home)}"`,
  ].join('\n');
}

function removeExistingBlock(raw) {
  const targetSections = new Set([
    'mcp_servers.starlight-agent-canvas',
    'mcp_servers.starlight-agent-canvas.env',
  ]);
  const lines = raw.split(/\r?\n/);
  const kept = [];
  let dropping = false;

  for (const line of lines) {
    const match = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (match) {
      dropping = targetSections.has(match[1].trim());
    }
    if (!dropping) {
      kept.push(line);
    }
  }

  return kept.join('\n').trimEnd();
}

function mergeConfig(raw) {
  const withoutExisting = removeExistingBlock(raw);
  const prefix = withoutExisting ? `${withoutExisting}\n\n` : '';
  return `${prefix}${codexBlock()}\n`;
}

function usage() {
  console.log([
    'Usage:',
    '  pnpm mcp:install:codex              # dry-run, print target and block',
    '  pnpm mcp:install:codex -- --write   # write ~/.codex/config.toml with backup',
    '  pnpm mcp:install:codex -- --config C:/path/config.toml --write',
  ].join('\n'));
}

if (args.includes('--help') || args.includes('-h')) {
  usage();
  process.exit(0);
}

if (configIndex >= 0 && !args[configIndex + 1]) {
  console.error('Missing value after --config.');
  process.exit(1);
}

const raw = existsSync(configPath) ? await readFile(configPath, 'utf8') : '';
const next = mergeConfig(raw);

if (!existsSync(cliPath)) {
  console.warn(`[warn] Built MCP server is missing: ${cliPath}`);
  console.warn('[warn] Run pnpm mcp:build before restarting Codex.');
}

if (!write) {
  console.log('[dry-run] Codex config target:');
  console.log(configPath);
  console.log('');
  console.log('[dry-run] Block to install or replace:');
  console.log(codexBlock());
  console.log('');
  console.log('Run with --write to update the config and create a timestamped backup.');
  process.exit(0);
}

await mkdir(path.dirname(configPath), { recursive: true });
if (existsSync(configPath)) {
  const backupPath = `${configPath}.bak-${timestamp()}`;
  await copyFile(configPath, backupPath);
  console.log(`[ok] Backup written: ${backupPath}`);
}
await writeFile(configPath, next, 'utf8');
console.log(`[ok] Installed starlight-agent-canvas MCP server in ${configPath}`);
console.log(`[ok] AGENT_CANVAS_HOME=${slash(home)}`);
console.log('Restart Codex so it reloads MCP servers.');
