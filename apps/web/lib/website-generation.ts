import { createHash } from 'node:crypto';
import { applyWebsiteGeneration, websiteGenerationInput, websiteGenerationJsonSchema, WEBSITE_GENERATION_PROMPT } from '@starlight-agent-canvas/core/website';
import type { WebsitePlan } from '@starlight-agent-canvas/core';

type Provider = 'openai' | 'anthropic' | 'openrouter';
export function websiteGenerationConfiguration() {
  const provider = process.env.AGENT_CANVAS_WEBSITE_PROVIDER;
  const model = process.env.AGENT_CANVAS_WEBSITE_MODEL;
  const key = provider === 'openai' ? process.env.OPENAI_API_KEY : provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : provider === 'openrouter' ? process.env.OPENROUTER_API_KEY : undefined;
  const validModel = model && model.length <= 128 && (provider === 'openrouter'
    ? /^[a-zA-Z0-9._:-]+\/[a-zA-Z0-9._:-]+$/.test(model) && !model.startsWith('openrouter/')
    : /^[a-zA-Z0-9._:-]{1,128}$/.test(model));
  const enabled = process.env.AGENT_CANVAS_WEBSITE_GENERATION === '1' && process.env.AGENT_CANVAS_ALLOW_REMOTE !== '1'
    && (provider === 'openai' || provider === 'anthropic' || provider === 'openrouter') && Boolean(validModel) && Boolean(key);
  return { enabled, provider: enabled ? provider as Provider : null, model: enabled ? model! : null,
    boundary: 'Only the displayed source observations, brief and section text are sent. Generation uses your configured provider account. No media files, provenance records or other canvas nodes are sent. No automatic retry.' };
}

export class WebsiteGenerationError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

async function readBounded(body: ReadableStream<Uint8Array> | null, signal: AbortSignal, limit: number): Promise<string> {
  if (!body) throw new WebsiteGenerationError('Generation returned an empty response. Your draft is unchanged.');
  const reader = body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, { once: true });
  try {
    signal.throwIfAborted();
    while (true) {
      const result = await reader.read(); signal.throwIfAborted();
      if (result.done) break;
      length += result.value.length;
      if (length > limit) throw new WebsiteGenerationError('Generation exceeded the response limit. Your draft is unchanged.');
      chunks.push(result.value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } finally { signal.removeEventListener('abort', abort); await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function readGenerationRequest(request: Request, signal: AbortSignal) {
  try { return JSON.parse(await readBounded(request.body, signal, 105_000)); }
  catch (error) { if (signal.aborted) throw error; throw new WebsiteGenerationError('Generation requires a valid focused website plan under 100 KB.', 400); }
}

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
let active = false;
export async function generateWebsiteDirections(plan: WebsitePlan, signal: AbortSignal): Promise<WebsitePlan> {
  const configuration = websiteGenerationConfiguration();
  if (!configuration.enabled) throw new WebsiteGenerationError('Optional generation is disabled or unconfigured. Editing, saving and exporting remain available.', 503);
  if (active) throw new WebsiteGenerationError('Another generation is in progress. Keep your draft and try again after it finishes.', 409);
  const input = JSON.stringify(websiteGenerationInput(plan));
  const provider = configuration.provider!; const model = configuration.model!;
  const key = provider === 'openai' ? process.env.OPENAI_API_KEY! : provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY! : process.env.OPENROUTER_API_KEY!;
  const schema = websiteGenerationJsonSchema;
  const body = provider === 'openai'
    ? { model, store: false, max_output_tokens: 6000, input: [{ role: 'developer', content: WEBSITE_GENERATION_PROMPT }, { role: 'user', content: input }], text: { format: { type: 'json_schema', name: 'website_directions', strict: true, schema } } }
    : provider === 'anthropic'
      ? { model, max_tokens: 6000, system: WEBSITE_GENERATION_PROMPT, messages: [{ role: 'user', content: input }], output_config: { format: { type: 'json_schema', schema } } }
      : { model, max_tokens: 6000, stream: false, messages: [{ role: 'system', content: WEBSITE_GENERATION_PROMPT }, { role: 'user', content: input }], response_format: { type: 'json_schema', json_schema: { name: 'website_directions', strict: true, schema } }, provider: { require_parameters: true, allow_fallbacks: false } };
  active = true;
  try {
    const response = await fetch(provider === 'openai' ? 'https://api.openai.com/v1/responses' : provider === 'anthropic' ? 'https://api.anthropic.com/v1/messages' : 'https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST', redirect: 'error', cache: 'no-store', signal,
      headers: provider !== 'anthropic' ? { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` } : { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify(body),
    });
    if (!response.ok) { await response.body?.cancel(); throw new WebsiteGenerationError('The configured provider rejected generation. Check its configuration and account; your draft is unchanged. No retry was made.'); }
    const envelope = JSON.parse(await readBounded(response.body, signal, 180_000)) as Record<string, unknown>;
    if (typeof envelope.model !== 'string' || !envelope.model || envelope.model.length > 128) throw new WebsiteGenerationError('Generation did not report a usable model identity. Your draft is unchanged.');
    let output: string;
    if (provider === 'openai') {
      if (envelope.status !== 'completed' || !Array.isArray(envelope.output) || envelope.output.some((item) => !item || !['message', 'reasoning'].includes(item.type))) throw new WebsiteGenerationError('Generation was incomplete or refused. Your draft is unchanged.');
      const messages = envelope.output.filter((item) => item && item.type === 'message');
      if (messages.length !== 1 || messages[0].status !== 'completed' || !Array.isArray(messages[0].content) || messages[0].content.length !== 1 || messages[0].content[0].type !== 'output_text' || typeof messages[0].content[0].text !== 'string') throw new WebsiteGenerationError('Generation was incomplete or refused. Your draft is unchanged.');
      output = messages[0].content[0].text;
    } else if (provider === 'anthropic') {
      if (envelope.stop_reason !== 'end_turn' || !Array.isArray(envelope.content) || envelope.content.some((block) => !block || !['text', 'thinking', 'redacted_thinking'].includes(block.type))) throw new WebsiteGenerationError('Generation was incomplete or refused. Your draft is unchanged.');
      const texts = envelope.content.filter((block) => block.type === 'text');
      if (texts.length !== 1 || typeof texts[0].text !== 'string') throw new WebsiteGenerationError('Generation was incomplete or refused. Your draft is unchanged.');
      // This is a single-turn request, with no tool loop or continuation. Opaque
      // reasoning blocks are not surfaced, parsed, stored or round-tripped.
      output = texts[0].text;
    } else {
      if (envelope.error != null || !Array.isArray(envelope.choices) || envelope.choices.length !== 1) throw new WebsiteGenerationError('Generation was incomplete or refused. Your draft is unchanged.');
      const choice = envelope.choices[0]; const message = choice?.message;
      if (!choice || choice.error != null || choice.finish_reason !== 'stop' || !message || message.role !== 'assistant'
        || typeof message.content !== 'string' || message.refusal != null || message.function_call != null
        || (message.tool_calls != null && (!Array.isArray(message.tool_calls) || message.tool_calls.length !== 0))) throw new WebsiteGenerationError('Generation was incomplete or refused. Your draft is unchanged.');
      // Only the final text is consumed; opaque reasoning and provider usage
      // fields are never copied into the plan or treated as invoice evidence.
      output = message.content;
    }
    signal.throwIfAborted();
    try {
      return applyWebsiteGeneration(plan, JSON.parse(output), { version: 'starlight.websiteGeneration.v1', provider, requestedModel: model, returnedModel: envelope.model, generatedAt: new Date().toISOString(), inputHash: hash(input), outputHash: hash(output), promptHash: hash(WEBSITE_GENERATION_PROMPT), authority: 'local_assertion' });
    } catch { throw new WebsiteGenerationError('Generated copy did not satisfy the section, source quote or size checks. Your draft is unchanged. No retry was made.'); }
  } catch (error) {
    if (signal.aborted) throw error;
    const explanation = error instanceof WebsiteGenerationError ? error.message : 'The provider response could not be read or validated. Your draft is unchanged.';
    throw new WebsiteGenerationError(`${explanation} The provider may have processed billable tokens; inspect before trying again.`);
  } finally { active = false; }
}
