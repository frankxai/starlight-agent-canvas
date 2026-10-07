import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, realpath, rename, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { MANIFEST, assertGraphParity, hashFile, inventory, outsideOutput, portablePath, productionGraph, sharedStoreRoot, verifyRuntime } from './runtime-integrity.mjs';

const source = 'a'.repeat(40);
async function fixture(t) {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'canvas-integrity-test-'));
  const root = path.join(temporary, 'runtime');
  await mkdir(path.join(root, 'dist'), { recursive: true });
  await writeFile(path.join(root, 'dist/cli.js'), 'export const version = 1;\n');
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0', type: 'module' }));
  t.after(async () => {
    assert.equal(path.dirname(temporary), os.tmpdir());
    await rm(temporary, { recursive: true, force: true });
  });
  return { root, temporary };
}
async function manifest(root, overrides = {}) {
  const value = {
    schema: 'canvasRuntime.v1', repository: 'https://github.com/frankxai/starlight-agent-canvas',
    sourceCommit: source, sourceTree: 'b'.repeat(40), lockSha256: 'c'.repeat(64),
    platform: process.platform, arch: process.arch,
    productionGraph: await productionGraph(root, root), files: await inventory(root), ...overrides,
  };
  await writeFile(path.join(root, MANIFEST), `${JSON.stringify(value, null, 2)}\n`);
  return hashFile(path.join(root, MANIFEST));
}

test('received regular-file runtime verifies without its source repository', async t => {
  const { root, temporary } = await fixture(t);
  const hash = await manifest(root);
  const moved = path.join(temporary, 'received');
  await rename(root, moved);
  const result = await verifyRuntime(moved, source, hash);
  assert.equal(result.ok, true);
  assert.equal(result.fileCount, 2);
});
for (const change of ['altered', 'missing', 'additional']) test(`rejects ${change} runtime files`, async t => {
  const { root } = await fixture(t);
  const hash = await manifest(root);
  if (change === 'altered') await writeFile(path.join(root, 'dist/cli.js'), 'altered');
  if (change === 'missing') await rm(path.join(root, 'dist/cli.js'));
  if (change === 'additional') await writeFile(path.join(root, 'extra.json'), '{}');
  await assert.rejects(verifyRuntime(root, source, hash), /altered, missing or additional/);
});
test('requires the trusted manifest digest in addition to the source identifier', async t => {
  const { root } = await fixture(t);
  const hash = await manifest(root);
  await writeFile(path.join(root, MANIFEST), `${await readFile(path.join(root, MANIFEST), 'utf8')} `);
  await assert.rejects(verifyRuntime(root, source, hash), /manifest hash/);
  await assert.rejects(verifyRuntime(root, source, ''), /trusted manifest/);
});
for (const field of ['sourceCommit', 'repository', 'platform', 'arch']) test(`rejects a mismatched ${field}`, async t => {
  const { root } = await fixture(t);
  const hash = await manifest(root, { [field]: field === 'sourceCommit' ? 'd'.repeat(40) : 'wrong' });
  await assert.rejects(verifyRuntime(root, source, hash), /identity does not match/);
});
test('links cannot provide undeclared files or another repository at runtime', async t => {
  const { root, temporary } = await fixture(t);
  const hash = await manifest(root);
  const outside = path.join(temporary, 'outside');
  await mkdir(outside);
  await writeFile(path.join(outside, 'secret'), 'fixture only');
  await symlink(outside, path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyRuntime(root, source, hash), /contains a link/);
  const linkedRoot = path.join(temporary, 'root-link');
  await symlink(root, linkedRoot, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(verifyRuntime(linkedRoot, source, hash), /regular directory/);
});
test('an output parent junction cannot hide a directory inside the source checkout', async t => {
  const { root, temporary } = await fixture(t);
  const alias = path.join(temporary, 'source-alias');
  await symlink(root, alias, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(outsideOutput(root, path.join(alias, 'new-runtime')), /outside the source checkout/);
  assert.equal(await outsideOutput(root, path.join(temporary, 'new-runtime')), path.join(await realpath(temporary), 'new-runtime'));
});
test('rejects nonportable and ambiguous paths', () => {
  for (const value of ['../outside', '/absolute', 'C:/data', 'a\\b', 'a//b', 'a/../b', 'a/CON.txt', 'a/file.']) assert.equal(portablePath(value), false, value);
  assert.equal(portablePath('node_modules/@scope/package/dist/index.js'), true);
});
test('cross-volume deployment uses the source store instead of an empty destination store', () => {
  const store = path.resolve(os.tmpdir(), 'source-store', 'v11');
  assert.equal(sharedStoreRoot(store), path.dirname(store));
  assert.throws(() => sharedStoreRoot('relative/v11'), /refuse to guess/);
  assert.throws(() => sharedStoreRoot(path.resolve(os.tmpdir(), 'v10')), /refuse to guess/);
});
test('dependency comparison includes edges and optional availability', () => {
  const a = { root: 'app@1', records: [{ id: 'app@1', edges: [{ name: 'dep', target: 'dep@1' }], optionalMissing: [] }] };
  const b = structuredClone(a);
  b.records[0].edges[0].target = 'dep@2';
  assert.throws(() => assertGraphParity(a, b), /differs/);
  b.records[0].edges = a.records[0].edges;
  b.records[0].optionalMissing.push('native');
  assert.throws(() => assertGraphParity(a, b), /differs/);
});
test('graph reads actual nested Node dependencies and excludes dev dependencies', async t => {
  const { root } = await fixture(t);
  const dependency = path.join(root, 'node_modules/dep');
  const nested = path.join(dependency, 'node_modules/nested');
  await mkdir(nested, { recursive: true });
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'app', version: '1', dependencies: { dep: '*' }, devDependencies: { absentDev: '*' }, optionalDependencies: { missingOptional: '*' } }));
  await writeFile(path.join(dependency, 'package.json'), JSON.stringify({ name: 'dep', version: '2', dependencies: { nested: '*' } }));
  await writeFile(path.join(nested, 'package.json'), JSON.stringify({ name: 'nested', version: '3', dependencies: { dep: '*' } }));
  const graph = await productionGraph(root, root);
  assert.equal(graph.records.length, 3);
  assert.deepEqual(graph.records.find(record => record.id === 'app@1').optionalMissing, ['missingOptional']);
  assert.deepEqual(graph.records.find(record => record.id === 'nested@3').edges, [{ name: 'dep', target: 'dep@2' }]);
});
