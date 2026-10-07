import { spawnSync } from 'node:child_process';
import { appendFile, copyFile, cp, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANIFEST, assertGraphParity, hashFile, inventory, outsideOutput, productionGraph, verifyRuntime } from './runtime-integrity.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageRoot = path.join(root, 'packages/mcp');
const argv = process.argv.slice(2);
if (argv[0] === '--') argv.shift();
if (argv.length !== 1 || !path.isAbsolute(argv[0])) throw new Error('Usage: pnpm mcp:package <new absolute output directory>');
const output = await outsideOutput(root, path.resolve(argv[0]));
try { await lstat(output); throw new Error('Output already exists; keep it intact and choose a new directory.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

function run(command, args, { cwd = root, env = process.env, timeout = 180000 } = {}) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
  if (result.status !== 0 || result.error) throw new Error(`Package command failed: ${path.basename(command)} ${args[0] ?? ''}\n${result.stderr ?? ''}\n${result.stdout ?? ''}`);
  return result.stdout.trim();
}
const pnpmCli = process.env.npm_execpath;
if (!pnpmCli || !/\.(c?js|mjs)$/.test(pnpmCli)) throw new Error('Run through the pinned pnpm package script.');
const pnpm = args => run(process.execPath, [pnpmCli, ...args]);
if (pnpm(['--version']) !== '11.7.0') throw new Error('This runtime rail requires the source-pinned pnpm 11.7.0.');
if (run('git', ['status', '--porcelain', '--untracked-files=normal'])) throw new Error('Package from a clean, committed source checkout.');
const sourceCommit = run('git', ['rev-parse', 'HEAD']);
const sourceTree = run('git', ['rev-parse', 'HEAD^{tree}']);
const lockSha256 = await hashFile(path.join(root, 'pnpm-lock.yaml'));
// Rebuild from the committed source here; never label pre-existing dist as HEAD.
pnpm(['mcp:build']);
const guides = (await import('../packages/mcp/dist/guides.js')).guideResources;
async function assertCurrentBuild(name) {
  const directory = path.join(root, 'packages', name);
  const allowed = new Set();
  async function sources(dir, prefix = '') {
    for (const entry of await readdir(dir)) {
      const file = path.join(dir, entry);
      if ((await lstat(file)).isDirectory()) await sources(file, `${prefix}${entry}/`);
      else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        const stem = `${prefix}${entry.slice(0, -3)}`;
        for (const suffix of ['.js', '.js.map', '.d.ts', '.d.ts.map']) allowed.add(stem + suffix);
      }
    }
  }
  await sources(path.join(directory, 'src'));
  if (name === 'mcp') {
    for (const guide of guides) {
      const outputFile = `guides/${path.basename(guide.file)}`;
      allowed.add(outputFile);
      if (await hashFile(path.join(directory, 'dist', outputFile)) !== await hashFile(path.join(root, guide.file))) throw new Error('Built guide differs from its source document.');
    }
  }
  const files = await inventory(path.join(directory, 'dist'));
  if (files.some(file => !allowed.has(file.path))) throw new Error('Build contains stale or unexpected files; inspect them before retrying.');
}
await assertCurrentBuild('core');
await assertCurrentBuild('mcp');
const sourceGraph = await productionGraph(packageRoot, root);
const temporaryParent = await realpath(os.tmpdir());
const temporary = await mkdtemp(path.join(temporaryParent, 'canvas-production-'));
const deployed = path.join(temporary, 'deploy');
const transferred = path.join(temporary, 'received');
const home = path.join(temporary, 'private-smoke-data');

// Only copy the production package and dependency files. Bin shims, manager state
// and virtual-store lock metadata are unnecessary for the explicit Node CLI.
const excluded = new Set(['.bin', '.pnpm', '.modules.yaml', '.pnpm-workspace-state-v1.json']);
let copiedFiles = 0;
let copiedBytes = 0;
let copiedEntries = 0;
async function copyRegular(source, destination, depth = 0) {
  if (depth > 48) throw new Error('Deployment directory depth exceeds limit.');
  const directory = await lstat(source);
  if (!directory.isDirectory() || directory.isSymbolicLink()) throw new Error('Deployment directory must not be a link.');
  await mkdir(destination, { recursive: true });
  for (const name of await readdir(source)) {
    if (excluded.has(name)) continue;
    if (++copiedEntries > 100000) throw new Error('Deployment entry limit exceeded before copying.');
    const from = path.join(source, name);
    const to = path.join(destination, name);
    const stat = await lstat(from);
    if (stat.isSymbolicLink()) throw new Error('Hoisted deployment contains a link; refuse a checkout-dependent runtime.');
    if (stat.isDirectory()) await copyRegular(from, to, depth + 1);
    else if (stat.isFile()) {
      copiedFiles++;
      copiedBytes += stat.size;
      if (copiedFiles > 50000 || copiedBytes > 1024 * 1024 * 1024) throw new Error('Deployment file/byte limit exceeded before copying.');
      await copyFile(from, to);
    }
    else throw new Error('Deployment contains a non-regular entry.');
  }
}

try {
  // The supported shared-lock path rewrites workspace links into frozen file
  // dependencies. Injection applies to this deploy invocation, not global config.
  pnpm(['--config.node-linker=hoisted', '--config.package-import-method=copy', '--config.inject-workspace-packages=true', '--filter', '@starlight-agent-canvas/mcp', 'deploy', '--prod', '--offline', '--ignore-scripts', deployed]);
  const deployedGraph = await productionGraph(deployed, deployed);
  assertGraphParity(sourceGraph, deployedGraph);
  await mkdir(output); // Exclusive claim; an existing directory is never overwritten.
  const allowed = new Set(['dist', 'node_modules', 'package.json', 'LICENSE', 'README.md', 'pnpm-lock.yaml', 'pnpm-workspace.yaml']);
  for (const name of await readdir(deployed)) {
    if (!allowed.has(name)) throw new Error('Unexpected root file in production deployment.');
    // Dedicated deploy metadata contains temporary absolute workspace paths.
    if (name === 'pnpm-lock.yaml' || name === 'pnpm-workspace.yaml' || name === 'package.json') continue;
    const from = path.join(deployed, name);
    const to = path.join(output, name);
    if ((await lstat(from)).isDirectory()) await copyRegular(from, to);
    else if ((await lstat(from)).isFile()) await copyFile(from, to);
    else throw new Error('Production root contains a link or special entry.');
  }
  const sourcePackage = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'));
  const runtimePackage = Object.fromEntries(['name', 'version', 'type', 'main', 'types', 'bin', 'exports', 'license', 'engines'].filter(key => sourcePackage[key] !== undefined).map(key => [key, sourcePackage[key]]));
  runtimePackage.dependencies = Object.fromEntries(sourceGraph.records.find(record => record.id === sourceGraph.root).edges.map(edge => [edge.name, edge.target.slice(edge.target.lastIndexOf('@') + 1)]));
  await writeFile(path.join(output, 'package.json'), `${JSON.stringify(runtimePackage, null, 2)}\n`, { flag: 'wx' });
  await copyFile(path.join(packageRoot, 'scripts/smoke.mjs'), path.join(output, 'smoke.mjs'));
  // Check the copied compiled workspace bytes against this source build.
  for (const [source, destination] of [
    [path.join(packageRoot, 'dist'), path.join(output, 'dist')],
    [path.join(root, 'packages/core/dist'), path.join(output, 'node_modules/@starlight-agent-canvas/core/dist')],
  ]) {
    if (JSON.stringify(await inventory(source)) !== JSON.stringify(await inventory(destination))) throw new Error('Copied workspace build bytes differ from the source build.');
  }
  const copiedGraph = await productionGraph(output, output);
  assertGraphParity(sourceGraph, copiedGraph);
  const manifest = {
    schema: 'canvasRuntime.v1',
    repository: 'https://github.com/frankxai/starlight-agent-canvas',
    sourceCommit, sourceTree, lockSha256,
    platform: process.platform, arch: process.arch, node: process.version, pnpm: '11.7.0',
    productionGraph: copiedGraph,
    files: await inventory(output),
  };
  await writeFile(path.join(output, MANIFEST), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  const manifestSha256 = await hashFile(path.join(output, MANIFEST));
  // Copy round-trip models delivery through a regular-file artifact. No symlink
  // permission or shared pnpm store is needed on the receiving machine.
  await cp(output, transferred, { recursive: true, errorOnExist: true, force: false });
  const verification = await verifyRuntime(transferred, sourceCommit, manifestSha256);
  const env = { ...process.env, AGENT_CANVAS_HOME: home, CANVAS_SMOKE_CLI: path.join(transferred, 'dist/cli.js'), CANVAS_SMOKE_CWD: temporary };
  // Remove lookup/preload overrides; proof must resolve within the received tree.
  delete env.NODE_PATH;
  delete env.NODE_OPTIONS;
  const smoke = JSON.parse(run(process.execPath, [path.join(transferred, 'smoke.mjs')], { cwd: temporary, env, timeout: 120000 }));
  if (!smoke.ok || smoke.guideCount !== 11 || smoke.toolCount < 27) throw new Error('Received runtime smoke is incomplete.');
  if (run('git', ['rev-parse', 'HEAD']) !== sourceCommit || run('git', ['status', '--porcelain', '--untracked-files=normal']) || await hashFile(path.join(root, 'pnpm-lock.yaml')) !== lockSha256) throw new Error('Source changed during packaging.');
  // A busy cleanup is separate from the verified runtime. Preserve its exact
  // private path and report it without reversing successful verification.
  const cleanupWarnings = [];
  if (await realpath(temporary) !== temporary || path.dirname(temporary) !== temporaryParent) throw new Error('Temporary cleanup identity changed; preserve the directory.');
  try { await rm(temporary, { recursive: true, force: false, maxRetries: 5, retryDelay: 200 }); }
  catch { cleanupWarnings.push(`Private temporary directory retained: ${temporary}`); }
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `sourceCommit=${sourceCommit}\nmanifestSha256=${manifestSha256}\n`);
  }
  console.log(JSON.stringify({ ...verification, guideCount: smoke.guideCount, toolCount: smoke.toolCount, artifactDirectory: output, cleanupWarnings, scope: 'received production MCP directory; native Codex activation is not exercised' }, null, 2));
} catch (error) {
  console.error(`Packaging failed. Preserve the new output if present and private diagnostics at: ${temporary}`);
  throw error;
}
