import { describe, expect, it } from 'vitest';
import { detectIntakeText, isKnownVideoLink, normalizeYoutubeReference } from '../intake.js';

describe('intake detection', () => {
  it('normalizes YouTube ids and attaches transcript notes to a single media source', () => {
    expect(normalizeYoutubeReference('abcdefghijk')).toBe('https://www.youtube.com/watch?v=abcdefghijk');

    const idPlan = detectIntakeText('abcdefghijk');
    expect(idPlan.items).toHaveLength(1);
    expect(idPlan.items[0]).toMatchObject({
      kind: 'youtube',
      attachedText: '',
      url: 'https://www.youtube.com/watch?v=abcdefghijk',
    });

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

    expect(plan.items.map((item) => item.kind)).toEqual(['video', 'image']);
    expect(plan.items[1].attachedText).toContain('Notes that should become their own source');
    expect(plan.notes).toBe('');
  });

  it('attaches nearby source-specific notes across mixed media pastes', () => {
    const plan = detectIntakeText([
      'https://youtu.be/abcdefghijk',
      'Manual transcript: the demo shows a research canvas that turns video into Codex context.',
      'https://www.loom.com/share/starlight-proof',
      'Notes: the Loom walkthrough shows the source receipt and handoff buttons.',
      'https://example.com/workflow.png',
      'OCR: button labels include Context, Codex, and Inspect.',
    ].join('\n'));

    expect(plan.items.map((item) => item.kind)).toEqual(['youtube', 'video', 'image']);
    expect(plan.items.find((item) => item.kind === 'youtube')?.attachedText).toContain('Manual transcript');
    expect(plan.items.find((item) => item.kind === 'video')?.attachedText).toContain('Loom walkthrough');
    expect(plan.items.find((item) => item.kind === 'image')?.attachedText).toContain('button labels');
    expect(plan.notes).toBe('');
  });

  it('keeps web URL notes as source notes instead of attaching them to a fetched page', () => {
    const plan = detectIntakeText('https://example.com/research\nCompare this page against the video sources.');
    expect(plan.items.map((item) => item.kind)).toEqual(['url', 'text']);
    expect(plan.items[1].body).toContain('Compare this page');
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
