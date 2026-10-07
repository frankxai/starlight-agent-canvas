import { NextResponse } from 'next/server';
import { websitePacketMarkdown } from '@starlight-agent-canvas/core';
import { getStore } from '@/lib/store';
import { websiteErrorResponse } from '@/lib/website-response';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const packet = await getStore().exportWebsiteImplementation(id);
    const markdown = new URL(request.url).searchParams.get('format') === 'markdown';
    return new NextResponse(markdown ? websitePacketMarkdown(packet) : JSON.stringify(packet, null, 2), { headers: { 'Cache-Control': 'no-store', 'Content-Type': markdown ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8', 'Content-Disposition': `attachment; filename="${packet.canvasId}.website.${markdown ? 'md' : 'json'}"` } });
  } catch (error) { return websiteErrorResponse(error); }
}
