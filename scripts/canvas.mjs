#!/usr/bin/env node
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { FileCanvasStore } from '../packages/core/dist/index.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);
const args = process.argv.slice(2);
if (args[0] === '--') args.shift();
const formats = new Set(['json', 'markdown', 'context', 'codex']);

function usage() {
  console.log([
    'Starlight Agent Canvas CLI',
    '',
    'Usage:',
    '  pnpm canvas -- list [--json] [--home <path>]',
    '  pnpm canvas -- demo [--json] [--home <path>]',
    '  pnpm canvas -- import <canvas.json> [--json] [--home <path>]',
    '  pnpm canvas -- show <canvasId|latest> [--home <path>]',
    '  pnpm canvas -- export <canvasId|latest> [--format json|markdown|context|codex] [--out <file>] [--home <path>]',
    '  pnpm canvas -- search <query...> [--json] [--home <path>]',
    '',
    'Notes:',
    '  - Runtime data lives in AGENT_CANVAS_HOME unless --home is provided.',
    '  - Imports are non-destructive; same-id imports are saved as copies.',
    '  - export defaults to format=context for agent handoff; use format=codex for a ready-to-paste Codex prompt.',
  ].join('\n'));
}

function takeOption(name) {
  const equalsIndex = args.findIndex((arg) => arg.startsWith(`${name}=`));
  if (equalsIndex >= 0) {
    const [, value = ''] = args.splice(equalsIndex, 1)[0].split(/=(.*)/s);
    return value;
  }
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

function takeFlag(name) {
  const index = args.indexOf(name);
  if (index < 0) return false;
  args.splice(index, 1);
  return true;
}

function fail(message) {
  console.error(`[canvas] ${message}`);
  process.exit(1);
}

function printCanvasSummary(canvas) {
  console.log(`${canvas.id}`);
  console.log(`  title: ${canvas.title}`);
  console.log(`  nodes: ${canvas.nodes.length}`);
  console.log(`  artifacts: ${canvas.artifacts.length}`);
  console.log(`  runs: ${canvas.runs.length}`);
}

async function writeOutput(body, outPath) {
  if (!outPath) {
    process.stdout.write(`${body}${body.endsWith('\n') ? '' : '\n'}`);
    return;
  }
  const target = path.resolve(outPath);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, body, 'utf8');
  console.log(`[canvas] wrote ${target}`);
}

async function resolveCanvasId(store, value) {
  if (value && value !== 'latest') return value;
  const canvases = await store.listCanvases();
  if (!canvases.length) fail('No canvases found.');
  return canvases[0].id;
}

async function main() {
  const home = takeOption('--home');
  const asJson = takeFlag('--json');
  const outPath = takeOption('--out');
  const format = takeOption('--format') ?? 'context';
  const command = args.shift();
  const store = new FileCanvasStore(home ? path.resolve(home) : undefined);

  if (!command || command === 'help' || command === '--help' || command === '-h') {
    usage();
    return;
  }

  if (command === 'list') {
    const canvases = await store.listCanvases();
    if (asJson) {
      console.log(JSON.stringify({ home: store.home, canvases }, null, 2));
      return;
    }
    console.log(`home: ${store.home}`);
    if (!canvases.length) {
      console.log('No canvases yet.');
      return;
    }
    for (const canvas of canvases) {
      console.log(`${canvas.id} | ${canvas.nodeCount} nodes | ${canvas.runCount} runs | ${canvas.title}`);
    }
    return;
  }

  if (command === 'demo') {
    const raw = await readFile(path.join(repoRoot, 'examples', 'demo-canvas.json'), 'utf8');
    const canvas = await store.importCanvas(JSON.parse(raw));
    if (asJson) {
      console.log(JSON.stringify({ home: store.home, canvas }, null, 2));
      return;
    }
    console.log(`[canvas] imported examples/demo-canvas.json into ${store.home}`);
    printCanvasSummary(canvas);
    return;
  }

  if (command === 'import') {
    const filePath = args.shift();
    if (!filePath) fail('Usage: pnpm canvas -- import <canvas.json>');
    const raw = await readFile(path.resolve(filePath), 'utf8');
    const payload = JSON.parse(raw);
    const canvas = await store.importCanvas(
      typeof payload === 'object' && payload !== null && 'canvas' in payload ? payload.canvas : payload,
    );
    if (asJson) {
      console.log(JSON.stringify({ home: store.home, canvas }, null, 2));
      return;
    }
    console.log(`[canvas] imported ${filePath} into ${store.home}`);
    printCanvasSummary(canvas);
    return;
  }

  if (command === 'show') {
    const canvasId = await resolveCanvasId(store, args.shift());
    const canvas = await store.getCanvas(canvasId);
    console.log(JSON.stringify(canvas, null, 2));
    return;
  }

  if (command === 'export') {
    const canvasId = await resolveCanvasId(store, args.shift());
    if (!formats.has(format)) fail(`Unknown export format: ${format}`);
    const body = await store.exportCanvas(canvasId, format);
    await writeOutput(body, outPath);
    return;
  }

  if (command === 'search') {
    const query = args.join(' ').trim();
    if (!query) fail('Usage: pnpm canvas -- search <query...>');
    const results = await store.searchArtifacts(query);
    if (asJson) {
      console.log(JSON.stringify({ home: store.home, query, results }, null, 2));
      return;
    }
    console.log(`home: ${store.home}`);
    console.log(`query: ${query}`);
    if (!results.length) {
      console.log('No results.');
      return;
    }
    for (const result of results) {
      const chunk = result.chunkId ? ` | ${result.chunkId}` : '';
      console.log(`${result.canvasId} | ${result.kind}${chunk} | ${result.title}`);
      console.log(`  ${result.excerpt.replace(/\s+/g, ' ').slice(0, 180)}`);
    }
    return;
  }

  fail(`Unknown command: ${command}`);
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
