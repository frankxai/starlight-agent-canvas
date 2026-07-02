import { NextResponse } from 'next/server';
import { actionTypeSchema, mapSourceIntakeToCanvas, type CanvasActionType } from '@starlight-agent-canvas/core';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';

function parseAction(value: unknown): CanvasActionType | undefined {
  const parsed = actionTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parsePosition(value: unknown): { x: number; y: number } | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const { x, y } = value as { x?: unknown; y?: unknown };
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return { x, y };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const raw = String(body.body ?? body.content ?? '').trim();
    if (!raw) {
      return NextResponse.json({ error: 'Missing intake content.' }, { status: 400 });
    }

    const position = parsePosition(body.position);
    const result = await mapSourceIntakeToCanvas(getStore(), id, raw, {
      origin: position ? 'web_drop' : 'web_composer',
      sourceLabel: position ? 'Dropped onto canvas' : 'Composer intake',
      position,
      fetchRemote: body.fetchRemote !== false,
      action: parseAction(body.action),
      prompt: typeof body.prompt === 'string' ? body.prompt : '',
      useFirecrawl: body.useFirecrawl === true,
    });

    return NextResponse.json({
      canvas: result.canvas,
      nodes: result.nodes,
      node: result.node,
      artifacts: result.artifacts,
      artifact: result.artifact,
      run: result.run,
      outputNode: result.outputNode,
      detected: result.detected,
      trace: result.trace,
      sourceReadiness: result.sourceReadiness,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
