import { describe, expect, it } from 'vitest';
import { extractYoutubeVideoId, ingestUrl, ingestYoutube } from '../ingest.js';

describe('ingestion', () => {
  it('extracts basic URL text without Firecrawl', async () => {
    const previous = process.env.FIRECRAWL_API_KEY;
    process.env.FIRECRAWL_API_KEY = 'present-but-not-opted-in';
    const calls: string[] = [];
    const fakeFetch = async (input: string | URL) => {
      calls.push(String(input));
      return new Response('<html><title>Example</title><body><h1>Hello</h1><p>Agent canvas.</p></body></html>', {
        headers: { 'content-type': 'text/html' },
      });
    };
    let source;
    try {
      source = await ingestUrl('https://example.com', fakeFetch);
    } finally {
      if (previous === undefined) delete process.env.FIRECRAWL_API_KEY;
      else process.env.FIRECRAWL_API_KEY = previous;
    }
    expect(source.title).toBe('Example');
    expect(source.body).toContain('Agent canvas');
    expect(calls).toEqual(['https://example.com/']);
  });

  it('rejects private hosts and oversized responses', async () => {
    const fakeFetch = async () => new Response('ok');
    await expect(ingestUrl('http://127.0.0.1:3000', fakeFetch)).rejects.toThrow(/Private/);

    await expect(ingestUrl('https://example.com', {
      fetcher: async () => new Response('too large', { headers: { 'content-length': '99', 'content-type': 'text/plain' } }),
      maxBytes: 10,
    })).rejects.toThrow(/larger/);
  });

  it('revalidates redirects before fetching redirected content', async () => {
    const fakeFetch = async (input: string | URL) => {
      if (String(input) === 'https://example.com/') {
        return new Response('', {
          status: 302,
          headers: { location: 'http://127.0.0.1:3000/private' },
        });
      }
      return new Response('should not fetch private content');
    };

    await expect(ingestUrl('https://example.com', fakeFetch)).rejects.toThrow(/Private/);
  });

  it('parses YouTube ids and accepts manual transcripts', async () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch?v=abcdefghijk')).toBe('abcdefghijk');
    const source = await ingestYoutube(
      'https://www.youtube.com/watch?v=abcdefghijk',
      'Manual transcript',
      async () => new Response(JSON.stringify({ title: 'Video title' }), { headers: { 'content-type': 'application/json' } }),
    );
    expect(source.title).toBe('Video title');
    expect(source.body).toBe('Manual transcript');
  });
});
