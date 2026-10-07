#!/usr/bin/env node
import { parseCodexConfig } from './codex-config.mjs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const repoRoot = process.cwd();
const keepTemp = process.argv.includes('--keep-temp');
const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'starlight-agent-canvas-codex-'));
const configPath = path.join(tempRoot, 'codex', 'config.toml');
const canvasHome = path.join(tempRoot, 'agent-canvas-home');

function runNode(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      AGENT_CANVAS_HOME: canvasHome,
    },
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}\n${result.stdout}\n${result.stderr}`.trim());
  }

  return result.stdout.trim();
}

function assertCheck(parsed, label) {
  const check = parsed.checks?.find((item) => item.label === label);
  if (!check?.ok) {
    throw new Error(`Expected doctor check to pass: ${label}`);
  }
  return check.detail;
}

async function callConfiguredMcp(configPathForLaunch) {
  const raw = await readFile(configPathForLaunch, 'utf8');
  const server = parseCodexConfig(raw).mcp_servers?.['starlight-agent-canvas'];
  const { command, args, env } = server ?? {};
  if (server?.enabled !== false) throw new Error('New Codex registration must remain disabled by default.');
  if (!command || !args.length || !env.AGENT_CANVAS_HOME) {
    throw new Error('Could not parse command, args, or AGENT_CANVAS_HOME from generated Codex config.');
  }

  const child = spawn(command, args, {
    cwd: os.homedir(),
    env: {
      ...process.env,
      ...env,
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  let nextId = 1;
  let stdoutBuffer = '';
  let stderr = '';
  const pending = new Map();

  function failPending(error) {
    for (const { reject } of pending.values()) {
      reject(error);
    }
    pending.clear();
  }

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderr += chunk;
  });
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;
    while (stdoutBuffer.includes('\n')) {
      const newline = stdoutBuffer.indexOf('\n');
      const line = stdoutBuffer.slice(0, newline).replace(/\r$/, '');
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        failPending(new Error(`MCP server emitted invalid JSON: ${line}\n${error.message}`));
        continue;
      }
      if (message.id !== undefined && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id);
        pending.delete(message.id);
        if (message.error) {
          reject(new Error(`MCP error for id ${message.id}: ${JSON.stringify(message.error)}`));
        } else {
          resolve(message.result);
        }
      }
    }
  });

  child.on('error', (error) => {
    failPending(error);
  });
  child.on('close', (code) => {
    if (pending.size) {
      failPending(new Error(`MCP server closed before responding with code ${code}.\n${stderr}`.trim()));
    }
  });

  function request(method, params = {}) {
    const id = nextId;
    nextId += 1;
    const payload = { jsonrpc: '2.0', id, method, params };
    const promise = new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    child.stdin.write(`${JSON.stringify(payload)}\n`);
    return promise;
  }

  function notify(method, params = {}) {
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, params })}\n`);
  }

  function withTimeout(promise, label) {
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timed out waiting for configured MCP server.\n${stderr}`.trim())), 15000);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
  }

  try {
    const initialize = await withTimeout(
      request('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: {
          name: 'starlight-agent-canvas-codex-config-smoke',
          version: '0.1.0',
        },
      }),
      'initialize',
    );
    notify('notifications/initialized');
    const tools = await withTimeout(request('tools/list'), 'tools/list');
    const listCanvases = await withTimeout(
      request('tools/call', {
        name: 'list_canvases',
        arguments: {},
      }),
      'tools/call list_canvases',
    );
    return {
      command,
      args,
      envHome: env.AGENT_CANVAS_HOME,
      serverName: initialize.serverInfo?.name ?? '',
      serverVersion: initialize.serverInfo?.version ?? '',
      toolCount: Array.isArray(tools.tools) ? tools.tools.length : 0,
      canvasCount: Array.isArray(listCanvases.structuredContent?.canvases)
        ? listCanvases.structuredContent.canvases.length
        : null,
    };
  } finally {
    child.stdin.end();
    child.kill();
  }
}

try {
  runNode(['scripts/install-codex-mcp.mjs', '--config', configPath, '--write'], 'temp Codex MCP install');
  const doctorStdout = runNode(['scripts/doctor.mjs', '--config', configPath, '--json'], 'doctor temp Codex config');
  const doctor = JSON.parse(doctorStdout);

  if (!doctor.ok || doctor.summary?.fail !== 0) {
    throw new Error(`doctor reported failures for temp Codex config:\n${doctorStdout}`);
  }

  const configuredCliPath = assertCheck(doctor, 'Codex MCP CLI path');
  const configuredHome = assertCheck(doctor, 'Codex canvas home env');
  assertCheck(doctor, 'Codex MCP block');
  const launch = await callConfiguredMcp(configPath);
  if (launch.toolCount < 1 || launch.canvasCount === null) {
    throw new Error(`Configured MCP server launched but did not return tools/canvases: ${JSON.stringify(launch)}`);
  }

  console.log(JSON.stringify({
    ok: true,
    configPath,
    scope: 'configured stdio transport; native Codex activation is not exercised',
    baseEnabled: false,
    canvasHome,
    configuredCliPath,
    configuredHome,
    launch,
    checks: doctor.summary,
  }, null, 2));
} finally {
  if (!keepTemp) {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
