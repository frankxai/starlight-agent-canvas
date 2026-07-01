#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { canvasIdSchema } from '@starlight-agent-canvas/core';
import { createToolHandlers } from './tool-handlers.js';

export function createAgentCanvasMcpServer() {
  const server = new McpServer({
    name: 'starlight-agent-canvas',
    version: '0.1.0',
  });
  const handlers = createToolHandlers();

  server.registerTool(
    'list_canvases',
    {
      title: 'List Canvases',
      description: 'List local Starlight Agent Canvas records.',
      inputSchema: {},
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
    },
    async (args) => handlers.create_canvas({ ...args, template: args.template ?? 'blank' }),
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
        metadata: z.record(z.unknown()).optional(),
      },
    },
    async (args) => handlers.add_node({ ...args, body: args.body ?? '', metadata: args.metadata ?? {} }),
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
        action: z.enum(['summarize', 'extract_claims', 'compare_sources', 'decision_matrix', 'implementation_brief']),
        inputNodeIds: z.array(z.string()).optional(),
      },
    },
    async (args) => handlers.run_node_action({ ...args, inputNodeIds: args.inputNodeIds ?? [] }),
  );

  server.registerTool(
    'search_artifacts',
    {
      title: 'Search Artifacts',
      description: 'Search local canvas node text and metadata.',
      inputSchema: {
        query: z.string().min(1),
      },
    },
    async (args) => handlers.search_artifacts(args),
  );

  server.registerTool(
    'export_canvas',
    {
      title: 'Export Canvas',
      description: 'Export a canvas as JSON or Markdown.',
      inputSchema: {
        canvasId: canvasIdSchema,
        format: z.enum(['json', 'markdown']).optional(),
      },
    },
    async (args) => handlers.export_canvas(args),
  );

  return server;
}
