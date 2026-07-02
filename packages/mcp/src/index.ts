#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { canvasIdSchema, canvasRecordSchema } from '@starlight-agent-canvas/core';
import { createToolHandlers } from './tool-handlers.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const READ_ONLY_LOCAL = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const SAFE_LOCAL_WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
};

const SAFE_NETWORK_SOURCE_INTAKE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: true,
};

async function readRepoDoc(relativePath: string): Promise<string> {
  return readFile(path.join(repoRoot, relativePath), 'utf8');
}

function registerGuideResources(server: McpServer) {
  const resources = [
    {
      name: 'mcp-setup',
      uri: 'starlight-agent-canvas://docs/mcp-setup',
      title: 'MCP Setup',
      file: 'docs/mcp-setup.md',
    },
    {
      name: 'codex-integration',
      uri: 'starlight-agent-canvas://docs/codex-integration',
      title: 'Codex Integration',
      file: 'docs/codex-integration.md',
    },
    {
      name: 'demo-walkthrough',
      uri: 'starlight-agent-canvas://docs/demo-walkthrough',
      title: 'Demo Walkthrough',
      file: 'docs/demo-walkthrough.md',
    },
    {
      name: 'technology-stack',
      uri: 'starlight-agent-canvas://docs/technology-stack',
      title: 'Technology Stack',
      file: 'docs/technology-stack.md',
    },
    {
      name: 'production-readiness',
      uri: 'starlight-agent-canvas://docs/production-readiness',
      title: 'Production Readiness',
      file: 'docs/production-readiness.md',
    },
  ];

  for (const resource of resources) {
    server.registerResource(
      resource.name,
      resource.uri,
      {
        title: resource.title,
        description: `Local ${resource.title.toLowerCase()} guide for Starlight Agent Canvas.`,
        mimeType: 'text/markdown',
      },
      async (uri) => ({
        contents: [{
          uri: uri.toString(),
          mimeType: 'text/markdown',
          text: await readRepoDoc(resource.file),
        }],
      }),
    );
  }
}

function registerOperatorPrompts(server: McpServer) {
  server.registerPrompt(
    'starlight_canvas_operator',
    {
      title: 'Starlight Canvas Operator',
      description: 'Use the canvas as the shared research/workflow memory for a coding or research agent.',
    },
    async () => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            'Use the starlight-agent-canvas MCP server as a local, typed operating canvas.',
            'Start by calling list_canvases and get_canvas for canvas-starlight-agent-canvas-os when present.',
            'Use ingest_url, ingest_youtube, or ingest_text_source for sources so artifacts, provenance, and typed nodes stay connected.',
            'Add prompts, MCP tools, agent runs, and outputs as typed nodes. Connect evidence with references, derives_from, compares, runs, or exports edges.',
            'Run local actions for summaries, claims, comparisons, decision matrices, implementation briefs, and source-grounded answers.',
            'Prefer export_canvas with format "context" for agent continuation, JSON for portable rehydration, and Markdown for human-readable handoff.',
            'Do not use this server for secrets, external posting, destructive operations, payments, or remote account mutation.',
          ].join('\n'),
        },
      }],
    }),
  );
}

export function createAgentCanvasMcpServer() {
  const server = new McpServer({
    name: 'starlight-agent-canvas',
    version: '0.1.0',
  });
  const handlers = createToolHandlers();

  registerGuideResources(server);
  registerOperatorPrompts(server);

  server.registerTool(
    'list_canvases',
    {
      title: 'List Canvases',
      description: 'List local Starlight Agent Canvas records.',
      inputSchema: {},
      annotations: READ_ONLY_LOCAL,
    },
    async () => handlers.list_canvases(),
  );

  server.registerTool(
    'get_canvas',
    {
      title: 'Get Canvas',
      description: 'Read one local canvas by id.',
      inputSchema: {
        canvasId: canvasIdSchema,
      },
      annotations: READ_ONLY_LOCAL,
    },
    async (args) => handlers.get_canvas(args),
  );

  server.registerTool(
    'create_canvas',
    {
      title: 'Create Canvas',
      description: 'Create a local canvas from a v0.1 template.',
      inputSchema: {
        title: z.string().min(1),
        description: z.string().optional(),
        template: z.enum(['blank', 'competitor_teardown', 'repo_product_planning', 'agent_workflow_design', 'content_synthesis']).optional(),
      },
      annotations: SAFE_LOCAL_WRITE,
    },
    async (args) => handlers.create_canvas({ ...args, template: args.template ?? 'blank' }),
  );

  server.registerTool(
    'import_canvas',
    {
      title: 'Import Canvas',
      description: 'Import a portable canvas JSON export. If the id already exists, it is imported as a non-destructive copy.',
      inputSchema: {
        canvas: canvasRecordSchema,
      },
      annotations: SAFE_LOCAL_WRITE,
    },
    async (args) => handlers.import_canvas(args),
  );

  server.registerTool(
    'add_node',
    {
      title: 'Add Node',
      description: 'Add a typed node to a local canvas.',
      inputSchema: {
        canvasId: canvasIdSchema,
        kind: z.enum(['note', 'source_url', 'source_pdf', 'source_youtube', 'prompt', 'mcp_tool', 'agent_run', 'output']),
        title: z.string().min(1),
        body: z.string().optional(),
        position: z.object({ x: z.number(), y: z.number() }).optional(),
        metadata: z.record(z.unknown()).optional(),
      },
      annotations: SAFE_LOCAL_WRITE,
    },
    async (args) => handlers.add_node({ ...args, body: args.body ?? '', metadata: args.metadata ?? {} }),
  );

  server.registerTool(
    'update_node',
    {
      title: 'Update Node',
      description: 'Update a local canvas node title, body, metadata, or position.',
      inputSchema: {
        canvasId: canvasIdSchema,
        nodeId: z.string().min(1),
        title: z.string().min(1).optional(),
        body: z.string().optional(),
        position: z.object({ x: z.number(), y: z.number() }).optional(),
        metadata: z.record(z.unknown()).optional(),
      },
      annotations: SAFE_LOCAL_WRITE,
    },
    async (args) => handlers.update_node(args),
  );

  server.registerTool(
    'ingest_text_source',
    {
      title: 'Ingest Text Source',
      description: 'Create a durable local source artifact and node from pasted text, transcript text, Markdown, JSON, or notes.',
      inputSchema: {
        canvasId: canvasIdSchema,
        title: z.string().min(1),
        body: z.string().min(1),
        source: z.string().optional(),
        artifactKind: z.enum(['markdown', 'json', 'manual']).optional(),
        filename: z.string().optional(),
        mimeType: z.string().optional(),
        position: z.object({ x: z.number(), y: z.number() }).optional(),
        metadata: z.record(z.unknown()).optional(),
      },
      annotations: SAFE_LOCAL_WRITE,
    },
    async (args) => handlers.ingest_text_source({ ...args, metadata: args.metadata ?? {} }),
  );

  server.registerTool(
    'ingest_url',
    {
      title: 'Ingest URL',
      description: 'Fetch a public URL into a durable local source artifact and typed canvas node.',
      inputSchema: {
        canvasId: canvasIdSchema,
        url: z.string().url(),
        title: z.string().min(1).optional(),
        useFirecrawl: z.boolean().optional(),
        position: z.object({ x: z.number(), y: z.number() }).optional(),
      },
      annotations: SAFE_NETWORK_SOURCE_INTAKE,
    },
    async (args) => handlers.ingest_url(args),
  );

  server.registerTool(
    'ingest_youtube',
    {
      title: 'Ingest YouTube',
      description: 'Ingest a YouTube URL as video metadata plus captions when available or a supplied manual transcript.',
      inputSchema: {
        canvasId: canvasIdSchema,
        url: z.string().url(),
        title: z.string().min(1).optional(),
        manualTranscript: z.string().optional(),
        position: z.object({ x: z.number(), y: z.number() }).optional(),
      },
      annotations: SAFE_NETWORK_SOURCE_INTAKE,
    },
    async (args) => handlers.ingest_youtube(args),
  );

  server.registerTool(
    'ingest_pdf',
    {
      title: 'Ingest PDF',
      description: 'Ingest a PDF file supplied as base64 into a durable local source artifact and typed canvas node.',
      inputSchema: {
        canvasId: canvasIdSchema,
        filename: z.string().min(1),
        dataBase64: z.string().min(1),
        position: z.object({ x: z.number(), y: z.number() }).optional(),
      },
      annotations: SAFE_LOCAL_WRITE,
    },
    async (args) => handlers.ingest_pdf(args),
  );

  server.registerTool(
    'connect_nodes',
    {
      title: 'Connect Nodes',
      description: 'Connect two existing nodes with a typed edge.',
      inputSchema: {
        canvasId: canvasIdSchema,
        source: z.string().min(1),
        target: z.string().min(1),
        kind: z.enum(['references', 'derives_from', 'compares', 'runs', 'exports']).optional(),
      },
      annotations: SAFE_LOCAL_WRITE,
    },
    async (args) => handlers.connect_nodes({ ...args, kind: args.kind ?? 'references' }),
  );

  server.registerTool(
    'run_node_action',
    {
      title: 'Run Node Action',
      description: 'Run a safe local canvas action and create an output node.',
      inputSchema: {
        canvasId: canvasIdSchema,
        action: z.enum(['summarize', 'extract_claims', 'compare_sources', 'decision_matrix', 'implementation_brief', 'answer_question']),
        inputNodeIds: z.array(z.string()).optional(),
        prompt: z.string().optional(),
      },
      annotations: SAFE_LOCAL_WRITE,
    },
    async (args) => handlers.run_node_action({ ...args, inputNodeIds: args.inputNodeIds ?? [], prompt: args.prompt ?? '' }),
  );

  server.registerTool(
    'search_artifacts',
    {
      title: 'Search Artifacts',
      description: 'Search local canvas node text and metadata.',
      inputSchema: {
        query: z.string().min(1),
      },
      annotations: READ_ONLY_LOCAL,
    },
    async (args) => handlers.search_artifacts(args),
  );

  server.registerTool(
    'export_canvas',
    {
      title: 'Export Canvas',
      description: 'Export a canvas as portable JSON, readable Markdown, or an agent context packet.',
      inputSchema: {
        canvasId: canvasIdSchema,
        format: z.enum(['json', 'markdown', 'context']).optional(),
      },
      annotations: READ_ONLY_LOCAL,
    },
    async (args) => handlers.export_canvas(args),
  );

  return server;
}
