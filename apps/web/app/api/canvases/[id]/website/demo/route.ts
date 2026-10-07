import { NextResponse } from 'next/server';
import { websiteDirectionDemo } from '@starlight-agent-canvas/core';
export const dynamic = 'force-dynamic';
// Read-only. Loading the authored example does not save it or choose a direction.
export async function GET() { return NextResponse.json({ plan: websiteDirectionDemo() }, { headers: { 'Cache-Control': 'no-store' } }); }
