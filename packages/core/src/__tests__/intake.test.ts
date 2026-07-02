import { describe, expect, it } from 'vitest';
import { detectIntakeText, isKnownVideoLink, normalizeYoutubeReference } from '../intake.js';

describe('intake detection', () => {
  it('normalizes YouTube ids and attaches transcript notes to a single media source', () => {
    expect(normalizeYoutubeReference('abcdefghijk')).toBe('https://www.youtube.com/watch?v=abcdefghijk');

    const plan = detectIntakeText('https://youtu.be/abcdefghijk\nManual transcript about a research canvas.');
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({
      kind: 'youtube',
      attachedText: 'Manual transcript about a research canvas.',
      url: 'https://youtu.be/abcdefghijk',
    });
  });

  it('detects broad video links and image references', () => {
    expect(isKnownVideoLink('https://www.loom.com/share/abc')).toBe(true);
    expect(isKnownVideoLink('https://frame.io/review/abc')).toBe(true);

    const plan = detectIntakeText([
      'https://vimeo.com/123456789',
      'https://example.com/workflow.png',
      'Notes that should become their own source when multiple URLs exist.',
    ].join('\n'));

    expect(plan.items.map((item) => item.kind)).toEqual(['video', 'image', 'text']);
    expect(plan.items[2].body).toContain('Notes that should become their own source');
  });

  it('treats plain text as source context', () => {
    const plan = detectIntakeText('Plain source notes for agent context.');
    expect(plan.urls).toEqual([]);
    expect(plan.items).toEqual([{
      kind: 'text',
      title: 'Plain source notes for agent context.',
      body: 'Plain source notes for agent context.',
    }]);
  });
});
