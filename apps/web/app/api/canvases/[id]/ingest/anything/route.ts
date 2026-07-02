import { NextResponse } from 'next/server';
import {
  actionTypeSchema,
  detectIntakeText,
  ingestSourceInputSchema,
  ingestUrl,
  ingestYoutube,
  type CanvasActionType,
  type CanvasArtifact,
  type CanvasNode,
  type CanvasRecord,
  type IngestedSource,
} from '@starlight-agent-canvas/core';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';

const MAX_TEXT_CHARS = 120_000;
const ANYTHING_POSITION_STEP = { x: 280, y: 190 };

function textTitle(value: string): string {
  const first = value.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? 'Pasted source';
  return first.length > 80 ? `${first.slice(0, 77)}...` : first;
}

function limitText(value: string): string {
  return value.length > MAX_TEXT_CHARS ? `${value.slice(0, MAX_TEXT_CHARS)}\n\n[Truncated at ${MAX_TEXT_CHARS} characters.]` : value;
}

function positionForIndex(position: unknown, index: number): { x: number; y: number } | undefined {
  if (!position || typeof position !== 'object') return undefined;
  const { x, y } = position as { x?: unknown; y?: unknown };
  if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) return undefined;
  return {
    x: x + (index % 3) * ANYTHING_POSITION_STEP.x,
    y: y + Math.floor(index / 3) * ANYTHING_POSITION_STEP.y,
  };
}

function parseAction(value: unknown): CanvasActionType | undefined {
  const parsed = actionTypeSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function fallbackSource(kind: 'source_url' | 'source_youtube', url: string, error: unknown): IngestedSource {
  let title = kind === 'source_youtube' ? 'YouTube source' : 'URL source';
  try {
    title = new URL(url).hostname.replace(/^www\./, '') || title;
  } catch {
    title = url.slice(0, 80) || title;
  }
  return {
    title,
    body: kind === 'source_youtube'
      ? `YouTube transcript was not fetched from ${url}. The reference is still mapped so a human or agent can attach transcript text, notes, timestamps, or claims.\n\nFetch note: ${(error as Error).message}`
      : `Readable text was not fetched from ${url}. The link is still mapped as a source reference. Add notes, paste extracted text, or rerun ingestion later.\n\nFetch note: ${(error as Error).message}`,
    source: url,
    metadata: {
      url,
      ingest: kind === 'source_youtube' ? 'youtube_reference_fallback' : 'url_reference_fallback',
      error: (error as Error).message,
    },
  };
}

function videoReferenceSource(url: string, manualNotes = ''): IngestedSource {
  let title = 'Video source';
  try {
    title = `Video ${new URL(url).hostname.replace(/^www\./, '')}`;
  } catch {
    title = url.slice(0, 80) || title;
  }
  const notes = manualNotes.trim();
  return {
    title,
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
  let title = 'Image source';
  try {
    title = `Image ${new URL(url).hostname.replace(/^www\./, '')}`;
  } catch {
    title = url.slice(0, 80) || title;
  }
  const notes = manualNotes.trim();
  return {
    title,
    body: notes || `Image reference mapped from ${url}. Add alt text, visual observations, OCR text, claims, or design notes so agents can reason over the image.`,
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
    const raw = String(body.body ?? body.content ?? '').trim();
    if (!raw) {
      return NextResponse.json({ error: 'Missing intake content.' }, { status: 400 });
    }

    const detected = detectIntakeText(raw);
    if (!detected.items.length) {
      return NextResponse.json({ error: 'No supported intake items detected.' }, { status: 400 });
    }

    const store = getStore();
    const fetchRemote = body.fetchRemote !== false;
    const nodes: CanvasNode[] = [];
    const artifacts: CanvasArtifact[] = [];
    let latestCanvas: CanvasRecord | null = null;

    for (const [index, item] of detected.items.entries()) {
      const position = positionForIndex(body.position, index);
      if (item.kind === 'text') {
        const result = await store.ingestSource(id, ingestSourceInputSchema.parse({
          kind: 'note',
          title: textTitle(item.body),
          body: limitText(item.body),
          artifactKind: 'manual',
          metadata: {
            ingest: detected.urls.length ? 'text_with_links' : 'manual_text',
            chars: item.body.length,
          },
          position,
        }));
        nodes.push(result.node);
        artifacts.push(result.artifact);
        latestCanvas = result.canvas;
        continue;
      }

      if (!item.url) continue;

      if (item.kind === 'youtube') {
        const source = fetchRemote
          ? await ingestYoutube(item.url, item.attachedText ?? item.body).catch((error) => fallbackSource('source_youtube', item.url!, error))
          : fallbackSource('source_youtube', item.url, new Error('Remote fetch disabled by request.'));
        const result = await store.ingestSource(id, ingestSourceInputSchema.parse({
          kind: 'source_youtube',
          title: item.title || source.title,
          body: source.body,
          source: source.source,
          metadata: source.metadata,
          position,
        }));
        nodes.push(result.node);
        artifacts.push(result.artifact);
        latestCanvas = result.canvas;
        continue;
      }

      if (item.kind === 'video') {
        const source = videoReferenceSource(item.url, item.attachedText ?? item.body);
        const result = await store.ingestSource(id, ingestSourceInputSchema.parse({
          kind: 'source_video',
          title: item.title || source.title,
          body: source.body,
          source: source.source,
          artifactKind: 'video',
          metadata: source.metadata,
          position,
        }));
        nodes.push(result.node);
        artifacts.push(result.artifact);
        latestCanvas = result.canvas;
        continue;
      }

      if (item.kind === 'image') {
        const source = imageReferenceSource(item.url, item.attachedText ?? item.body);
        const result = await store.ingestSource(id, ingestSourceInputSchema.parse({
          kind: 'source_image',
          title: item.title || source.title,
          body: source.body,
          source: source.source,
          artifactKind: 'image',
          metadata: source.metadata,
          position,
        }));
        nodes.push(result.node);
        artifacts.push(result.artifact);
        latestCanvas = result.canvas;
        continue;
      }

      const source = fetchRemote
        ? await ingestUrl(item.url).catch((error) => fallbackSource('source_url', item.url!, error))
        : fallbackSource('source_url', item.url, new Error('Remote fetch disabled by request.'));
      const result = await store.ingestSource(id, ingestSourceInputSchema.parse({
        kind: 'source_url',
        title: item.title || source.title,
        body: source.body,
        source: source.source,
        metadata: source.metadata,
        position,
      }));
      nodes.push(result.node);
      artifacts.push(result.artifact);
      latestCanvas = result.canvas;
    }

    const action = parseAction(body.action);
    if (action && nodes.length) {
      const actionResult = await store.runAction(id, {
        action,
        inputNodeIds: nodes.map((node) => node.id),
        prompt: typeof body.prompt === 'string' ? body.prompt : '',
      });
      return NextResponse.json({
        canvas: actionResult.canvas,
        nodes,
        node: nodes[nodes.length - 1],
        artifacts,
        artifact: artifacts[artifacts.length - 1],
        run: actionResult.run,
        outputNode: actionResult.outputNode,
        detected: {
          itemCount: detected.items.length,
          kinds: detected.items.map((item) => item.kind),
          urls: detected.urls,
        },
      });
    }

    return NextResponse.json({
      canvas: latestCanvas,
      nodes,
      node: nodes[nodes.length - 1],
      artifacts,
      artifact: artifacts[artifacts.length - 1],
      detected: {
        itemCount: detected.items.length,
        kinds: detected.items.map((item) => item.kind),
        urls: detected.urls,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
