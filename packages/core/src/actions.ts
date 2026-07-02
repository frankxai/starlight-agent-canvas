import { actionTypeSchema, runActionInputSchema, type ActionRun, type CanvasArtifact, type CanvasEdge, type CanvasNode, type CanvasRecord, type RunActionInput, type SourceChunk, type SourceCitation } from './schemas.js';
import { chunksForArtifact } from './chunks.js';
import { makeId, nowIso } from './ids.js';

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function splitSentences(text: string): string[] {
  return normalizeWhitespace(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function keywords(value: string): string[] {
  const stop = new Set(['about', 'after', 'again', 'also', 'because', 'could', 'from', 'have', 'into', 'just', 'like', 'more', 'need', 'should', 'that', 'their', 'there', 'this', 'what', 'when', 'where', 'which', 'with', 'would', 'your']);
  return Array.from(new Set(normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stop.has(word))));
}

function selectedNodes(canvas: CanvasRecord, inputNodeIds: string[]): CanvasNode[] {
  if (!inputNodeIds.length) {
    return canvas.nodes.filter((node) => node.kind !== 'output');
  }
  const selected = new Set(inputNodeIds);
  return canvas.nodes.filter((node) => selected.has(node.id));
}

function corpus(nodes: CanvasNode[]): string {
  return nodes
    .map((node) => `${node.title}\n${node.body}`)
    .join('\n\n')
    .trim();
}

function summarize(nodes: CanvasNode[]): string {
  const text = corpus(nodes);
  const sentences = splitSentences(text);
  const top = sentences.slice(0, 5);
  if (!top.length) return 'No source text is available yet.';
  return ['## Summary', '', ...top.map((sentence) => `- ${sentence}`)].join('\n');
}

function extractClaims(nodes: CanvasNode[]): string {
  const claimLike = splitSentences(corpus(nodes)).filter((sentence) =>
    /\b(is|are|can|should|must|will|shows|supports|requires|costs|pricing|feature|workflow|MCP|agent)\b/i.test(sentence)
  );
  const claims = claimLike.slice(0, 12);
  if (!claims.length) return '## Claims\n\n- No claim-like sentences found yet.';
  return ['## Claims', '', ...claims.map((claim) => `- ${claim}`)].join('\n');
}

function compareSources(nodes: CanvasNode[]): string {
  const sourceNodes = nodes.filter((node) => node.kind.startsWith('source_') || node.kind === 'note');
  if (sourceNodes.length < 2) {
    return '## Comparison\n\nAdd at least two source or note nodes to compare.';
  }
  const rows = sourceNodes.slice(0, 8).map((node) => {
    const words = normalizeWhitespace(node.body).split(/\s+/).filter(Boolean);
    const keywords = Array.from(new Set(words.filter((word) => word.length > 5).map((word) => word.toLowerCase()))).slice(0, 5);
    return `| ${node.title} | ${node.kind} | ${keywords.join(', ') || 'n/a'} | ${node.body.slice(0, 120).replace(/\|/g, '/')} |`;
  });
  return [
    '## Source Comparison',
    '',
    '| Source | Kind | Signals | Note |',
    '| --- | --- | --- | --- |',
    ...rows,
  ].join('\n');
}

function decisionMatrix(nodes: CanvasNode[]): string {
  const sourceNodes = nodes.filter((node) => node.kind.startsWith('source_') || node.kind === 'note' || node.kind === 'prompt').slice(0, 6);
  const rows = sourceNodes.map((node, index) => {
    const agentFit = node.body.match(/agent|MCP|workflow|local|open|source/i) ? 5 : 3;
    const creatorFit = node.body.match(/creator|content|script|social|video/i) ? 5 : 3;
    const reuse = node.body.match(/template|export|portable|reusable|workflow/i) ? 5 : 3;
    const risk = node.body.match(/closed|pricing|scrape|posting|billing/i) ? 2 : 4;
    const total = agentFit + creatorFit + reuse + risk;
    return `| ${index + 1} | ${node.title} | ${agentFit} | ${creatorFit} | ${reuse} | ${risk} | ${total}/20 |`;
  });
  return [
    '## Decision Matrix',
    '',
    '| # | Option / Source | Agent Fit | Creator Fit | Reuse | Safety | Total |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: |',
    ...rows,
    '',
    'Recommendation: favor the option that improves agent interoperability, local ownership, and reusable context without adding external mutation risk.',
  ].join('\n');
}

function implementationBrief(nodes: CanvasNode[]): string {
  const titles = nodes.map((node) => node.title).slice(0, 8).join(', ') || 'No selected nodes';
  return [
    '## Implementation Brief',
    '',
    '### Goal',
    'Build the smallest useful agent canvas workflow that turns source context into reusable implementation output.',
    '',
    '### Inputs',
    titles,
    '',
    '### Recommended Build',
    '- Preserve local-first storage and portable exports.',
    '- Keep node schemas typed and MCP-safe.',
    '- Use deterministic local actions first; provider-backed AI remains optional.',
    '- Keep external posting, social scraping, payment, and destructive tools out of v0.1.',
    '',
    '### Acceptance',
    '- User can add sources, run actions, connect outputs, and export JSON/Markdown.',
    '- MCP client can create/read/update canvas state through safe tools.',
    '- Build, typecheck, unit tests, and visual QA pass.',
  ].join('\n');
}

type EvidenceCandidate = {
  node: CanvasNode;
  sentence: string;
  score: number;
  artifact?: CanvasArtifact;
  chunk?: SourceChunk;
  source?: string;
};

type ActionOutputResult = {
  body: string;
  citations: SourceCitation[];
};

function artifactForNode(canvas: CanvasRecord | undefined, node: CanvasNode): CanvasArtifact | undefined {
  const artifactId = typeof node.metadata.artifactId === 'string' ? node.metadata.artifactId : undefined;
  if (!artifactId) return undefined;
  return canvas?.artifacts.find((artifact) => artifact.id === artifactId);
}

function sourceForEvidence(node: CanvasNode, artifact?: CanvasArtifact): string | undefined {
  if (artifact?.source) return artifact.source;
  if (typeof node.metadata.source === 'string') return node.metadata.source;
  if (typeof node.metadata.url === 'string') return node.metadata.url;
  return undefined;
}

function nodeChunks(canvas: CanvasRecord | undefined, node: CanvasNode): Array<{ artifact?: CanvasArtifact; chunk?: SourceChunk; text: string; source?: string }> {
  const artifact = artifactForNode(canvas, node);
  if (artifact) {
    const chunks = chunksForArtifact(artifact);
    return chunks.length
      ? chunks.map((chunk) => ({ artifact, chunk, text: chunk.text, source: artifact.source }))
      : [{ artifact, text: artifact.body, source: artifact.source }];
  }
  return [{
    text: node.body || node.title,
    source: sourceForEvidence(node),
  }];
}

function citationFromCandidate(candidate: EvidenceCandidate, index: number): SourceCitation {
  return {
    id: `C${index + 1}`,
    nodeId: candidate.node.id,
    nodeTitle: candidate.node.title,
    artifactId: candidate.artifact?.id,
    chunkId: candidate.chunk?.id,
    chunkIndex: candidate.chunk?.index,
    source: candidate.source,
    quote: candidate.sentence,
    score: candidate.score,
  };
}

function answerQuestion(nodes: CanvasNode[], prompt: string, canvas?: CanvasRecord): ActionOutputResult {
  const question = prompt.trim() || 'What is the most important answer from this canvas?';
  const terms = keywords(question);
  const evidence = nodes
    .flatMap((node) => nodeChunks(canvas, node).flatMap(({ artifact, chunk, text, source }) =>
      splitSentences(text).slice(0, 24).map((sentence) => {
        const lower = sentence.toLowerCase();
        const title = `${node.title} ${artifact?.title ?? ''}`.toLowerCase();
        const score = terms.reduce((total, term) => total + (lower.includes(term) ? 1 : 0) + (title.includes(term) ? 0.35 : 0), 0)
          + (node.kind.startsWith('source_') ? 0.4 : 0)
          + (artifact ? 0.4 : 0)
          + (node.kind === 'output' ? 0.2 : 0);
        return { node, sentence, score, artifact, chunk, source } satisfies EvidenceCandidate;
      })
    ))
    .sort((a, b) => b.score - a.score || a.sentence.length - b.sentence.length)
    .slice(0, 8);

  const useful = evidence.filter((item) => item.score > 0).slice(0, 6);
  const fallback = evidence.slice(0, 4);
  const chosen = useful.length ? useful : fallback;
  if (!chosen.length) {
    return {
      citations: [],
      body: [
        '## Source-grounded Answer',
        '',
        `Question: ${question}`,
        '',
        'No source text is available yet. Drop a URL, YouTube link, PDF, transcript, or note onto the canvas first.',
      ].join('\n'),
    };
  }

  const citations = chosen.map(citationFromCandidate);
  const sourceLines = citations.map((citation) => {
    const chunk = citation.chunkId ? `; chunk \`${citation.chunkId}\`` : '';
    return `- [${citation.id}] ${citation.quote} (${citation.nodeTitle}; node \`${citation.nodeId}\`${chunk})`;
  });
  const citationLines = citations.map((citation) => {
    const source = citation.source ? `; source: ${citation.source}` : '';
    const artifact = citation.artifactId ? `; artifact: \`${citation.artifactId}\`` : '';
    const chunk = citation.chunkId ? `; chunk: \`${citation.chunkId}\`` : '';
    return `- [${citation.id}] node: \`${citation.nodeId}\`${artifact}${chunk}${source}`;
  });
  return {
    citations,
    body: [
      '## Source-grounded Answer',
      '',
      `Question: ${question}`,
      '',
      '### Best answer',
      `${citations[0].quote} [${citations[0].id}]`,
      '',
      '### Evidence',
      ...sourceLines,
      '',
      '### Citations',
      ...citationLines,
      '',
      '### Next move',
      'Run extract claims or decision matrix on the same selected nodes when you need a more structured pass.',
    ].join('\n'),
  };
}

function buildActionResult(action: RunActionInput['action'], nodes: CanvasNode[], prompt = '', canvas?: CanvasRecord): ActionOutputResult {
  switch (actionTypeSchema.parse(action)) {
    case 'summarize':
      return { body: summarize(nodes), citations: [] };
    case 'extract_claims':
      return { body: extractClaims(nodes), citations: [] };
    case 'compare_sources':
      return { body: compareSources(nodes), citations: [] };
    case 'decision_matrix':
      return { body: decisionMatrix(nodes), citations: [] };
    case 'implementation_brief':
      return { body: implementationBrief(nodes), citations: [] };
    case 'answer_question':
      return answerQuestion(nodes, prompt, canvas);
  }
}

export function buildActionOutput(action: RunActionInput['action'], nodes: CanvasNode[], prompt = ''): string {
  return buildActionResult(action, nodes, prompt).body;
}

export function runCanvasAction(canvas: CanvasRecord, rawInput: RunActionInput): { canvas: CanvasRecord; run: ActionRun; outputNode: CanvasNode } {
  const input = runActionInputSchema.parse(rawInput);
  const createdAt = nowIso();
  const nodes = selectedNodes(canvas, input.inputNodeIds);
  const output = buildActionResult(input.action, nodes, input.prompt, canvas);
  const outputNode: CanvasNode = {
    id: makeId('node', `${input.action}-output`),
    kind: 'output',
    title: `${input.action.replace(/_/g, ' ')} output`,
    body: output.body,
    position: {
      x: 720,
      y: 120 + canvas.runs.length * 180,
    },
    metadata: {
      action: input.action,
      inputNodeIds: input.inputNodeIds,
      prompt: input.prompt || undefined,
      citations: output.citations,
    },
    createdAt,
    updatedAt: createdAt,
  };
  const run: ActionRun = {
    id: makeId('run', input.action),
    action: input.action,
    inputNodeIds: input.inputNodeIds,
    outputNodeId: outputNode.id,
    summary: `Created ${outputNode.title} from ${nodes.length} node(s).`,
    status: 'completed',
    createdAt,
    metadata: {
      prompt: input.prompt || undefined,
      citations: output.citations,
    },
  };
  const inputEdges: CanvasEdge[] = nodes.slice(0, 12).map((node) => ({
    id: makeId('edge', `${node.id}-${outputNode.id}`),
    source: node.id,
    target: outputNode.id,
    kind: 'derives_from',
    createdAt,
  }));

  return {
    canvas: {
      ...canvas,
      updatedAt: createdAt,
      nodes: [...canvas.nodes, outputNode],
      edges: [...canvas.edges, ...inputEdges],
      runs: [...canvas.runs, run],
    },
    run,
    outputNode,
  };
}
