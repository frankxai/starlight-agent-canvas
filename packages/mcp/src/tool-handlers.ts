import {
  addNodeInputSchema,
  connectNodesInputSchema,
  createCanvasInputSchema,
  FileCanvasStore,
  runActionInputSchema,
  type AddNodeInput,
  type ConnectNodesInput,
  type CreateCanvasInput,
  type RunActionInput,
} from '@starlight-agent-canvas/core';

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function ok(text: string, structuredContent: Record<string, unknown>): ToolResult {
  return { content: [{ type: 'text', text }], structuredContent };
}

function jsonText(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export function createToolHandlers(store = new FileCanvasStore()) {
  return {
    async list_canvases(): Promise<ToolResult> {
      const canvases = await store.listCanvases();
      return ok(jsonText(canvases), { canvases });
    },

    async get_canvas(args: { canvasId: string }): Promise<ToolResult> {
      const canvas = await store.getCanvas(args.canvasId);
      return ok(jsonText(canvas), { canvas });
    },

    async create_canvas(args: CreateCanvasInput): Promise<ToolResult> {
      const canvas = await store.createCanvas(createCanvasInputSchema.parse(args));
      return ok(`Created canvas ${canvas.title} (${canvas.id})`, { canvas });
    },

    async add_node(args: { canvasId: string } & AddNodeInput): Promise<ToolResult> {
      const { canvasId, ...input } = args;
      const result = await store.addNode(canvasId, addNodeInputSchema.parse(input));
      return ok(`Added node ${result.node.title} (${result.node.id})`, result);
    },

    async connect_nodes(args: { canvasId: string } & ConnectNodesInput): Promise<ToolResult> {
      const { canvasId, ...input } = args;
      const result = await store.connectNodes(canvasId, connectNodesInputSchema.parse(input));
      return ok(`Connected ${result.edge.source} -> ${result.edge.target}`, result);
    },

    async run_node_action(args: { canvasId: string } & RunActionInput): Promise<ToolResult> {
      const { canvasId, ...input } = args;
      const result = await store.runAction(canvasId, runActionInputSchema.parse(input));
      return ok(result.run.summary, result);
    },

    async search_artifacts(args: { query: string }): Promise<ToolResult> {
      const results = await store.searchArtifacts(args.query);
      return ok(jsonText(results), { results });
    },

    async export_canvas(args: { canvasId: string; format?: 'json' | 'markdown' }): Promise<ToolResult> {
      const format = args.format ?? 'json';
      const body = await store.exportCanvas(args.canvasId, format);
      return ok(body, { canvasId: args.canvasId, format, body });
    },
  };
}

export type AgentCanvasToolHandlers = ReturnType<typeof createToolHandlers>;
