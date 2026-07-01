import { NextResponse } from 'next/server';
import { ingestUrl, ingestYoutube } from '@starlight-agent-canvas/core';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const metadata = body.metadata ?? {};

    if (body.kind === 'source_url' && metadata.url) {
      const source = await ingestUrl(String(metadata.url), { useFirecrawl: metadata.useFirecrawl === true });
      const result = await getStore().addNode(id, {
        kind: 'source_url',
        title: body.title || source.title,
        body: source.body,
        metadata: source.metadata,
        position: body.position,
      });
      return NextResponse.json(result);
    }

    if (body.kind === 'source_youtube' && metadata.url) {
      const source = await ingestYoutube(String(metadata.url), String(body.body || ''));
      const result = await getStore().addNode(id, {
        kind: 'source_youtube',
        title: body.title || source.title,
        body: source.body,
        metadata: source.metadata,
        position: body.position,
      });
      return NextResponse.json(result);
    }

    const result = await getStore().addNode(id, body);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
