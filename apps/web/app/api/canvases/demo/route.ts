import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';

function repoRootFromRuntime(): string {
  const configured = process.env.AGENT_CANVAS_REPO_ROOT?.trim();
  const base = path.normalize(configured || process.cwd());
  if (path.basename(base) === 'web' && path.basename(path.dirname(base)) === 'apps') {
    return path.dirname(path.dirname(base));
  }
  return base;
}

export async function POST() {
  try {
    const demoPath = path.join(repoRootFromRuntime(), 'examples', 'demo-canvas.json');
    const raw = await readFile(/* turbopackIgnore: true */ demoPath, 'utf8');
    const canvas = await getStore().importCanvas(JSON.parse(raw));
    return NextResponse.json({ canvas, source: 'examples/demo-canvas.json' });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
