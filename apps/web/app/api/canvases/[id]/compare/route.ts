import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { checkpointErrorResponse } from '@/lib/checkpoint-response';
import { checkpointReviewView } from '@starlight-agent-canvas/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const params = new URL(request.url).searchParams;
    const before = params.get('before');
    if (!before) return NextResponse.json({ error: 'Choose a checkpoint to compare from.' }, { status: 400 });
    const result = await getStore().compareCheckpoints(id, before, params.get('after') || undefined);
    return NextResponse.json(checkpointReviewView(result), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return checkpointErrorResponse(error);
  }
}
