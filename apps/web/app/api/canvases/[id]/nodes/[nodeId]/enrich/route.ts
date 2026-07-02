import { NextResponse } from 'next/server';
import { enrichSourceInputSchema } from '@starlight-agent-canvas/core';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string; nodeId: string }> }) {
  try {
    const { id, nodeId } = await context.params;
    const body = await request.json();
    const result = await getStore().enrichSourceNode(id, nodeId, enrichSourceInputSchema.parse(body));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
