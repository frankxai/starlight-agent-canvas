import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';

const MAX_TEXT_CHARS = 120_000;

function titleFromBody(body: string): string {
  const firstLine = body.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (!firstLine) return 'Pasted source';
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const text = String(body.body ?? '').trim();
    if (!text) {
      return NextResponse.json({ error: 'Missing source text.' }, { status: 400 });
    }
    const truncated = text.length > MAX_TEXT_CHARS
      ? `${text.slice(0, MAX_TEXT_CHARS)}\n\n[Truncated at ${MAX_TEXT_CHARS} characters.]`
      : text;
    const result = await getStore().ingestSource(id, {
      kind: 'note',
      title: String(body.title || titleFromBody(truncated)),
      body: truncated,
      source: typeof body.source === 'string' ? body.source : undefined,
      artifactKind: body.artifactKind === 'json' || body.artifactKind === 'markdown' ? body.artifactKind : 'manual',
      metadata: {
        ingest: 'manual_text',
        chars: truncated.length,
        ...(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
      },
      position: body.position,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
