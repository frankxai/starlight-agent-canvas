import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get('q') || '';
  const results = await getStore().searchArtifacts(query);
  return NextResponse.json({ results });
}
