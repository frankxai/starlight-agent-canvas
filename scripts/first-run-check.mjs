import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const args = process.argv.slice(2);
const argSet = new Set(args);
const repoRoot = process.cwd();
const pnpmExecPath = process.env.npm_execpath?.toLowerCase().includes('pnpm')
  ? process.env.npm_execpath
  : '';
const pnpm = pnpmExecPath ? process.execPath : process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const pnpmPrefixArgs = pnpmExecPath ? [pnpmExecPath] : [];

function readOption(name, fallback) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
}

function run(command, commandArgs, label, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`\n== ${label} ==`);
    console.log(`${command} ${commandArgs.join(' ')}`);
    const child = spawn(command, commandArgs, {
      cwd: repoRoot,
      env: { ...process.env, ...options.env },
      shell: options.shell ?? false,
      stdio: options.stdio ?? 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with exit code ${code}`));
    });
  });
}

function runPnpm(commandArgs, label, options = {}) {
  const useShell = !pnpmExecPath && process.platform === 'win32';
  return run(pnpm, [...pnpmPrefixArgs, ...commandArgs], label, { ...options, shell: useShell });
}

function findOpenPort(preferred) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE' && preferred !== 0) {
        findOpenPort(0).then(resolve, reject);
        return;
      }
      reject(error);
    });
    server.listen(preferred, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : preferred;
      server.close(() => resolve(port));
    });
  });
}

function waitForExit(child, timeoutMs = 5_000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function stopWindowsListenersOnPort(port) {
  if (process.platform !== 'win32' || !port) return;
  const command = [
    `$owners = Get-NetTCPConnection -LocalPort ${Number(port)} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`,
    'foreach ($owner in $owners) {',
    '  if ($owner -and $owner -ne $PID) { Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue }',
    '}',
  ].join('; ');
  spawnSync('powershell.exe', ['-NoProfile', '-Command', command], { stdio: 'ignore' });
}

async function stopServer(child, port) {
  if (!child) {
    stopWindowsListenersOnPort(port);
    return;
  }
  if (child.killed || child.exitCode !== null || child.signalCode !== null) {
    stopWindowsListenersOnPort(port);
    return;
  }
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    await waitForExit(child);
    stopWindowsListenersOnPort(port);
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch {
    child.kill('SIGTERM');
  }
  await waitForExit(child);
  if (child.exitCode === null && child.signalCode === null) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch {
      child.kill('SIGKILL');
    }
    await waitForExit(child, 2_000);
  }
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function fetchText(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}: ${text}`);
  }
  return text;
}

function postJson(body) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

async function waitFor(url, timeoutMs = 45_000) {
  const started = Date.now();
  let lastError = new Error('not attempted');
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${url} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw lastError;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function main() {
  const preferredPort = Number(readOption('--port', '3210'));
  const port = await findOpenPort(Number.isFinite(preferredPort) ? preferredPort : 3210);
  const baseUrl = `http://127.0.0.1:${port}`;
  const tempHome = await mkdtemp(path.join(os.tmpdir(), 'starlight-agent-canvas-first-run-'));
  const env = {
    AGENT_CANVAS_HOME: tempHome,
    AGENT_CANVAS_REPO_ROOT: repoRoot,
  };
  let server;

  try {
    if (!argSet.has('--skip-build')) {
      await runPnpm(['build'], 'Build production app');
    }

    await runPnpm(['doctor:json'], 'Doctor JSON', { env });

    console.log(`\n== Start production preview ==`);
    console.log(`${pnpm} ${[...pnpmPrefixArgs, '--filter', '@starlight-agent-canvas/web', 'start', '-p', String(port)].join(' ')}`);
    server = spawn(pnpm, [...pnpmPrefixArgs, '--filter', '@starlight-agent-canvas/web', 'start', '-p', String(port)], {
      cwd: repoRoot,
      env: { ...process.env, ...env },
      shell: !pnpmExecPath && process.platform === 'win32',
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stdout.on('data', (chunk) => process.stdout.write(chunk));
    server.stderr.on('data', (chunk) => process.stderr.write(chunk));

    await waitFor(`${baseUrl}/api/setup/status`);
    const setup = await fetchJson(`${baseUrl}/api/setup/status`);
    assert(setup.canvasHome === tempHome, 'Setup status did not use the temporary first-run data home.');
    assert(setup.mcp?.built === true, 'MCP server is not built in setup status.');
    const expectedInputContracts = ['youtube', 'video', 'image', 'web', 'pdf', 'text', 'note'];
    const inputContracts = Array.isArray(setup.firstSuccess?.inputContracts) ? setup.firstSuccess.inputContracts : [];
    const inputIds = inputContracts.map((contract) => contract.id);
    assert(expectedInputContracts.every((id) => inputIds.includes(id)), 'Setup status is missing supported-input contract mappings.');

    const demo = await fetchJson(`${baseUrl}/api/canvases/demo`, { method: 'POST' });
    assert(demo.canvas?.nodes?.length >= 5, 'Demo canvas did not import with expected nodes.');
    assert(demo.canvas?.artifacts?.some((artifact) => artifact.chunks?.length), 'Demo canvas has no chunked artifacts.');

    const context = await fetchText(`${baseUrl}/api/canvases/${demo.canvas.id}/export?format=context`);
    assert(context.includes('Agent Context Packet'), 'Context export is missing the packet heading.');
    assert(context.includes('Source Chunk Manifest'), 'Context export is missing chunk manifest.');
    assert(context.includes('artifact-youtube-nodeflow:chunk-001'), 'Context export is missing demo YouTube chunk id.');

    const canvases = await fetchJson(`${baseUrl}/api/canvases`);
    assert(canvases.canvases?.some((canvas) => canvas.id === demo.canvas.id), 'Imported demo canvas is not listed.');

    const proof = await fetchJson(`${baseUrl}/api/canvases`, postJson({
      title: 'First-run supported input proof',
      template: 'blank',
    }));
    const mixedIntake = [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.loom.com/share/starlight-agent-canvas-proof',
      'https://example.com/starlight-agent-canvas-proof.png',
      'https://example.com/starlight-agent-canvas-research',
      '',
      'First-run proof notes: compare the video, image, page, and human note as shared local agent context.',
    ].join('\n');
    const anything = await fetchJson(`${baseUrl}/api/canvases/${proof.canvas.id}/ingest/anything`, postJson({
      body: mixedIntake,
      fetchRemote: false,
      action: 'summarize',
      position: { x: 120, y: 140 },
    }));
    const mappedKinds = new Set((anything.nodes ?? []).map((node) => node.kind));
    const artifactKinds = new Set((anything.artifacts ?? []).map((artifact) => artifact.kind));
    for (const kind of ['source_youtube', 'source_video', 'source_image', 'source_url', 'note']) {
      assert(mappedKinds.has(kind), `Paste-anything first-run proof did not create ${kind}.`);
    }
    for (const kind of ['youtube', 'video', 'image', 'url', 'manual']) {
      assert(artifactKinds.has(kind), `Paste-anything first-run proof did not create ${kind} artifact.`);
    }
    assert(anything.outputNode?.kind === 'output', 'Paste-anything first-run proof did not create an output node.');
    assert(anything.run?.action === 'summarize', 'Paste-anything first-run proof did not run summarize.');

    const proofContext = await fetchText(`${baseUrl}/api/canvases/${proof.canvas.id}/export?format=context`);
    for (const kind of ['source_youtube', 'source_video', 'source_image', 'source_url']) {
      assert(proofContext.includes(kind), `Supported-input context export is missing ${kind}.`);
    }
    assert(proofContext.includes('First-run proof notes'), 'Supported-input context export is missing human notes.');

    console.log('');
    console.log('[ok] First-run check passed.');
    console.log(`Preview checked: ${baseUrl}`);
  } finally {
    if (server && !server.killed) {
      await stopServer(server, port);
    }
    if (!argSet.has('--keep-home')) {
      await rm(tempHome, { recursive: true, force: true });
    } else {
      console.log(`Kept first-run data home: ${tempHome}`);
    }
  }
}

try {
  await main();
} catch (error) {
  console.error('');
  console.error(`[first-run check failed] ${(error).message}`);
  process.exit(1);
}
