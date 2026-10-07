import { expect, test } from '@playwright/test';
import { websiteDirectionDemo } from '@starlight-agent-canvas/core';
import { generateWebsiteDirections, websiteGenerationConfiguration } from '../lib/website-generation';

test('provider adapters enforce source scope, completion, bounded replies and one active call without live requests', async () => {
  const names = ['AGENT_CANVAS_WEBSITE_GENERATION', 'AGENT_CANVAS_WEBSITE_PROVIDER', 'AGENT_CANVAS_WEBSITE_MODEL', 'AGENT_CANVAS_ALLOW_REMOTE', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY'];
  const prior = Object.fromEntries(names.map((name) => [name, process.env[name]])); const originalFetch = globalThis.fetch;
  const plan = websiteDirectionDemo();
  const output = { options: plan.options.map((option, index) => ({ ...option, sectionCopy: plan.sections.map((section) => ({ sectionId: section.id, copy: `Fixture direction ${index}: ${section.copy}`, action: option.action })), sourceQuotes: [plan.snapshot.notes.slice(0, 60)] })) };
  let calls = 0; let mode = 'success'; let captured: { url: string; body: Record<string, any>; redirect?: RequestRedirect } | undefined;
  try {
    process.env.AGENT_CANVAS_WEBSITE_GENERATION = '1'; process.env.AGENT_CANVAS_WEBSITE_PROVIDER = 'openai'; process.env.AGENT_CANVAS_WEBSITE_MODEL = 'fixture-model';
    delete process.env.AGENT_CANVAS_ALLOW_REMOTE; process.env.OPENAI_API_KEY = 'synthetic-key'; process.env.ANTHROPIC_API_KEY = 'synthetic-key';
    globalThis.fetch = async (url, init) => {
      calls += 1; captured = { url: String(url), body: JSON.parse(String(init?.body)), redirect: init?.redirect };
      if (mode === 'hold') return new Promise<Response>((_resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true }); });
      if (mode === 'rejected') return new Response('provider error containing synthetic secret', { status: 401 });
      if (mode === 'oversized') return new Response('x'.repeat(180_001));
      if (mode === 'chunked-oversized') return new Response(new ReadableStream<Uint8Array>({ start(controller) { for (let index = 0; index < 6; index += 1) controller.enqueue(new Uint8Array(32_000).fill(120)); controller.close(); } }));
      if (mode === 'invalid-utf8') return new Response(new Uint8Array([0xc3, 0x28]));
      if (mode === 'stream-hold') return new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode('{"model":')); } }));
      if (process.env.AGENT_CANVAS_WEBSITE_PROVIDER === 'anthropic') return Response.json({ model: 'fixture-returned', stop_reason: mode === 'refused' ? 'refusal' : mode === 'incomplete' ? 'max_tokens' : 'end_turn', content: [{ type: 'text', text: JSON.stringify(output) }] });
      return Response.json({ model: 'fixture-returned', status: mode === 'incomplete' ? 'incomplete' : 'completed', output: [{ type: 'message', status: 'completed', content: mode === 'refused' ? [{ type: 'refusal', refusal: 'Fixture refusal' }] : [{ type: 'output_text', text: JSON.stringify(mode === 'invalid' ? { ...output, options: [] } : output) }] }] });
    };
    const generated = await generateWebsiteDirections(plan, new AbortController().signal);
    expect(generated.generation?.provider).toBe('openai'); expect(generated.generation?.returnedModel).toBe('fixture-returned');
    expect(captured?.url).toBe('https://api.openai.com/v1/responses'); expect(captured?.redirect).toBe('error');
    expect(captured?.body.store).toBe(false); expect(captured?.body.max_output_tokens).toBe(6000);
    const payload = JSON.parse(captured!.body.input[1].content); expect(Object.keys(payload)).toEqual(['snapshot', 'brief', 'sections']);
    expect(payload.sections[0]).not.toHaveProperty('files'); expect(payload).not.toHaveProperty('assets');
    for (const failure of ['refused', 'incomplete', 'invalid', 'oversized', 'chunked-oversized', 'invalid-utf8', 'rejected']) {
      mode = failure; const before = calls;
      await expect(generateWebsiteDirections(plan, new AbortController().signal)).rejects.toThrow('billable tokens'); expect(calls).toBe(before + 1);
    }
    process.env.AGENT_CANVAS_WEBSITE_PROVIDER = 'anthropic'; mode = 'success';
    expect((await generateWebsiteDirections(plan, new AbortController().signal)).generation?.provider).toBe('anthropic');
    expect(captured?.url).toBe('https://api.anthropic.com/v1/messages'); expect(captured?.body.output_config.format.type).toBe('json_schema');
    for (const failure of ['refused', 'incomplete']) { mode = failure; await expect(generateWebsiteDirections(plan, new AbortController().signal)).rejects.toThrow('incomplete or refused'); }
    mode = 'hold'; const controller = new AbortController(); const pending = generateWebsiteDirections(plan, controller.signal);
    await expect(generateWebsiteDirections(plan, new AbortController().signal)).rejects.toThrow('in progress');
    controller.abort(); await expect(pending).rejects.toThrow('Stopped');
    mode = 'stream-hold'; const streamController = new AbortController();
    const reading = generateWebsiteDirections(plan, streamController.signal);
    await new Promise((resolve) => setTimeout(resolve, 5)); streamController.abort();
    await expect(reading).rejects.toThrow();
    mode = 'success'; await generateWebsiteDirections(plan, new AbortController().signal);
    process.env.AGENT_CANVAS_ALLOW_REMOTE = '1'; const before = calls;
    expect(websiteGenerationConfiguration().enabled).toBe(false);
    await expect(generateWebsiteDirections(plan, new AbortController().signal)).rejects.toThrow('disabled'); expect(calls).toBe(before);
  } finally {
    globalThis.fetch = originalFetch;
    for (const name of names) if (prior[name] === undefined) delete process.env[name]; else process.env[name] = prior[name];
  }
});
