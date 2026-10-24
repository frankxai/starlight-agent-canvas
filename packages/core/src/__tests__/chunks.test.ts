import { describe, it, expect } from 'vitest';
import { buildSourceChunks, SOURCE_CHUNK_MAX_CHARS, SOURCE_CHUNK_OVERLAP_CHARS, chunksForArtifact } from '../chunks.js';
import type { CanvasArtifact } from '../schemas.js';

describe('chunks module', () => {
  describe('buildSourceChunks', () => {
    it('returns empty array for empty string', () => {
      expect(buildSourceChunks('test-art', '')).toEqual([]);
      expect(buildSourceChunks('test-art', '   ')).toEqual([]);
    });

    it('chunks short text into a single chunk', () => {
      const text = 'Hello world';
      const chunks = buildSourceChunks('test-art', text);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe(text);
      expect(chunks[0].startOffset).toBe(0);
      expect(chunks[0].endOffset).toBe(text.length);
    });

    it('splits text on paragraphs', () => {
      const text = 'Para 1\n\nPara 2\n\nPara 3';
      const chunks = buildSourceChunks('test-art', text, 10, 2);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('splits text on sentences', () => {
      const text = 'Sentence one. Sentence two. Sentence three.';
      const chunks = buildSourceChunks('test-art', text, 20, 2);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('splits text on whitespace', () => {
      const text = 'word1 word2 word3 word4 word5';
      const chunks = buildSourceChunks('test-art', text, 12, 2);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('handles hard break when no good break is found', () => {
        const text = 'abcdefghijklmnopqrstuvwxyz';
        const chunks = buildSourceChunks('test-art', text, 10, 2);
        expect(chunks.length).toBeGreaterThan(1);
        expect(chunks[0].text).toBe('abcdefghij');
    });

    it('respects overlap chars', () => {
        const text = 'abcdefghijklmnopqrstuvwxyz';
        const chunks = buildSourceChunks('test-art', text, 10, 2);
        expect(chunks[1].startOffset).toBe(8); // 10 - 2
    });
  });

  describe('chunksForArtifact', () => {
    it('returns existing chunks if present', () => {
      const artifact: CanvasArtifact = {
        id: 'test-art',
        kind: 'markdown',
        title: 'Test',
        body: 'Hello',
        createdAt: new Date().toISOString(),
        metadata: {},
        chunks: [
          { id: 'test-art:chunk-001', index: 0, text: 'Hello', startOffset: 0, endOffset: 5 }
        ]
      };

      const chunks = chunksForArtifact(artifact);
      expect(chunks).toEqual(artifact.chunks);
    });

    it('builds new chunks if none present', () => {
        const artifact: CanvasArtifact = {
          id: 'test-art',
          kind: 'markdown',
          title: 'Test',
          body: 'Hello world',
          createdAt: new Date().toISOString(),
          metadata: {},
          chunks: []
        };

        const chunks = chunksForArtifact(artifact);
        expect(chunks).toHaveLength(1);
        expect(chunks[0].text).toBe('Hello world');
      });
  });
});
