import { Buffer } from 'node:buffer';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export const MAX_INGEST_BYTES = 1_000_000;
export const MAX_PDF_BYTES = 10_000_000;
export const MAX_EXTRACTED_TEXT_CHARS = 120_000;
export const DEFAULT_FETCH_TIMEOUT_MS = 10_000;

export interface IngestUrlOptions {
  fetcher?: FetchLike;
  useFirecrawl?: boolean;
  allowPrivateHosts?: boolean;
  resolveDns?: boolean;
  maxBytes?: number;
  timeoutMs?: number;
}

export interface IngestPdfOptions {
  maxBytes?: number;
  maxTextChars?: number;
}

export interface IngestedSource {
  title: string;
  body: string;
  source: string;
  metadata: Record<string, unknown>;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function titleFromHtml(html: string, fallback: string): string {
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim();
  return title || fallback;
}

function limitText(value: string, maxChars = MAX_EXTRACTED_TEXT_CHARS): string {
  return value.length > maxChars ? `${value.slice(0, maxChars)}\n\n[Truncated at ${maxChars} characters.]` : value;
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateNetworkAddress(address: string): boolean {
  const kind = isIP(address);
  if (kind === 4) return isPrivateIpv4(address);
  if (kind === 6) {
    const lower = address.toLowerCase();
    const mappedIpv4 = lower.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (mappedIpv4) return isPrivateIpv4(mappedIpv4);
    return (
      lower === '::' ||
      lower === '::1' ||
      lower.startsWith('fc') ||
      lower.startsWith('fd') ||
      lower.startsWith('fe80:') ||
      lower.startsWith('2001:db8:')
    );
  }
  return false;
}

function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local');
}

async function assertPublicFetchUrl(rawUrl: string, options: Required<Pick<IngestUrlOptions, 'allowPrivateHosts' | 'resolveDns'>>): Promise<URL> {
  const parsed = new URL(rawUrl.trim());
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Only http and https URLs can be ingested.');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Credentialed URLs are not allowed.');
  }
  if (options.allowPrivateHosts) return parsed;

  if (isLocalHostname(parsed.hostname) || isPrivateNetworkAddress(parsed.hostname)) {
    throw new Error('Private, localhost, and link-local URLs are not allowed.');
  }

  if (options.resolveDns) {
    const records = await lookup(parsed.hostname, { all: true, verbatim: true });
    if (!records.length || records.some((record) => isPrivateNetworkAddress(record.address))) {
      throw new Error('URL host resolves to a private or unsupported address.');
    }
  }

  return parsed;
}

async function fetchWithTimeout(fetcher: FetchLike, input: string | URL, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetcher(input, { ...init, signal: controller.signal });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error(`URL fetch timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function readLimitedText(response: Response, maxBytes: number): Promise<string> {
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > maxBytes) {
    throw new Error(`Response is larger than ${maxBytes} bytes.`);
  }
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > maxBytes) {
      throw new Error(`Response is larger than ${maxBytes} bytes.`);
    }
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = Buffer.from(value);
    total += chunk.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw new Error(`Response is larger than ${maxBytes} bytes.`);
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function ingestUrl(url: string, fetcherOrOptions: FetchLike | IngestUrlOptions = {}): Promise<IngestedSource> {
  const options: IngestUrlOptions = typeof fetcherOrOptions === 'function'
    ? { fetcher: fetcherOrOptions }
    : fetcherOrOptions;
  const fetcher = options.fetcher ?? fetch;
  const maxBytes = options.maxBytes ?? MAX_INGEST_BYTES;
  const timeoutMs = options.timeoutMs ?? DEFAULT_FETCH_TIMEOUT_MS;
  const parsedUrl = await assertPublicFetchUrl(url, {
    allowPrivateHosts: options.allowPrivateHosts ?? false,
    resolveDns: options.resolveDns ?? fetcher === fetch,
  });
  const normalizedUrl = parsedUrl.toString();
  const apiKey = process.env.FIRECRAWL_API_KEY?.trim();
  if (apiKey && options.useFirecrawl === true) {
    try {
      const res = await fetchWithTimeout(fetcher, 'https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: normalizedUrl, formats: ['markdown', 'html'] }),
      }, timeoutMs);
      if (res.ok) {
        const data = JSON.parse(await readLimitedText(res, maxBytes)) as {
          data?: { markdown?: string; html?: string; metadata?: { title?: string } };
        };
        const body = limitText(data.data?.markdown || stripHtml(data.data?.html || ''));
        if (body) {
          return {
            title: data.data?.metadata?.title || parsedUrl.hostname,
            body,
            source: normalizedUrl,
            metadata: { url: normalizedUrl, ingest: 'firecrawl' },
          };
        }
      }
    } catch {
      // Fall through to basic fetch. Firecrawl is optional by design.
    }
  }

  const res = await fetchWithTimeout(fetcher, normalizedUrl, {
    headers: { accept: 'text/html,text/plain,text/markdown,application/xhtml+xml,application/json;q=0.7,*/*;q=0.1' },
  }, timeoutMs);
  if (!res.ok) {
    throw new Error(`URL fetch failed: ${res.status} ${res.statusText}`);
  }
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType && !/(text\/|application\/(xhtml\+xml|json|xml))/i.test(contentType)) {
    throw new Error(`Unsupported URL content type: ${contentType}`);
  }
  const html = await readLimitedText(res, maxBytes);
  return {
    title: titleFromHtml(html, parsedUrl.hostname),
    body: limitText(stripHtml(html)),
    source: normalizedUrl,
    metadata: { url: normalizedUrl, ingest: 'basic_fetch' },
  };
}

export function extractYoutubeVideoId(url: string): string | null {
  const value = url.trim();
  const direct = value.match(/^[a-zA-Z0-9_-]{11}$/)?.[0];
  if (direct) return direct;
  try {
    const parsed = new URL(value);
    if (parsed.hostname.includes('youtu.be')) return parsed.pathname.slice(1, 12) || null;
    if (parsed.searchParams.get('v')) return parsed.searchParams.get('v')?.slice(0, 11) || null;
    const shorts = parsed.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (shorts) return shorts[1];
  } catch {
    return null;
  }
  return null;
}

export async function ingestYoutube(url: string, manualTranscript = '', fetcher: FetchLike = fetch): Promise<IngestedSource> {
  const videoId = extractYoutubeVideoId(url);
  if (!videoId) throw new Error('Could not parse YouTube video id.');

  let title = `YouTube ${videoId}`;
  try {
    const oembed = await fetcher(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (oembed.ok) {
      const data = await oembed.json() as { title?: string; author_name?: string };
      title = data.title || title;
    }
  } catch {
    // Title lookup is best effort.
  }

  const body = manualTranscript.trim()
    ? manualTranscript.trim()
    : `Transcript not fetched automatically for ${url}. Paste a transcript or notes here, then run canvas actions.`;

  return {
    title,
    body,
    source: url,
    metadata: {
      url,
      videoId,
      ingest: manualTranscript.trim() ? 'manual_transcript' : 'youtube_metadata_only',
    },
  };
}

export async function ingestPdf(buffer: Buffer | ArrayBuffer | Uint8Array, filename = 'document.pdf', options: IngestPdfOptions = {}): Promise<IngestedSource> {
  const bytes = Buffer.isBuffer(buffer)
    ? buffer
    : buffer instanceof ArrayBuffer
      ? Buffer.from(new Uint8Array(buffer))
      : Buffer.from(buffer as ArrayLike<number>);
  const maxBytes = options.maxBytes ?? MAX_PDF_BYTES;
  const maxTextChars = options.maxTextChars ?? MAX_EXTRACTED_TEXT_CHARS;
  if (bytes.byteLength > maxBytes) {
    throw new Error(`PDF is larger than ${maxBytes} bytes.`);
  }
  try {
    const pdfParse = (await import('pdf-parse')).default;
    const parsed = await pdfParse(bytes);
    return {
      title: parsed.info?.Title || filename,
      body: limitText(parsed.text.trim() || `No selectable text extracted from ${filename}.`, maxTextChars),
      source: filename,
      metadata: { filename, pages: parsed.numpages, ingest: 'pdf_parse', truncatedAt: maxTextChars },
    };
  } catch (error) {
    const text = bytes.toString('utf8').replace(/[^\x09\x0A\x0D\x20-\x7E]+/g, ' ').replace(/\s+/g, ' ').trim();
    return {
      title: filename,
      body: limitText(text || `PDF extraction failed for ${filename}: ${(error as Error).message}`, maxTextChars),
      source: filename,
      metadata: { filename, ingest: 'pdf_fallback', error: (error as Error).message },
    };
  }
}
