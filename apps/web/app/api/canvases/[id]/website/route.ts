import { NextResponse } from 'next/server';
import { websiteSaveInputSchema } from '@starlight-agent-canvas/core';
import { getStore } from '@/lib/store';
import { websiteErrorResponse, websiteOriginDenied, websiteRequestBody } from '@/lib/website-response';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try { const { id } = await context.params; return NextResponse.json({ record: await getStore().getWebsitePlan(id) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch (error) { return websiteErrorResponse(error); }
}
export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const denied = websiteOriginDenied(request); if (denied) return denied;
    const { id } = await context.params;
    const input = websiteSaveInputSchema.parse(await websiteRequestBody(request));
    return NextResponse.json(await getStore().saveWebsitePlan(id, input.plan, input.expectedHash), { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return websiteErrorResponse(error); }
}
