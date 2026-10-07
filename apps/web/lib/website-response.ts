import { NextResponse } from 'next/server';
import { checkpointErrorResponse } from './checkpoint-response';

export function websiteOriginDenied(request: Request): NextResponse | null {
  const origin = request.headers.get('origin');
  const expected = `${new URL(request.url).protocol}//${request.headers.get('host')?.toLowerCase()}`;
  if (request.headers.get('sec-fetch-site') === 'cross-site' || (origin && origin !== expected)) return NextResponse.json({ error: 'Website plan changes require the workspace origin.' }, { status: 403 });
  return null;
}

export async function websiteRequestBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Website request is empty.');
  const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > 120_000) { await reader.cancel(); throw new Error('Website request exceeds 120 KB.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export function websiteErrorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message.startsWith('Website plan changed') || message.startsWith('Selected website plan') || message.startsWith('Choose a saved')) return NextResponse.json({ error: message }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
  if (message.startsWith('Multiple website')) return NextResponse.json({ error: 'Website plan evidence needs owner reconciliation. The canvas is still available.' }, { status: 409 });
  if (message.startsWith('Website request exceeds') || message.startsWith('Website plan exceeds')) return NextResponse.json({ error: 'Website plan is too large. Keep a focused plan under 100 KB.' }, { status: 413 });
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOENT' || ['EACCES', 'EPERM', 'EBUSY', 'ENOSPC'].includes(code ?? '') || message.startsWith('Checkpoint') || message.startsWith('Timed out waiting') || message.startsWith('Canvas lock ownership')) return checkpointErrorResponse(error);
  return NextResponse.json({ error: 'Website plan could not be validated. Check its source, unique IDs, target, placement references and provenance. Your draft is unchanged.' }, { status: 400 });
}
