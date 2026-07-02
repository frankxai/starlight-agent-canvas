import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport, getDefaultEnvironment } from '@modelcontextprotocol/sdk/client/stdio.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..', '..', '..');
const cliPath = path.join(repoRoot, 'packages', 'mcp', 'dist', 'cli.js');
const home = process.env.AGENT_CANVAS_HOME ?? path.join(repoRoot, '.agent-canvas', 'mcp-smoke');

const expectedTools = [
  'list_canvases',
  'get_canvas',
  'create_canvas',
  'import_canvas',
  'add_node',
  'update_node',
  'ingest_text_source',
  'ingest_url',
  'ingest_youtube',
  'connect_nodes',
  'run_node_action',
  'search_artifacts',
  'export_canvas',
];

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [cliPath],
  cwd: repoRoot,
  env: {
    ...getDefaultEnvironment(),
    AGENT_CANVAS_HOME: home,
  },
  stderr: 'pipe',
});

const client = new Client({ name: 'starlight-agent-canvas-smoke', version: '0.1.0' }, { capabilities: {} });

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const names = listed.tools.map((tool) => tool.name).sort();
  const missing = expectedTools.filter((tool) => !names.includes(tool));
  if (missing.length) {
    throw new Error(`Missing MCP tools: ${missing.join(', ')}`);
  }

  const created = await client.callTool({
    name: 'create_canvas',
    arguments: {
      title: `MCP smoke ${new Date().toISOString()}`,
      template: 'blank',
    },
  });
  const canvasId = created.structuredContent?.canvas?.id;
  if (typeof canvasId !== 'string') {
    throw new Error('create_canvas did not return a canvas id.');
  }

  const ingested = await client.callTool({
    name: 'ingest_text_source',
    arguments: {
      canvasId,
      title: 'Smoke note',
      body: 'The MCP stdio path can create a canvas, add a node, run an action, and export markdown.',
    },
  });
  const nodeId = ingested.structuredContent?.node?.id;
  if (typeof nodeId !== 'string') {
    throw new Error('ingest_text_source did not return a node id.');
  }

  await client.callTool({
    name: 'update_node',
    arguments: {
      canvasId,
      nodeId,
      position: { x: 320, y: 220 },
    },
  });

  await client.callTool({
    name: 'run_node_action',
    arguments: {
      canvasId,
      action: 'answer_question',
      inputNodeIds: [],
      prompt: 'What does the smoke test prove?',
    },
  });

  const exported = await client.callTool({
    name: 'export_canvas',
    arguments: {
      canvasId,
      format: 'markdown',
    },
  });
  const body = exported.structuredContent?.body;
  if (typeof body !== 'string' || !body.includes('MCP smoke')) {
    throw new Error('export_canvas did not return markdown for the smoke canvas.');
  }

  const exportedJson = await client.callTool({
    name: 'export_canvas',
    arguments: {
      canvasId,
      format: 'json',
    },
  });
  const jsonBody = exportedJson.structuredContent?.body;
  if (typeof jsonBody !== 'string') {
    throw new Error('export_canvas did not return JSON for import smoke.');
  }
  const portableCanvas = JSON.parse(jsonBody);
  portableCanvas.id = `canvas-mcp-smoke-import-${new Date().toISOString().replace(/[^A-Za-z0-9_-]/g, '-')}`;
  portableCanvas.title = 'MCP smoke imported';
  const imported = await client.callTool({
    name: 'import_canvas',
    arguments: {
      canvas: portableCanvas,
    },
  });
  const importedCanvasId = imported.structuredContent?.canvas?.id;
  if (typeof importedCanvasId !== 'string') {
    throw new Error('import_canvas did not return an imported canvas id.');
  }

  console.log(JSON.stringify({
    ok: true,
    home,
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    toolCount: names.length,
    canvasId,
    importedCanvasId,
  }, null, 2));
} finally {
  await client.close();
}
