import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FileCanvasStore,
  buildQTownWorld,
  qTownCensus,
  renderQTownSvg,
  validateQTownRegistry,
} from '../packages/core/dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const registryPath = resolve(repoRoot, 'docs/q-town/domain-agents.v1.json');

const homeArg = process.argv.find((arg) => arg.startsWith('--home='));
if (homeArg) {
  process.env.AGENT_CANVAS_HOME = homeArg.slice('--home='.length);
}

const priorityOnly = process.argv.includes('--priority-only');
const skipStore = process.argv.includes('--no-store');

const registry = validateQTownRegistry(JSON.parse(await readFile(registryPath, 'utf8')));
const world = buildQTownWorld(registry, { priorityReposOnly: priorityOnly });
const census = qTownCensus(world);

if (!skipStore) {
  const store = new FileCanvasStore();
  const saved = await store.importCanvas(world);
  console.log(JSON.stringify({
    canvasId: saved.id,
    title: saved.title,
    home: store.home,
    ...census,
    deployment: 'registry-only',
    liveProcessSpawn: false,
  }, null, 2));
}

const docsDir = resolve(repoRoot, 'docs/q-town');
await mkdir(docsDir, { recursive: true });
await writeFile(resolve(docsDir, 'q-town.world.json'), `${JSON.stringify({
  id: world.id,
  title: world.title,
  description: world.description,
  createdAt: world.createdAt,
  census,
  nodes: world.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    title: node.title,
    position: node.position,
    metadata: node.metadata,
  })),
  edges: world.edges,
}, null, 2)}\n`, 'utf8');

const svg = renderQTownSvg(world);
const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Q-Town — private Starlight second-brain graph</title>
  <style>
    :root { color-scheme: dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: #05060A;
      color: #F1F3F9;
      font: 15px/1.45 "IBM Plex Sans", "Segoe UI", sans-serif;
    }
    header {
      padding: 28px 32px 12px;
      max-width: 960px;
    }
    h1 { margin: 0 0 8px; font-size: 28px; letter-spacing: -0.03em; }
    p { margin: 0 0 10px; color: #8A90A8; }
    .stats { display: flex; flex-wrap: wrap; gap: 10px; margin: 16px 0 8px; }
    .stat {
      border: 1px solid #1A1F2E;
      background: #111522;
      border-radius: 999px;
      padding: 6px 12px;
      color: #F1F3F9;
    }
    .graph {
      margin: 8px 16px 40px;
      border: 1px solid #1A1F2E;
      background:
        radial-gradient(circle at 20% 10%, rgba(167,139,250,.08), transparent 28%),
        radial-gradient(circle at 80% 80%, rgba(110,168,254,.08), transparent 24%),
        #0A0C14;
      overflow: auto;
    }
    svg { display: block; min-width: 1100px; width: 100%; height: auto; }
    .legend { color: #8A90A8; padding: 0 32px 40px; }
  </style>
</head>
<body>
  <header>
    <h1>Q-Town</h1>
    <p>Private Starlight world graph of the second brain. Agents are registered, not launched. The private vault stays unmounted.</p>
    <div class="stats">
      <span class="stat">${census.nodes} nodes</span>
      <span class="stat">${census.edges} edges</span>
      <span class="stat">${census.domainStewards} domain stewards</span>
      <span class="stat">${census.repoAgents} repo agents</span>
      <span class="stat">${census.airGapped} air-gapped</span>
    </div>
  </header>
  <div class="graph">${svg}</div>
  <p class="legend">Gold = air-gapped private vault. Violet = plaza. Blue = domain steward. Mint = registered repo agent. No live processes.</p>
</body>
</html>
`;
await writeFile(resolve(docsDir, 'index.html'), html, 'utf8');

if (skipStore) {
  console.log(JSON.stringify({ wrote: ['docs/q-town/index.html', 'docs/q-town/q-town.world.json'], ...census }, null, 2));
}
