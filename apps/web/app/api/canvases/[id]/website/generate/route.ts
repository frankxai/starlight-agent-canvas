import { NextResponse } from 'next/server';
import { parseWebsitePlan } from '@starlight-agent-canvas/core/website';
import { getStore } from '@/lib/store';
import { websiteOriginDenied } from '@/lib/website-response';
import { generateWebsiteDirections, readGenerationRequest, websiteGenerationConfiguration, WebsiteGenerationError } from '@/lib/website-generation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
function localOnly(request: Request) {
  const host = new URL(request.url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  return process.env.AGENT_CANVAS_ALLOW_REMOTE !== '1' && ['localhost', '127.0.0.1', '::1'].includes(host);
}
export async function GET(request: Request) {
  if (!localOnly(request)) return NextResponse.json({ enabled: false, provider: null, model: null, boundary: 'Generation is available only in the local workspace.' }, { headers });
  return NextResponse.json(websiteGenerationConfiguration(), { headers });
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const denied = websiteOriginDenied(request); if (denied) return denied;
  if (!localOnly(request)) return NextResponse.json({ error: 'Generation requires the local workspace; remote mode is unsupported.' }, { status: 403, headers });
  if (!websiteGenerationConfiguration().enabled) return NextResponse.json({ error: 'Optional generation is disabled or unconfigured. Your draft is unchanged.' }, { status: 503, headers });
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener('abort', abort, { once: true });
  if (request.signal.aborted) controller.abort();
  const timeout = setTimeout(abort, 60_000);
  try {
    const { id } = await context.params;
    await getStore().getCanvas(id); // Existence only; no unrelated node is sent.
    const raw = await readGenerationRequest(request, controller.signal);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).length !== 1 || !('plan' in raw)) throw new WebsiteGenerationError('Generation requires one website plan.', 400);
    let plan;
    try { plan = parseWebsitePlan(raw.plan); } catch { throw new WebsiteGenerationError('Complete and validate the current draft before generation.', 400); }
    const proposal = await generateWebsiteDirections(plan, controller.signal);
    return NextResponse.json({ plan: proposal }, { headers });
  } catch (error) {
    if (controller.signal.aborted) return NextResponse.json({ error: 'Generation stopped or timed out. Your draft is unchanged. The provider may have processed billable tokens; inspect before trying again.' }, { status: 504, headers });
    return NextResponse.json({ error: error instanceof WebsiteGenerationError ? error.message : 'Generation could not complete. Your draft is unchanged.' }, { status: error instanceof WebsiteGenerationError ? error.status : 400, headers });
  } finally { clearTimeout(timeout); request.signal.removeEventListener('abort', abort); }
}
