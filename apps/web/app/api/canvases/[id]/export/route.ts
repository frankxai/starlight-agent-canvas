import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';

function parseFormat(request: Request): 'json' | 'markdown' | 'context' | 'codex' {
  const raw = new URL(request.url).searchParams.get('format');
  if (raw === 'markdown' || raw === 'context' || raw === 'codex') return raw;
  return 'json';
}

function parseNodeIds(request: Request): string[] {
  const params = new URL(request.url).searchParams;
  return [
    ...params.getAll('nodeId'),
    ...(params.get('nodeIds') ?? '').split(','),
  ].map((id) => id.trim()).filter(Boolean);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const format = parseFormat(request);
  const nodeIds = parseNodeIds(request);
  const body = await getStore().exportCanvas(id, format, { nodeIds });
  const scope = nodeIds.length ? '.selected' : '';
  const filename = format === 'json'
    ? `${id}${scope}.json`
    : format === 'context'
      ? `${id}${scope}.context.md`
      : format === 'codex'
        ? `${id}${scope}.codex.md`
        : `${id}${scope}.md`;
  return new NextResponse(body, {
    headers: {
      'content-type': format === 'json' ? 'application/json; charset=utf-8' : 'text/markdown; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
    },
  });
}
