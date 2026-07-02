import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';

function parseFormat(request: Request): 'json' | 'markdown' | 'context' {
  const raw = new URL(request.url).searchParams.get('format');
  if (raw === 'markdown' || raw === 'context') return raw;
  return 'json';
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const format = parseFormat(request);
  const body = await getStore().exportCanvas(id, format);
  const filename = format === 'json'
    ? `${id}.json`
    : format === 'context'
      ? `${id}.context.md`
      : `${id}.md`;
  return new NextResponse(body, {
    headers: {
      'content-type': format === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
