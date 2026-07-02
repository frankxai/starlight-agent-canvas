import { NextResponse } from 'next/server';
import { ingestUrl, ingestYoutube, type CanvasNodeKind, type IngestedSource } from '@starlight-agent-canvas/core';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';

function fallbackSource(kind: Extract<CanvasNodeKind, 'source_url' | 'source_youtube' | 'source_video'>, url: string, error: unknown): IngestedSource {
  const parsed = new URL(url);
  return {
    title: kind === 'source_youtube'
      ? `YouTube ${parsed.hostname}`
      : kind === 'source_video'
        ? `Video ${parsed.hostname}`
        : parsed.hostname,
    body: kind === 'source_video'
      ? `Video transcript was not fetched from ${url}. The link is mapped as a video reference. Add a transcript, notes, timestamps, or claims to analyze it.`
      : `Readable text was not fetched from ${url}. The link is still mapped as a source reference. Add notes, paste transcript text, or rerun ingestion later.\n\nFetch note: ${(error as Error).message}`,
    source: url,
    metadata: {
      url,
      ingest: kind === 'source_youtube' ? 'youtube_reference_fallback' : kind === 'source_video' ? 'video_reference' : 'url_reference_fallback',
      error: (error as Error).message,
    },
  };
}

function videoReferenceSource(url: string, manualNotes = ''): IngestedSource {
  const parsed = new URL(url);
  const notes = manualNotes.trim();
  return {
    title: `Video ${parsed.hostname.replace(/^www\./, '')}`,
    body: notes || `Video transcript was not fetched from ${url}. The link is mapped as a video reference. Add a transcript, notes, timestamps, or claims to analyze it.`,
    source: url,
    metadata: {
      url,
      ingest: notes ? 'manual_video_notes' : 'video_reference',
      media: 'video_reference',
    },
  };
}

function imageReferenceSource(url: string, manualNotes = ''): IngestedSource {
  const parsed = new URL(url);
  const notes = manualNotes.trim();
  return {
    title: `Image ${parsed.hostname.replace(/^www\./, '')}`,
    body: notes || `Image reference mapped from ${url}. Add alt text, visual observations, claims, or design notes so agents can reason over the image.`,
    source: url,
    metadata: {
      url,
      imageUrl: url,
      ingest: notes ? 'manual_image_notes' : 'image_reference',
      media: 'image_reference',
    },
  };
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const metadata = body.metadata ?? {};

    if (body.kind === 'source_url' && metadata.url) {
      const url = String(metadata.url);
      const source = await ingestUrl(url, { useFirecrawl: metadata.useFirecrawl === true }).catch((error) => fallbackSource('source_url', url, error));
      const result = await getStore().ingestSource(id, {
        kind: 'source_url',
        title: body.title || source.title,
        body: source.body,
        source: source.source,
        metadata: { ...source.metadata, media: metadata.media },
        position: body.position,
      });
      return NextResponse.json(result);
    }

    if (body.kind === 'source_youtube' && metadata.url) {
      const url = String(metadata.url);
      const source = await ingestYoutube(url, String(body.body || '')).catch((error) => fallbackSource('source_youtube', url, error));
      const result = await getStore().ingestSource(id, {
        kind: 'source_youtube',
        title: body.title || source.title,
        body: source.body,
        source: source.source,
        metadata: { ...source.metadata, media: metadata.media },
        position: body.position,
      });
      return NextResponse.json(result);
    }

    if (body.kind === 'source_video' && metadata.url) {
      const url = String(metadata.url);
      const source = videoReferenceSource(url, String(body.body || ''));
      const result = await getStore().ingestSource(id, {
        kind: 'source_video',
        title: body.title || source.title,
        body: source.body,
        source: source.source,
        artifactKind: 'video',
        metadata: { ...source.metadata, media: metadata.media ?? 'video_reference' },
        position: body.position,
      });
      return NextResponse.json(result);
    }

    if (body.kind === 'source_image' && metadata.url) {
      const url = String(metadata.url);
      const source = imageReferenceSource(url, String(body.body || ''));
      const result = await getStore().ingestSource(id, {
        kind: 'source_image',
        title: body.title || source.title,
        body: source.body,
        source: source.source,
        artifactKind: 'image',
        metadata: { ...source.metadata, media: metadata.media ?? 'image_reference' },
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
