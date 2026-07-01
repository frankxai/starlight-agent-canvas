import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';

export async function PATCH(request: Request, context: { params: Promise<{ id: string; nodeId: string }> }) {
  try {
    const { id, nodeId } = await context.params;
    const body = await request.json();
    const result = await getStore().updateNode(id, nodeId, body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
