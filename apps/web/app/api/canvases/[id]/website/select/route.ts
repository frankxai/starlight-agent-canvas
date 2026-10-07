import { NextResponse } from 'next/server';
import { websiteChoiceInputSchema } from '@starlight-agent-canvas/core';
import { getStore } from '@/lib/store';
import { websiteErrorResponse, websiteOriginDenied, websiteRequestBody } from '@/lib/website-response';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = websiteOriginDenied(request); if (denied) return denied;
    const { id } = await context.params;
    const input = websiteChoiceInputSchema.parse(await websiteRequestBody(request));
    return NextResponse.json(await getStore().selectWebsiteDirection(id, input.optionId, input.expectedHash), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return websiteErrorResponse(error); }
}
