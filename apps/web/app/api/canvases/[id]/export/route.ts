import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const format = new URL(request.url).searchParams.get('format') === 'markdown' ? 'markdown' : 'json';
  const body = await getStore().exportCanvas(id, format);
  return new NextResponse(body, {
    headers: {
      'content-type': format === 'markdown' ? 'text/markdown; charset=utf-8' : 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${id}.${format === 'markdown' ? 'md' : 'json'}"`,
    },
  });
}
