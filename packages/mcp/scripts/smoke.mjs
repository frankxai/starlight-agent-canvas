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
  'add_node',
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

  await client.callTool({
    name: 'add_node',
    arguments: {
      canvasId,
      kind: 'note',
      title: 'Smoke note',
      body: 'The MCP stdio path can create a canvas, add a node, run an action, and export markdown.',
    },
  });

  await client.callTool({
    name: 'run_node_action',
    arguments: {
      canvasId,
      action: 'implementation_brief',
      inputNodeIds: [],
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

  console.log(JSON.stringify({
    ok: true,
    home,
    node: process.version,
    platform: `${os.platform()} ${os.release()}`,
    toolCount: names.length,
    canvasId,
  }, null, 2));
} finally {
  await client.close();
}
