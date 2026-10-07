import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';
import { checkpointErrorResponse } from '@/lib/checkpoint-response';
import { checkpointReviewView } from '@starlight-agent-canvas/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string; checkpointId: string }> }) {
  try {
    const { id, checkpointId } = await context.params;
    return NextResponse.json({ checkpoint: checkpointReviewView(await getStore().getCheckpoint(id, checkpointId)) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return checkpointErrorResponse(error);
  }
}
