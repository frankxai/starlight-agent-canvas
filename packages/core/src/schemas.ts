import { z } from 'zod';

export const CANVAS_SCHEMA_VERSION = 'starlight.agentCanvas.v1' as const;

export const canvasIdSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/, 'Canvas ids may only contain letters, numbers, dashes, and underscores.');

export const nodeKindSchema = z.enum([
  'note',
  'source_url',
  'source_pdf',
  'source_youtube',
  'prompt',
  'mcp_tool',
  'agent_run',
  'output',
]);

export const edgeKindSchema = z.enum([
  'references',
  'derives_from',
  'compares',
  'runs',
  'exports',
]);

export const actionTypeSchema = z.enum([
  'summarize',
  'extract_claims',
  'compare_sources',
  'decision_matrix',
  'implementation_brief',
  'answer_question',
]);

export const positionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const canvasNodeSchema = z.object({
  id: z.string().min(1),
  kind: nodeKindSchema,
  title: z.string().min(1),
  body: z.string().default(''),
  position: positionSchema,
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const canvasEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  kind: edgeKindSchema,
  createdAt: z.string().datetime(),
});

export const canvasArtifactSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['url', 'pdf', 'youtube', 'markdown', 'json', 'manual']),
  title: z.string().min(1),
  body: z.string().default(''),
  source: z.string().optional(),
  createdAt: z.string().datetime(),
  metadata: z.record(z.unknown()).default({}),
});

export const actionRunSchema = z.object({
  id: z.string().min(1),
  action: actionTypeSchema,
  inputNodeIds: z.array(z.string()).default([]),
  outputNodeId: z.string().optional(),
  summary: z.string().default(''),
  status: z.enum(['completed', 'failed']).default('completed'),
  createdAt: z.string().datetime(),
  metadata: z.record(z.unknown()).default({}),
});

export const canvasRecordSchema = z.object({
  schemaVersion: z.literal(CANVAS_SCHEMA_VERSION),
  id: canvasIdSchema,
  title: z.string().min(1),
  description: z.string().default(''),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  nodes: z.array(canvasNodeSchema).default([]),
  edges: z.array(canvasEdgeSchema).default([]),
  runs: z.array(actionRunSchema).default([]),
  artifacts: z.array(canvasArtifactSchema).default([]),
});

export const createCanvasInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  template: z.enum([
    'blank',
    'competitor_teardown',
    'repo_product_planning',
    'agent_workflow_design',
    'content_synthesis',
  ]).default('blank'),
});

export const addNodeInputSchema = z.object({
  kind: nodeKindSchema.default('note'),
  title: z.string().min(1),
  body: z.string().default(''),
  position: positionSchema.optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const ingestSourceInputSchema = z.object({
  kind: z.enum(['note', 'source_url', 'source_pdf', 'source_youtube']).default('note'),
  title: z.string().min(1),
  body: z.string().default(''),
  source: z.string().optional(),
  position: positionSchema.optional(),
  metadata: z.record(z.unknown()).default({}),
  artifactKind: z.enum(['url', 'pdf', 'youtube', 'markdown', 'json', 'manual']).optional(),
});

export const updateNodeInputSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  position: positionSchema.optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const connectNodesInputSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  kind: edgeKindSchema.default('references'),
});

export const runActionInputSchema = z.object({
  action: actionTypeSchema,
  inputNodeIds: z.array(z.string()).default([]),
  prompt: z.string().default(''),
});

export type CanvasNodeKind = z.infer<typeof nodeKindSchema>;
export type CanvasEdgeKind = z.infer<typeof edgeKindSchema>;
export type CanvasActionType = z.infer<typeof actionTypeSchema>;
export type CanvasId = z.infer<typeof canvasIdSchema>;
export type CanvasNode = z.infer<typeof canvasNodeSchema>;
export type CanvasEdge = z.infer<typeof canvasEdgeSchema>;
export type CanvasArtifact = z.infer<typeof canvasArtifactSchema>;
export type ActionRun = z.infer<typeof actionRunSchema>;
export type CanvasRecord = z.infer<typeof canvasRecordSchema>;
export type CreateCanvasInput = z.infer<typeof createCanvasInputSchema>;
export type AddNodeInput = z.infer<typeof addNodeInputSchema>;
export type IngestSourceInput = z.infer<typeof ingestSourceInputSchema>;
export type UpdateNodeInput = z.infer<typeof updateNodeInputSchema>;
export type ConnectNodesInput = z.infer<typeof connectNodesInputSchema>;
export type RunActionInput = z.input<typeof runActionInputSchema>;
