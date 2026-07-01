import { NextResponse } from 'next/server';
import { listTemplates } from '@starlight-agent-canvas/core';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';

export async function GET() {
  const store = getStore();
  const canvases = await store.listCanvases();
  const home = process.env.AGENT_CANVAS_HOME ? 'custom AGENT_CANVAS_HOME' : 'default local home';
  return NextResponse.json({ canvases, templates: listTemplates(), home });
}

export async function POST(request: Request) {
  const body = await request.json();
  const canvas = await getStore().createCanvas(body);
  return NextResponse.json({ canvas });
}
