import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm, lstat, symlink, link, unlink, chmod } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { codexBlock, planCodexConfig, parseCodexConfig, ConfigHold } from './codex-config.mjs';
import { installConfig } from './install-codex-mcp.mjs';

const options = { command: 'C:\\Program Files\\Node\'s\\node.exe', cliPath: 'C:\\work\\Canvas "study"\\cli.js', home: '/private/Canvas\'s home' };
const fixture = `# Keep this comment\nmodel = 'example'\n[mcp_servers.starlight-agent-canvas] # Existing registration\ncommand = 'old-node'\nargs = ['old.js']\nenabled = false # Deliberately task scoped\nstartup_timeout_sec = 75\ndisabled_tools = ['run_node_action']\nrequired = false\n[mcp_servers.starlight-agent-canvas.env]\nAGENT_CANVAS_HOME = '/existing/data'\nCUSTOM = 'private-value-for-preservation'\n[mcp_servers.starlight-agent-canvas.tools.run_node_action]\napproval_mode = 'approve'\n[other]\ncount = 9223372036854775807\nmessage = """\nA multiline note\n"""\n`;
const server = raw => parseCodexConfig(raw).mcp_servers['starlight-agent-canvas'];

test('new registration uses valid escaped TOML and starts disabled', () => {
  const data = server(codexBlock(options));
  assert.equal(data.enabled, false);
  assert.equal(data.command, options.command);
  assert.deepEqual(data.args, [options.cliPath]);
  assert.equal(data.env.AGENT_CANVAS_HOME, options.home);
});

test('preserves activation, tool restrictions, custom env, data identity and unrelated bytes', () => {
  const plan = planCodexConfig(fixture, options);
  const before = server(fixture), after = server(plan.next);
  assert.equal(after.enabled, false);
  assert.deepEqual(after.disabled_tools, before.disabled_tools);
  assert.deepEqual(after.env, before.env);
  assert.deepEqual(after.tools, before.tools);
  assert.equal(after.startup_timeout_sec, 75n);
  assert.equal(after.required, false);
  assert.ok(plan.next.endsWith(fixture.slice(fixture.indexOf('[other]'))));
  assert.ok(plan.next.includes('enabled = false # Deliberately task scoped'));
  assert.equal(plan.home, '/existing/data');
  assert.equal(planCodexConfig(plan.next, options).next, plan.next);
});

test('preserves explicit and implicit activation and retains timeout alias', () => {
  assert.equal(planCodexConfig(fixture.replace('enabled = false', 'enabled = true'), options).enabled, true);
  const raw = fixture.replace('enabled = false # Deliberately task scoped\n', '').replace('startup_timeout_sec = 75', 'startup_timeout_ms = 75000');
  const plan = planCodexConfig(raw, options);
  const after = server(plan.next);
  assert.equal(after.enabled, undefined);
  assert.equal(plan.enabled, true);
  assert.equal(plan.activation, 'default');
  assert.equal(after.startup_timeout_ms, 75000n);
  assert.equal(after.startup_timeout_sec, undefined);
});

test('preserves CRLF and supplies a missing home without removing custom env', () => {
  const raw = fixture.replace("AGENT_CANVAS_HOME = '/existing/data'\n", '').replaceAll('\n', '\r\n');
  const next = planCodexConfig(raw, options).next;
  assert.equal(server(next).env.AGENT_CANVAS_HOME, options.home);
  assert.equal(server(next).env.CUSTOM, 'private-value-for-preservation');
  assert.ok(!/(?<!\r)\n/.test(next));
});

test('missing server and environment tables retain parser table shape', () => {
  assert.equal(server(planCodexConfig("model = 'example'\n", options).next).enabled, false);
  const noEnv = fixture.replace("[mcp_servers.starlight-agent-canvas.env]\nAGENT_CANVAS_HOME = '/existing/data'\nCUSTOM = 'private-value-for-preservation'\n", '');
  assert.equal(server(planCodexConfig(noEnv, options).next).env.AGENT_CANVAS_HOME, options.home);
});

test('refuses invalid, duplicate, HTTP, custom launcher and unsupported managed layouts without leaking values', () => {
  const bad = [
    fixture + '\n[other]\n',
    fixture.replace("command = 'old-node'", 'command = "private-value-for-preservation'),
    fixture.replace("args = ['old.js']", "args = ['--custom', 'old.js']"),
    fixture.replace("args = ['old.js']", "args = [\n 'old.js',\n]"),
    fixture.replace('[mcp_servers.starlight-agent-canvas] # Existing registration', '[mcp_servers."starlight-agent-canvas"]'),
    fixture.replace("command = 'old-node'", "'command' = 'old-node'"),
    '[mcp_servers]\nstarlight-agent-canvas = { command = "old", args = ["old.js"] }',
    '[mcp_servers.starlight-agent-canvas]\nurl = "https://example.com/mcp"',
    '[mcp_servers.starlight-agent-canvas]\nenabled = "false"',
    '[mcp_servers.starlight-agent-canvas.env]\nCUSTOM = 12',
    '__proto__.x = 1',
    'constructor.x = 1',
    '\uFEFF' + fixture,
    fixture.replace('\n', '\r\n'),
    'x = "' + 'x'.repeat(1024 * 1024) + '"',
  ];
  for (const raw of bad) {
    assert.throws(() => planCodexConfig(raw, options), error => error instanceof ConfigHold && !error.message.includes('private-value-for-preservation'));
  }
});

test('table-like text in multiline strings cannot redirect an edit', () => {
  const raw = fixture.replace('A multiline note', '[mcp_servers.starlight-agent-canvas]\ncommand = "fake"');
  assert.throws(() => planCodexConfig(raw, options), ConfigHold);
});

test('array table managed-key lookalikes cause a hold instead of an unexpected edit', () => {
  const raw = "[mcp_servers.starlight-agent-canvas]\ncommand = 'old'\nargs = ['old.js']\n[[other]]\nargs = ['preserve']\n";
  assert.throws(() => planCodexConfig(raw, options), ConfigHold);
});

async function temporary(run) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'canvas-config-boundary-'));
  try { await run(path.join(root, 'config.toml'), root); }
  finally { await rm(root, { recursive: true, force: true }); }
}

test('publication preserves a byte-exact backup and repeated install is a no-op', async () => temporary(async (file, root) => {
  await writeFile(file, fixture);
  const result = await installConfig(file, options);
  assert.equal(await readFile(result.backupPath, 'utf8'), fixture);
  assert.equal(result.enabled, false);
  assert.equal(server(await readFile(file, 'utf8')).env.AGENT_CANVAS_HOME, '/existing/data');
  if (process.platform !== 'win32') assert.equal((await lstat(result.backupPath)).mode & 0o777, 0o600);
  assert.equal((await installConfig(file, options)).changed, false);
  assert.equal((await readdir(root)).filter(name => name.includes('.bak-')).length, 1);
  assert.ok(!(await readdir(root)).some(name => name.includes('.lock') || name.endsWith('.tmp')));
}));

test('new publication creates a disabled config without a backup', async () => temporary(async file => {
  const result = await installConfig(file, options, { expectedSha: 'missing' });
  assert.equal(result.backupPath, null);
  assert.equal(server(await readFile(file, 'utf8')).enabled, false);
}));

test('reviewed hash mismatch preserves bytes and creates no backup', async () => temporary(async (file, root) => {
  await writeFile(file, fixture);
  await assert.rejects(installConfig(file, options, { expectedSha: 'changed' }), ConfigHold);
  assert.equal(await readFile(file, 'utf8'), fixture);
  assert.deepEqual(await readdir(root), ['config.toml']);
  const sha = createHash('sha256').update(fixture).digest('hex');
  assert.equal((await installConfig(file, options, { expectedSha: sha })).changed, true);
}));

test('foreign/interrupted installer lock is retained regardless of age or contents', async () => temporary(async (file, root) => {
  await writeFile(file, fixture);
  await writeFile(file + '.canvas-install.lock', 'incomplete old owner');
  await assert.rejects(installConfig(file, options), ConfigHold);
  assert.equal(await readFile(file, 'utf8'), fixture);
  assert.equal(await readFile(file + '.canvas-install.lock', 'utf8'), 'incomplete old owner');
  assert.equal((await readdir(root)).length, 2);
}));

test('concurrent edit holds, keeps the other writer and exact backup, and removes owned temp/lock', async () => temporary(async (file, root) => {
  await writeFile(file, fixture);
  await assert.rejects(installConfig(file, options, { beforePublish: () => writeFile(file, '# another writer\n') }), ConfigHold);
  assert.equal(await readFile(file, 'utf8'), '# another writer\n');
  const files = await readdir(root);
  assert.equal(await readFile(path.join(root, files.find(name => name.includes('.bak-'))), 'utf8'), fixture);
  assert.ok(!files.some(name => name.includes('.lock') || name.endsWith('.tmp')));
}));

test('interrupted publish keeps original config/backup and a retry succeeds', async () => temporary(async (file, root) => {
  await writeFile(file, fixture);
  await assert.rejects(installConfig(file, options, { beforePublish: () => { throw new Error('simulated interruption'); } }));
  assert.equal(await readFile(file, 'utf8'), fixture);
  assert.ok(!(await readdir(root)).some(name => name.includes('.lock') || name.endsWith('.tmp')));
  assert.equal((await installConfig(file, options)).changed, true);
}));

test('failed lock cleanup reports successful publication and preserves the lock for inspection', async () => temporary(async file => {
  await writeFile(file, fixture);
  const result = await installConfig(file, options, { removeOwnedFile: async name => {
    if (name.endsWith('.lock')) throw Object.assign(new Error('simulated busy'), { code: 'EBUSY' });
    await unlink(name);
  } });
  assert.equal(result.changed, true);
  assert.equal(server(await readFile(file, 'utf8')).command, options.command);
  assert.equal(result.cleanupWarnings.length, 1);
  assert.ok(result.cleanupWarnings[0].includes('EBUSY'));
  await assert.rejects(installConfig(file, options), ConfigHold);
}));

test('new config hard-link cleanup failure retains successful publication and names the exact recovery file', async () => temporary(async (file, root) => {
  const result = await installConfig(file, options, { removeOwnedFile: async name => {
    if (name.endsWith('.tmp')) throw Object.assign(new Error('simulated busy'), { code: 'EBUSY' });
    await unlink(name);
  } });
  assert.equal(result.changed, true);
  const files = await readdir(root);
  const retained = files.find(name => name.endsWith('.tmp'));
  assert.ok(retained);
  assert.equal(await readFile(path.join(root, retained), 'utf8'), await readFile(file, 'utf8'));
  assert.equal((await lstat(file)).nlink, 2);
  assert.ok(result.cleanupWarnings[0].includes(path.join(root, retained)));
  await assert.rejects(installConfig(file, options), ConfigHold);
  await unlink(path.join(root, retained));
  assert.equal((await installConfig(file, options)).changed, false);
}));

test('hardlinked config is held without changing either name', async () => temporary(async (file, root) => {
  await writeFile(file, fixture);
  const other = path.join(root, 'linked.toml');
  await link(file, other);
  await assert.rejects(installConfig(file, options), ConfigHold);
  assert.equal(await readFile(file, 'utf8'), fixture);
  assert.equal(await readFile(other, 'utf8'), fixture);
}));

test('read-only config is held without bypassing its mode', async () => temporary(async file => {
  await writeFile(file, fixture);
  await chmod(file, 0o444);
  try {
    await assert.rejects(installConfig(file, options), ConfigHold);
    assert.equal(await readFile(file, 'utf8'), fixture);
  } finally { await chmod(file, 0o600); }
}));

test('symlink config cannot change its target', async t => temporary(async (file, root) => {
  const target = path.join(root, 'target.toml');
  await writeFile(target, fixture);
  try { await symlink(target, file); }
  catch (error) { if (process.platform === 'win32' && error.code === 'EPERM') { t.skip('Windows symlink privilege unavailable'); return; } throw error; }
  await assert.rejects(installConfig(file, options), ConfigHold);
  assert.equal(await readFile(target, 'utf8'), fixture);
}));

test('invalid CLI config yields a hold without logging private config values', async () => temporary(async file => {
  await writeFile(file, 'x = "private-value-for-preservation');
  const result = spawnSync(process.execPath, ['scripts/install-codex-mcp.mjs', '--config', file], { encoding: 'utf8', windowsHide: true });
  assert.equal(result.status, 2);
  assert.ok(!`${result.stdout}${result.stderr}`.includes('private-value-for-preservation'));
  assert.equal(await readFile(file, 'utf8'), 'x = "private-value-for-preservation');
}));
