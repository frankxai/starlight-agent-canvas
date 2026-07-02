#!/usr/bin/env node
import { mkdtemp, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
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

  console.log(JSON.stringify({
    ok: true,
    configPath,
    canvasHome,
    configuredCliPath,
    configuredHome,
    checks: doctor.summary,
  }, null, 2));
} finally {
  if (!keepTemp) {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
