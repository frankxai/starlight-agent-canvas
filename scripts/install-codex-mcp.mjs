import { lstat, mkdir, open, readFile, rename, link, unlink, access, constants } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ConfigHold, planCodexConfig, configLimit } from './codex-config.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'packages', 'mcp', 'dist', 'cli.js');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

async function snapshot(configPath, ownedPublicationLink) {
  try {
    const info = await lstat(configPath);
    if (!info.isFile() || info.isSymbolicLink()) throw new ConfigHold('Config must be a regular, unlinked file.');
    if (info.nlink !== 1) {
      const ownedLink = ownedPublicationLink ? await lstat(ownedPublicationLink).catch(() => null) : null;
      if (info.nlink !== 2 || !ownedLink?.isFile() || ownedLink.isSymbolicLink() || ownedLink.ino !== info.ino || ownedLink.dev !== info.dev) {
        throw new ConfigHold('Config must be a regular, unlinked file.');
      }
    }
    if (info.size > configLimit) throw new ConfigHold('Config exceeds the 1 MiB edit limit.');
    const bytes = await readFile(configPath);
    const raw = bytes.toString('utf8');
    if (!Buffer.from(raw, 'utf8').equals(bytes)) throw new ConfigHold('Config must be UTF-8.');
    return { bytes, raw, mode: info.mode & 0o777, sha: hash(bytes) };
  } catch (error) {
    if (error.code === 'ENOENT') return { bytes: null, raw: '', mode: 0o600, sha: 'missing' };
    throw error;
  }
}

async function exclusiveFile(file, content, mode) {
  const handle = await open(file, 'wx', mode);
  try { await handle.writeFile(content); await handle.sync(); }
  catch (error) {
    await handle.close().catch(() => {});
    await unlink(file).catch(() => {});
    throw error;
  }
  await handle.close();
}

export async function installConfig(configPath, options, { expectedSha, beforePublish, removeOwnedFile = unlink } = {}) {
  await mkdir(path.dirname(configPath), { recursive: true });
  const lockPath = `${configPath}.canvas-install.lock`;
  const nonce = randomUUID();
  const owner = JSON.stringify({ nonce, pid: process.pid, host: os.hostname() });
  try { await exclusiveFile(lockPath, owner, 0o600); }
  catch (error) {
    if (error.code === 'EEXIST') throw new ConfigHold(`Another installer or interrupted install owns ${lockPath}. Inspect it; no age-based removal is performed.`);
    throw error;
  }
  const tempPath = `${configPath}.canvas-install-${nonce}.tmp`;
  let tempCreated = false;
  const cleanupWarnings = [];
  let primaryError;
  try {
    const original = await snapshot(configPath);
    if (expectedSha && expectedSha !== original.sha) throw new ConfigHold('Config changed since the reviewed hash.');
    const plan = planCodexConfig(original.raw, options);
    if (plan.next === original.raw) return { ...plan, changed: false, sha: original.sha, cleanupWarnings };
    if (original.bytes !== null) {
      if ((original.mode & 0o222) === 0) throw new ConfigHold('Read-only config requires a manual edit.');
      await access(configPath, constants.W_OK);
    }
    await exclusiveFile(tempPath, plan.next, original.mode);
    tempCreated = true;
    const backupPath = original.bytes ? `${configPath}.bak-${new Date().toISOString().replace(/[^0-9A-Za-z_-]/g, '-')}-${nonce}` : null;
    if (backupPath) await exclusiveFile(backupPath, original.bytes, 0o600);
    await beforePublish?.();
    if ((await snapshot(configPath)).sha !== original.sha) throw new ConfigHold('Config changed during installation. Existing config and backup are preserved.');
    if (original.bytes === null) {
      await link(tempPath, configPath);
      await removeOwnedFile(tempPath).catch(error => cleanupWarnings.push(`Config published with its owned temporary hard link retained (${error.code || 'unknown'}). Inspect and remove only this name before another install: ${tempPath}`));
    } else {
      // Other editors do not share this cooperative lock; keep them idle while
      // replacing an existing config after its final hash check.
      await rename(tempPath, configPath);
    }
    tempCreated = false;
    const published = await snapshot(configPath, original.bytes === null ? tempPath : undefined);
    if (published.sha !== hash(Buffer.from(plan.next))) throw new ConfigHold('Config changed after publication; inspect the current file and backup.');
    return { ...plan, changed: true, sha: published.sha, backupPath, cleanupWarnings };
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    if (tempCreated) await removeOwnedFile(tempPath).catch(error => cleanupWarnings.push(`Temporary file cleanup failed (${error.code || 'unknown'}): ${tempPath}`));
    if (await readFile(lockPath, 'utf8').catch(() => '') === owner) {
      await removeOwnedFile(lockPath).catch(error => cleanupWarnings.push(`Installer lock cleanup failed (${error.code || 'unknown'}): ${lockPath}`));
    } else {
      cleanupWarnings.push(`Installer lock owner changed; preserved: ${lockPath}`);
    }
    if (primaryError) primaryError.cleanupWarnings = [...(primaryError.cleanupWarnings ?? []), ...cleanupWarnings];
  }
}

async function main() {
  const args = process.argv.slice(2).filter(arg => arg !== '--');
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: pnpm mcp:install:codex [-- --write] [--config <path>] [--expected-sha <dry-run hash>]\nNew registrations are disabled. Activate only the chosen Codex task with -c mcp_servers.starlight-agent-canvas.enabled=true.');
    return;
  }
  function value(flag) {
    const i = args.indexOf(flag);
    if (i < 0) return undefined;
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new ConfigHold(`Missing value after ${flag}.`);
    return args[i + 1];
  }
  const allowedFlags = new Set(['--write', '--config', '--expected-sha']);
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    if (!allowedFlags.has(args[i]) || seen.has(args[i])) throw new ConfigHold('Unknown or duplicate installer option.');
    seen.add(args[i]);
    if (args[i] !== '--write') { value(args[i]); i++; }
  }
  const configPath = path.resolve(value('--config') ?? path.join(os.homedir(), '.codex', 'config.toml'));
  const expectedSha = value('--expected-sha');
  const options = { command: process.execPath, cliPath, home: process.env.AGENT_CANVAS_HOME || path.join(os.homedir(), '.starlight', 'agent-canvas') };
  if (!args.includes('--write')) {
    const original = await snapshot(configPath);
    if (expectedSha && expectedSha !== original.sha) throw new ConfigHold('Config changed since the reviewed hash.');
    const plan = planCodexConfig(original.raw, options);
    console.log(`[dry-run] Target: ${configPath}\n[dry-run] Expected SHA256: ${original.sha}\n[dry-run] Managed launcher: ${JSON.stringify(options.command)} ${JSON.stringify(options.cliPath)}\n[dry-run] Base activation: enabled=${plan.enabled} (${plan.activation})\n[dry-run] Data home: ${JSON.stringify(plan.home)}\n[dry-run] Other settings/environment values are preserved and omitted from output.\nUse --write to publish with a backup. --expected-sha binds the write to this inspected config.`);
    return;
  }
  try {
    if (!(await lstat(cliPath)).isFile()) throw new ConfigHold('Built MCP server is missing; run pnpm mcp:build before writing config.');
  } catch (error) {
    if (error.code === 'ENOENT') throw new ConfigHold('Built MCP server is missing; run pnpm mcp:build before writing config.');
    throw error;
  }
  const result = await installConfig(configPath, options, { expectedSha });
  console.log(`[ok] ${result.changed ? 'Installed' : 'Already configured'}: ${configPath}\n[ok] SHA256: ${result.sha}\n[ok] Base activation: enabled=${result.enabled} (${result.activation})`);
  if (result.backupPath) console.log(`[ok] Backup: ${result.backupPath}`);
  for (const warning of result.cleanupWarnings) console.warn(`[warn] Config publication succeeded. ${warning}`);
  console.log('For this task: codex -c mcp_servers.starlight-agent-canvas.enabled=true\nVerify tool discovery/calls in that task. Configuration and transport smoke alone do not prove native activation.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => {
    console.error(error instanceof ConfigHold ? `[hold] ${error.message}` : `[hold] Installation failed (${error.code || 'unknown'}); inspect config/backup and installer lock.`);
    for (const warning of error.cleanupWarnings ?? []) console.warn(`[warn] ${warning}`);
    process.exitCode = 2;
  });
}
