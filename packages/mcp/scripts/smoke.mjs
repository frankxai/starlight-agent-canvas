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
  'ingest_video',
  'ingest_pdf',
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
      artifactKind: 'markdown',
      filename: 'smoke-note.md',
      mimeType: 'text/markdown',
      position: { x: 180, y: 160 },
    },
  });
  const nodeId = ingested.structuredContent?.node?.id;
  if (typeof nodeId !== 'string') {
    throw new Error('ingest_text_source did not return a node id.');
  }
  if (ingested.structuredContent?.artifact?.kind !== 'markdown') {
    throw new Error('ingest_text_source did not preserve markdown artifact kind.');
  }

  const video = await client.callTool({
    name: 'ingest_youtube',
    arguments: {
      canvasId,
      url: 'https://youtu.be/abcdefghijk',
      manualTranscript: 'Manual transcript: the canvas accepts video links, transcripts, Source Note Ask modes, and exports a chunked context packet for Codex.',
      position: { x: 520, y: 160 },
    },
  });
  const videoNodeId = video.structuredContent?.node?.id;
  const videoArtifact = video.structuredContent?.artifact;
  if (typeof videoNodeId !== 'string' || videoArtifact?.kind !== 'youtube') {
    throw new Error('ingest_youtube did not return a YouTube node and artifact.');
  }
  if (!Array.isArray(videoArtifact.chunks) || !videoArtifact.chunks.length) {
    throw new Error('ingest_youtube did not create source chunks.');
  }

  const genericVideo = await client.callTool({
    name: 'ingest_video',
    arguments: {
      canvasId,
      url: 'https://vimeo.com/123456789',
      title: 'Smoke generic video reference',
      manualTranscript: 'Manual transcript: generic video references become source_video nodes with video artifacts.',
      position: { x: 680, y: 360 },
    },
  });
  const genericVideoArtifact = genericVideo.structuredContent?.artifact;
  if (genericVideo.structuredContent?.node?.kind !== 'source_video' || genericVideoArtifact?.kind !== 'video') {
    throw new Error('ingest_video did not return a source_video node and video artifact.');
  }
  if (!Array.isArray(genericVideoArtifact.chunks) || !genericVideoArtifact.chunks.length) {
    throw new Error('ingest_video did not create source chunks.');
  }

  const urlSource = await client.callTool({
    name: 'ingest_url',
    arguments: {
      canvasId,
      url: 'http://127.0.0.1/starlight-agent-canvas-smoke',
      title: 'Smoke URL fallback',
      position: { x: 860, y: 160 },
    },
  });
  const urlNodeId = urlSource.structuredContent?.node?.id;
  if (typeof urlNodeId !== 'string' || urlSource.structuredContent?.artifact?.kind !== 'url') {
    throw new Error('ingest_url did not create a safe URL reference artifact.');
  }

  await client.callTool({
    name: 'ingest_pdf',
    arguments: {
      canvasId,
      filename: 'smoke.pdf',
      dataBase64: Buffer.from('%PDF-1.4\nSmoke PDF source for MCP parity.\n%%EOF').toString('base64'),
      position: { x: 1200, y: 160 },
    },
  });

  await client.callTool({
    name: 'connect_nodes',
    arguments: {
      canvasId,
      source: nodeId,
      target: videoNodeId,
      kind: 'references',
    },
  });
  await client.callTool({
    name: 'connect_nodes',
    arguments: {
      canvasId,
      source: videoNodeId,
      target: urlNodeId,
      kind: 'compares',
    },
  });

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

  const search = await client.callTool({
    name: 'search_artifacts',
    arguments: {
      query: 'Source Note Ask',
    },
  });
  const searchResults = search.structuredContent?.results;
  if (!Array.isArray(searchResults) || !searchResults.some((result) => result.chunkId)) {
    throw new Error('search_artifacts did not return chunk-aware source results.');
  }

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

  const exportedContext = await client.callTool({
    name: 'export_canvas',
    arguments: {
      canvasId,
      format: 'context',
    },
  });
  const contextBody = exportedContext.structuredContent?.body;
  if (typeof contextBody !== 'string' || !contextBody.includes('Agent Context Packet')) {
    throw new Error('export_canvas did not return an agent context packet for the smoke canvas.');
  }
  if (!contextBody.includes('Source Chunk Manifest') || !contextBody.includes(videoArtifact.chunks[0].id)) {
    throw new Error('context export did not include the source chunk manifest and YouTube chunk id.');
  }

  const exportedCodex = await client.callTool({
    name: 'export_canvas',
    arguments: {
      canvasId,
      format: 'codex',
    },
  });
  const codexBody = exportedCodex.structuredContent?.body;
  if (typeof codexBody !== 'string' || !codexBody.includes('Codex Handoff') || !codexBody.includes('Agent Context Packet')) {
    throw new Error('export_canvas did not return a Codex handoff prompt for the smoke canvas.');
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
    videoNodeId,
    urlNodeId,
    importedCanvasId,
  }, null, 2));
} finally {
  await client.close();
}
