import type { CanvasArtifact, CanvasNode, CanvasRecord } from './schemas.js';

export type SourceReadinessStatus = 'ready' | 'needs_context' | 'reference_only';

export type SourceReadiness = {
  nodeId: string;
  artifactId?: string;
  nodeKind: CanvasNode['kind'];
  artifactKind?: CanvasArtifact['kind'];
  status: SourceReadinessStatus;
  label: string;
  detail: string;
  nextAction: string;
  canRunActions: boolean;
  evidence: {
    chars: number;
    usableChars: number;
    chunks: number;
    ingest: string;
    source?: string;
    hasArtifact: boolean;
  };
};

function metadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function sourceForNode(node: CanvasNode, artifact?: CanvasArtifact): string | undefined {
  return artifact?.source
    ?? metadataString(node.metadata, 'source')
    ?? metadataString(node.metadata, 'url')
    ?? metadataString(node.metadata, 'imageUrl')
    ?? metadataString(node.metadata, 'fileName')
    ?? metadataString(artifact?.metadata, 'source')
    ?? metadataString(artifact?.metadata, 'url')
    ?? metadataString(artifact?.metadata, 'imageUrl')
    ?? metadataString(artifact?.metadata, 'fileName');
}

function hasPlaceholderText(text: string): boolean {
  const lower = text.toLowerCase();
  return [
    'readable text was not fetched',
    'transcript was not available',
    'transcript was not fetched',
    'video transcript was not fetched',
    'image reference mapped from',
    'add visual observations',
    'binary media extraction is not enabled',
    'the reference is saved so an agent can attach',
    'the reference is still saved so an agent can annotate',
  ].some((marker) => lower.includes(marker));
}

function usableTextChars(text: string): number {
  const trimmed = text.trim();
  if (!trimmed || hasPlaceholderText(trimmed)) return 0;
  return trimmed.length;
}

function hasActionableText(readiness: Pick<SourceReadiness, 'evidence'>): boolean {
  return readiness.evidence.usableChars >= 40 || readiness.evidence.chunks > 0;
}

function baseReadiness(node: CanvasNode, artifact?: CanvasArtifact): SourceReadiness {
  const body = artifact?.body ?? node.body ?? '';
  const ingest = metadataString(artifact?.metadata, 'ingest')
    ?? metadataString(node.metadata, 'ingest')
    ?? metadataString(node.metadata, 'createdFrom')
    ?? 'node';
  return {
    nodeId: node.id,
    artifactId: artifact?.id,
    nodeKind: node.kind,
    artifactKind: artifact?.kind,
    status: 'ready',
    label: 'Codex-ready',
    detail: 'Readable context is available for actions and handoff.',
    nextAction: 'Run Ask selected, Source summary, or export this source to Codex.',
    canRunActions: true,
    evidence: {
      chars: body.trim().length,
      usableChars: usableTextChars(body),
      chunks: artifact?.chunks.length ?? 0,
      ingest,
      source: sourceForNode(node, artifact),
      hasArtifact: Boolean(artifact),
    },
  };
}

function withStatus(
  readiness: SourceReadiness,
  status: SourceReadinessStatus,
  label: string,
  detail: string,
  nextAction: string,
): SourceReadiness {
  return {
    ...readiness,
    status,
    label,
    detail,
    nextAction,
    canRunActions: status === 'ready' && hasActionableText(readiness),
  };
}

export function describeSourceReadiness(node: CanvasNode, artifact?: CanvasArtifact): SourceReadiness {
  const readiness = baseReadiness(node, artifact);
  const ingest = readiness.evidence.ingest.toLowerCase();
  const hasUsableText = readiness.evidence.usableChars > 0;
  const hasChunks = readiness.evidence.chunks > 0;

  if (node.kind === 'source_youtube') {
    if (hasUsableText) {
      return withStatus(
        readiness,
        'ready',
        'Codex-ready transcript',
        'Transcript or caption text is chunked and ready for cited actions.',
        'Run Ask selected, extract claims, or export this transcript to Codex.',
      );
    }
    return withStatus(
      readiness,
      'reference_only',
      'Reference saved',
      'The YouTube link is mapped, but no transcript text is available yet.',
      'Paste a transcript, timestamp notes, or claims into the node body, save it, then rerun actions.',
    );
  }

  if (node.kind === 'source_video') {
    if (hasUsableText) {
      return withStatus(
        readiness,
        'ready',
        'Codex-ready video notes',
        'Manual transcript, notes, or timestamp context is available for this video reference.',
        'Run Ask selected, extract claims, or connect this video to an output node.',
      );
    }
    return withStatus(
      readiness,
      'reference_only',
      'Video reference saved',
      'The video URL is preserved, but agents need transcript, timestamp notes, or claims to reason over it.',
      'Add transcript text, notes, timestamps, or takeaways to the node body before expecting deep analysis.',
    );
  }

  if (node.kind === 'source_image') {
    if (hasUsableText) {
      return withStatus(
        readiness,
        'ready',
        'Codex-ready visual notes',
        'OCR, alt text, or visual observations are attached and chunked for analysis.',
        'Run Ask selected, extract claims, or export the visual evidence with its notes.',
      );
    }
    return withStatus(
      readiness,
      'needs_context',
      'Needs visual text',
      'The image is visible in the canvas, but agents need OCR, alt text, or observations to reason over it.',
      'Add OCR text, alt text, visual observations, design notes, or claims to the node body.',
    );
  }

  if (node.kind === 'source_url') {
    if (hasUsableText && hasChunks && !ingest.includes('fallback')) {
      return withStatus(
        readiness,
        'ready',
        'Codex-ready web source',
        'Readable URL text is stored as chunks and can ground actions.',
        'Run Source summary, extract claims, compare sources, or export this web evidence.',
      );
    }
    return withStatus(
      readiness,
      'reference_only',
      'URL reference saved',
      'The URL is preserved, but readable page text was not captured yet.',
      'Add notes manually or retry URL ingestion with a reachable public page.',
    );
  }

  if (node.kind === 'source_pdf') {
    if (hasUsableText && hasChunks) {
      return withStatus(
        readiness,
        'ready',
        'Codex-ready PDF',
        'Extracted PDF text is chunked and ready for cited actions.',
        'Run Ask selected, extract claims, or export the PDF evidence to Codex.',
      );
    }
    return withStatus(
      readiness,
      'needs_context',
      'Needs PDF text',
      'The PDF node exists, but no extracted text chunks are available.',
      'Re-upload a readable PDF or paste the relevant excerpt as source text.',
    );
  }

  if (!hasUsableText) {
    return withStatus(
      readiness,
      'needs_context',
      'Needs text',
      'This node has no usable body text for actions or agent handoff yet.',
      'Add notes, transcript text, claims, or a question to the node body.',
    );
  }

  return readiness;
}

export function describeCanvasSourceReadiness(canvas: CanvasRecord): SourceReadiness[] {
  const artifactsById = new Map(canvas.artifacts.map((artifact) => [artifact.id, artifact]));
  return canvas.nodes.map((node) => {
    const artifactId = metadataString(node.metadata, 'artifactId');
    return describeSourceReadiness(node, artifactId ? artifactsById.get(artifactId) : undefined);
  });
}
