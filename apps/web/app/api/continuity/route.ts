import { NextResponse } from 'next/server';
import { describeContinuityWork, readContinuityStatus } from '@starlight-agent-canvas/core';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Read-only proxy over SIS session continuity. Unavailable states are a normal 200
// response so the page can show the recovery step instead of a generic failure.
export async function GET() {
  const result = await readContinuityStatus();
  if (result.state === 'unavailable') return NextResponse.json(result, { headers: { 'cache-control': 'no-store' } });
  const works = result.status.works.map((work) => ({ ...work, guidance: describeContinuityWork(work) }));
  return NextResponse.json({ ...result, status: { ...result.status, works } }, { headers: { 'cache-control': 'no-store' } });
}
