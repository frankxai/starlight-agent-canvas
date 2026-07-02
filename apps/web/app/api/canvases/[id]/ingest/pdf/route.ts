import { NextResponse } from 'next/server';
import { createIntakeTraceForNodes, ingestPdf, MAX_PDF_BYTES } from '@starlight-agent-canvas/core';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Missing PDF file.' }, { status: 400 });
    }
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return NextResponse.json({ error: 'Only PDF files can be ingested.' }, { status: 400 });
    }
    if (file.size > MAX_PDF_BYTES) {
      return NextResponse.json({ error: `PDF must be ${MAX_PDF_BYTES} bytes or smaller.` }, { status: 413 });
    }
    const source = await ingestPdf(await file.arrayBuffer(), file.name);
    const rawX = form.get('positionX');
    const rawY = form.get('positionY');
    const x = typeof rawX === 'string' ? Number(rawX) : NaN;
    const y = typeof rawY === 'string' ? Number(rawY) : NaN;
    const position = Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
    const store = getStore();
    const result = await store.ingestSource(id, {
      kind: 'source_pdf',
      title: source.title,
      body: source.body,
      source: source.source,
      metadata: source.metadata,
      position,
    });
    const { trace, sourceReadiness } = createIntakeTraceForNodes({
      canvas: result.canvas,
      nodes: [result.node],
      artifacts: [result.artifact],
      origin: position ? 'web_drop' : 'web_upload',
      sourceLabel: position ? 'Dropped PDF' : 'Uploaded PDF',
      inputSummary: file.name,
      inputChars: source.body.length,
      detectedKinds: ['pdf'],
    });
    const canvas = await store.appendIntakeTrace(id, trace);
    return NextResponse.json({ ...result, canvas, trace, sourceReadiness });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
