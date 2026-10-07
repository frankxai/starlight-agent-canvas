import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANIFEST = 'canvas-runtime.json';
const MAX_FILES = 50000;
const MAX_BYTES = 1024 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 12 * 1024 * 1024;
const SHA = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;

export function contained(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`));
}

export function portablePath(value) {
  if (typeof value !== 'string' || value.length > 1000 || value.includes('\\') || /[\x00-\x1f\x7f:<>"|?*]/.test(value)) return false;
  return value.split('/').every(part => part && part !== '.' && part !== '..' && !/[. ]$/.test(part) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}

export async function outsideOutput(sourceRoot, requested) {
  const root = await realpath(sourceRoot);
  const parent = await realpath(path.dirname(requested));
  const output = path.join(parent, path.basename(requested));
  if (contained(root, output)) throw new Error('Production output must be outside the source checkout.');
  return output;
}

export function sharedStoreRoot(activeStore) {
  // pnpm 11 reports the versioned store. A different destination drive changes
  // its default store, so bind deploy to the source's already populated parent.
  if (!path.isAbsolute(activeStore) || path.basename(path.normalize(activeStore)) !== 'v11') throw new Error('Unrecognized pinned pnpm store path; refuse to guess its parent.');
  return path.dirname(path.normalize(activeStore));
}

export async function hashFile(file) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}

// Enumeration does not follow links. Limits apply before reading or hashing files.
export async function inventory(root, { omitManifest = true } = {}) {
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Runtime root must be a regular directory.');
  const entries = [];
  const seen = new Set();
  let total = 0;
  let visited = 0;
  async function visit(dir, prefix = '', depth = 0) {
    if (depth > 48) throw new Error('Runtime directory depth exceeds limit.');
    for (const name of (await readdir(dir)).sort(compare)) {
      const relative = prefix ? `${prefix}/${name}` : name;
      if (omitManifest && relative === MANIFEST) continue;
      if (++visited > MAX_FILES * 2 || !portablePath(relative)) throw new Error('Runtime has too many or non-portable entries.');
      const folded = relative.toLowerCase();
      if (seen.has(folded)) throw new Error('Runtime has case-colliding paths.');
      seen.add(folded);
      const file = path.join(dir, name);
      const stat = await lstat(file);
      if (stat.isSymbolicLink()) throw new Error('Runtime contains a link; hoisted production deployment is required.');
      if (stat.isDirectory()) await visit(file, relative, depth + 1);
      else if (stat.isFile()) {
        total += stat.size;
        if (entries.length >= MAX_FILES || total > MAX_BYTES) throw new Error('Runtime file/byte limit exceeded.');
        entries.push({ path: relative, bytes: stat.size, sha256: await hashFile(file) });
      } else throw new Error('Runtime contains a non-regular filesystem entry.');
    }
  }
  await visit(root);
  return entries.sort((a, b) => compare(a.path, b.path));
}

// Ask Node for its actual module search paths. Compare package versions and
// dependency/peer edges, not merely package names or a different deploy lockfile.
export async function productionGraph(packageRoot, allowedRoot) {
  const boundary = await realpath(allowedRoot);
  const visited = new Map();
  async function visit(root) {
    const physical = await realpath(root);
    if (!contained(boundary, physical)) throw new Error('Production dependency escapes its runtime/source boundary.');
    if (visited.has(physical)) return visited.get(physical).id;
    if (visited.size >= 1000) throw new Error('Production dependency graph exceeds limit.');
    const pkg = JSON.parse(await readFile(path.join(physical, 'package.json'), 'utf8'));
    if (typeof pkg.name !== 'string' || typeof pkg.version !== 'string') throw new Error('Dependency identity is missing.');
    const node = { id: `${pkg.name}@${pkg.version}`, edges: [], optionalMissing: [] };
    visited.set(physical, node);
    const require = createRequire(path.join(physical, 'package.json'));
    const declarations = { ...pkg.dependencies, ...pkg.peerDependencies, ...pkg.optionalDependencies };
    for (const name of Object.keys(declarations).sort(compare)) {
      if (!/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(name)) throw new Error('Invalid dependency name.');
      let resolved;
      for (const modules of require.resolve.paths(name) ?? []) {
        const candidate = path.join(modules, name);
        // Global locations and accidental parent workspaces never participate.
        if (!contained(boundary, path.resolve(candidate))) continue;
        try {
          const candidateStat = await lstat(path.join(candidate, 'package.json'));
          if (candidateStat.isFile()) { resolved = candidate; break; }
        } catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
      }
      if (!resolved) {
        const optional = Object.hasOwn(pkg.optionalDependencies ?? {}, name) || pkg.peerDependenciesMeta?.[name]?.optional;
        if (!optional) throw new Error(`Required production dependency is missing: ${name}`);
        node.optionalMissing.push(name);
      } else node.edges.push({ name, target: await visit(resolved) });
    }
    return node.id;
  }
  const root = await visit(packageRoot);
  // Distinct peer contexts with the same version remain distinct records.
  const records = [...new Set([...visited.values()].map(node => JSON.stringify(node)))].sort(compare).map(text => JSON.parse(text));
  return { root, records };
}

export function assertGraphParity(source, deployed) {
  if (JSON.stringify(source) !== JSON.stringify(deployed)) throw new Error('Deployed production dependency graph differs from the frozen source graph.');
}

export async function verifyRuntime(root, expectedSource, expectedManifestHash, { platform = process.platform, arch = process.arch } = {}) {
  if (!COMMIT.test(expectedSource) || !SHA.test(expectedManifestHash)) throw new Error('An exact source commit and trusted manifest SHA256 are required.');
  // Reject root links before accessing its manifest.
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Runtime root must be a regular directory.');
  const manifestFile = path.join(root, MANIFEST);
  const stat = await lstat(manifestFile);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_MANIFEST_BYTES) throw new Error('Invalid runtime manifest file.');
  if (await hashFile(manifestFile) !== expectedManifestHash) throw new Error('Runtime manifest hash does not match the trusted receipt.');
  const manifest = JSON.parse(await readFile(manifestFile, 'utf8'));
  if (manifest.schema !== 'canvasRuntime.v1' || manifest.repository !== 'https://github.com/frankxai/starlight-agent-canvas' || manifest.sourceCommit !== expectedSource || !COMMIT.test(manifest.sourceTree) || !SHA.test(manifest.lockSha256) || manifest.platform !== platform || manifest.arch !== arch) throw new Error('Runtime source or platform identity does not match.');
  if (!Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > MAX_FILES) throw new Error('Invalid runtime file inventory.');
  const current = await inventory(root);
  if (JSON.stringify(current) !== JSON.stringify(manifest.files)) throw new Error('Runtime contains altered, missing or additional files.');
  if (!current.some(entry => entry.path === 'dist/cli.js') || !current.some(entry => entry.path === 'package.json')) throw new Error('Runtime entry point is missing.');
  const deployedGraph = await productionGraph(root, root);
  assertGraphParity(manifest.productionGraph, deployedGraph);
  return { ok: true, sourceCommit: manifest.sourceCommit, sourceTree: manifest.sourceTree, lockSha256: manifest.lockSha256, platform, arch, fileCount: current.length, bytes: current.reduce((sum, file) => sum + file.bytes, 0), manifestSha256: expectedManifestHash };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 5) throw new Error('Usage: node runtime-integrity.mjs <runtime-directory> <source-commit> <manifest-sha256>');
  console.log(JSON.stringify(await verifyRuntime(path.resolve(process.argv[2]), process.argv[3], process.argv[4]), null, 2));
}
