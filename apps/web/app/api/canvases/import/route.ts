import { NextResponse } from 'next/server';
import { canvasRecordSchema } from '@starlight-agent-canvas/core';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';

const MAX_IMPORT_CHARS = 5_000_000;

export async function POST(request: Request) {
  try {
    const raw = await request.text();
    if (!raw.trim()) {
      return NextResponse.json({ error: 'Missing canvas JSON.' }, { status: 400 });
    }
    if (raw.length > MAX_IMPORT_CHARS) {
      return NextResponse.json({ error: `Canvas import must be ${MAX_IMPORT_CHARS} characters or smaller.` }, { status: 413 });
    }

    const payload = JSON.parse(raw) as { canvas?: unknown } | unknown;
    const sourceCanvas = canvasRecordSchema.parse(
      typeof payload === 'object' && payload !== null && 'canvas' in payload
        ? (payload as { canvas: unknown }).canvas
        : payload,
    );
    const canvas = await getStore().importCanvas(sourceCanvas);
    return NextResponse.json({
      canvas,
      import: {
        conflict: canvas.id !== sourceCanvas.id ? 'copy' : 'none',
        sourceId: sourceCanvas.id,
        sourceTitle: sourceCanvas.title,
        importedId: canvas.id,
        importedTitle: canvas.title,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
