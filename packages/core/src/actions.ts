import { actionTypeSchema, runActionInputSchema, type ActionRun, type CanvasEdge, type CanvasNode, type CanvasRecord, type RunActionInput } from './schemas.js';
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

export function buildActionOutput(action: RunActionInput['action'], nodes: CanvasNode[]): string {
  switch (actionTypeSchema.parse(action)) {
    case 'summarize':
      return summarize(nodes);
    case 'extract_claims':
      return extractClaims(nodes);
    case 'compare_sources':
      return compareSources(nodes);
    case 'decision_matrix':
      return decisionMatrix(nodes);
    case 'implementation_brief':
      return implementationBrief(nodes);
  }
}

export function runCanvasAction(canvas: CanvasRecord, rawInput: RunActionInput): { canvas: CanvasRecord; run: ActionRun; outputNode: CanvasNode } {
  const input = runActionInputSchema.parse(rawInput);
  const createdAt = nowIso();
  const nodes = selectedNodes(canvas, input.inputNodeIds);
  const output = buildActionOutput(input.action, nodes);
  const outputNode: CanvasNode = {
    id: makeId('node', `${input.action}-output`),
    kind: 'output',
    title: `${input.action.replace(/_/g, ' ')} output`,
    body: output,
    position: {
      x: 720,
      y: 120 + canvas.runs.length * 180,
    },
    metadata: {
      action: input.action,
      inputNodeIds: input.inputNodeIds,
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
    metadata: {},
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
