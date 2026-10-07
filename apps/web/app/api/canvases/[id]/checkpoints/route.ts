import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json({ checkpoints: await getStore().listCheckpoints(id) }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    // A browser on another origin cannot create history in the local workspace.
    const origin = request.headers.get('origin');
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Checkpoint saves require the workspace origin.' }, { status: 403 });
    const { id } = await context.params;
    const checkpoint = await getStore().createCheckpoint(id, await request.json());
    return NextResponse.json({ checkpoint }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
