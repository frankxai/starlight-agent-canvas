import { Buffer } from 'node:buffer';
import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';

const MAX_IMAGE_BYTES = 5_000_000;
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
]);

function isSupportedImage(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.has(file.type)
    || /\.(png|jpe?g|webp|gif|avif)$/i.test(file.name);
}

function positionFromForm(form: FormData): { x: number; y: number } | undefined {
  const rawX = form.get('positionX');
  const rawY = form.get('positionY');
  const x = typeof rawX === 'string' ? Number(rawX) : NaN;
  const y = typeof rawY === 'string' ? Number(rawY) : NaN;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing image file.' }, { status: 400 });
    }
    if (!isSupportedImage(file)) {
      return NextResponse.json({ error: 'Only PNG, JPEG, WebP, GIF, and AVIF images can be ingested.' }, { status: 400 });
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: `Image must be ${MAX_IMAGE_BYTES} bytes or smaller.` }, { status: 413 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || 'image/png';
    const dataUrl = `data:${mimeType};base64,${bytes.toString('base64')}`;
    const altText = typeof form.get('altText') === 'string' ? String(form.get('altText')).trim() : '';
    const body = altText || [
      `Image source: ${file.name}`,
      `Type: ${mimeType}`,
      `Size: ${file.size} bytes`,
      '',
      'Add visual observations, OCR text, design notes, claims, or questions here so agents can reason over the image.',
    ].join('\n');

    const result = await getStore().ingestSource(id, {
      kind: 'source_image',
      title: file.name,
      body,
      source: file.name,
      artifactKind: 'image',
      metadata: {
        ingest: 'image_upload',
        filename: file.name,
        mimeType,
        fileSize: file.size,
        imageDataUrl: dataUrl,
        media: 'image_upload',
      },
      position: positionFromForm(form),
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
