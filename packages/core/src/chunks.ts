import type { CanvasArtifact, SourceChunk } from './schemas.js';

export const SOURCE_CHUNK_MAX_CHARS = 1400;
export const SOURCE_CHUNK_OVERLAP_CHARS = 160;

function chunkId(artifactId: string, index: number): string {
  return `${artifactId}:chunk-${String(index + 1).padStart(3, '0')}`;
}

function chooseChunkEnd(text: string, start: number, maxChars: number): number {
  const hardEnd = Math.min(text.length, start + maxChars);
  if (hardEnd >= text.length) return text.length;

  const paragraphBreak = text.lastIndexOf('\n\n', hardEnd);
  if (paragraphBreak > start + Math.floor(maxChars * 0.45)) return paragraphBreak + 2;

  const sentenceBreaks = ['. ', '? ', '! ']
    .map((marker) => text.lastIndexOf(marker, hardEnd))
    .filter((index) => index > start + Math.floor(maxChars * 0.45));
  if (sentenceBreaks.length) return Math.max(...sentenceBreaks) + 2;

  const whitespace = text.lastIndexOf(' ', hardEnd);
  if (whitespace > start + Math.floor(maxChars * 0.6)) return whitespace + 1;

  return hardEnd;
}

export function buildSourceChunks(
  artifactId: string,
  body: string,
  maxChars = SOURCE_CHUNK_MAX_CHARS,
  overlapChars = SOURCE_CHUNK_OVERLAP_CHARS,
): SourceChunk[] {
  const text = body || '';
  if (!text.trim()) return [];

  const chunks: SourceChunk[] = [];
  let start = 0;
  while (start < text.length) {
    const end = chooseChunkEnd(text, start, maxChars);
    const raw = text.slice(start, end);
    const leadingTrim = raw.length - raw.trimStart().length;
    const trailingTrim = raw.length - raw.trimEnd().length;
    const textStart = start + leadingTrim;
    const textEnd = Math.max(textStart, end - trailingTrim);
    const chunkText = text.slice(textStart, textEnd);

    if (chunkText) {
      chunks.push({
        id: chunkId(artifactId, chunks.length),
        index: chunks.length,
        text: chunkText,
        startOffset: textStart,
        endOffset: textEnd,
      });
    }

    if (end >= text.length) break;
    const nextStart = Math.max(end - overlapChars, start + 1);
    start = nextStart;
  }

  return chunks;
}

export function chunksForArtifact(artifact: CanvasArtifact): SourceChunk[] {
  return artifact.chunks.length ? artifact.chunks : buildSourceChunks(artifact.id, artifact.body);
}
