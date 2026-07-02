import { mkdir, readFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const home = path.join(root, '.agent-canvas', 'cli-smoke');
const outDir = path.join(home, 'exports');
const contextPath = path.join(outDir, 'demo-context.md');
const codexPath = path.join(outDir, 'demo-codex.md');
const selectedCodexPath = path.join(outDir, 'demo-selected-codex.md');
const env = { ...process.env, AGENT_CANVAS_HOME: home };

async function run(args) {
  const { stdout } = await execFileAsync(process.execPath, ['scripts/canvas.mjs', ...args], {
    cwd: root,
    env,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

await rm(home, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const demo = JSON.parse(await run(['demo', '--json']));
assert(demo.canvas?.id, 'demo import did not return a canvas id');
assert(demo.canvas.nodes.length === 5, 'demo import should contain 5 nodes');
assert(demo.canvas.artifacts.length === 3, 'demo import should contain 3 artifacts');

const list = JSON.parse(await run(['list', '--json']));
assert(list.canvases.length === 1, 'list should show the imported demo canvas');

const search = JSON.parse(await run(['search', 'Codex context handoff', '--json']));
assert(search.results.length >= 1, 'search should find demo canvas evidence');

await run(['export', 'latest', '--format', 'context', '--out', contextPath]);
const context = await readFile(contextPath, 'utf8');
assert(context.includes('Agent Context Packet'), 'context export missing packet heading');
assert(context.includes('Source Chunk Manifest'), 'context export missing chunk manifest');
assert(context.includes('Codex context handoff'), 'context export missing demo handoff text');

await run(['export', 'latest', '--format', 'codex', '--out', codexPath]);
const codex = await readFile(codexPath, 'utf8');
assert(codex.includes('Codex Handoff'), 'codex export missing handoff heading');
assert(codex.includes('get_canvas'), 'codex export missing MCP resume instruction');
assert(codex.includes('Agent Context Packet'), 'codex export missing embedded context packet');

await run(['export', 'latest', '--format', 'codex', '--nodes', 'source-youtube-nodeflow', '--out', selectedCodexPath]);
const selectedCodex = await readFile(selectedCodexPath, 'utf8');
assert(selectedCodex.includes('selected node'), 'selected codex export missing selected scope');
assert(selectedCodex.includes('artifact-youtube-nodeflow:chunk-001'), 'selected codex export missing selected chunk');
assert(!selectedCodex.includes('Poppy AI benchmark notes'), 'selected codex export included unselected source');

console.log(JSON.stringify({
  ok: true,
  home,
  canvasId: demo.canvas.id,
  contextPath,
  codexPath,
  selectedCodexPath,
  searchResults: search.results.length,
}, null, 2));
