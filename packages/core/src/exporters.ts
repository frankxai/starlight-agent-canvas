import type { CanvasRecord } from './schemas.js';

function tableCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\|/g, '/')
    .replace(/\r?\n/g, ' ')
    .trim();
}

function sourceOf(node: CanvasRecord['nodes'][number]): string {
  if (typeof node.metadata.url === 'string') return node.metadata.url;
  if (typeof node.metadata.source === 'string') return node.metadata.source;
  return '';
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}\n\n[Truncated at ${maxChars} characters for agent context export.]`;
}

export function exportCanvasAsMarkdown(canvas: CanvasRecord): string {
  const lines: string[] = [
    `# ${canvas.title}`,
    '',
    canvas.description,
    '',
    `- Canvas ID: \`${canvas.id}\``,
    `- Updated: ${canvas.updatedAt}`,
    `- Nodes: ${canvas.nodes.length}`,
    `- Edges: ${canvas.edges.length}`,
    `- Runs: ${canvas.runs.length}`,
    '',
    '## Nodes',
    '',
  ];

  for (const node of canvas.nodes) {
    lines.push(`### ${node.title}`);
    lines.push('');
    lines.push(`- Kind: \`${node.kind}\``);
    if (node.metadata.url) lines.push(`- URL: ${String(node.metadata.url)}`);
    if (node.metadata.source) lines.push(`- Source: ${String(node.metadata.source)}`);
    lines.push('');
    lines.push(node.body || '_No body text._');
    lines.push('');
  }

  if (canvas.edges.length) {
    lines.push('## Edges', '');
    for (const edge of canvas.edges) {
      lines.push(`- \`${edge.source}\` --${edge.kind}--> \`${edge.target}\``);
    }
    lines.push('');
  }

  if (canvas.runs.length) {
    lines.push('## Action Runs', '');
    for (const run of canvas.runs) {
      lines.push(`- ${run.createdAt}: \`${run.action}\` (${run.status}) - ${run.summary}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

export function exportCanvasAsAgentContext(canvas: CanvasRecord): string {
  const lines: string[] = [
    `# Agent Context Packet: ${canvas.title}`,
    '',
    canvas.description || 'No canvas description provided.',
    '',
    'Use this packet as the active local research/workflow context. Prefer node ids and node titles when citing evidence back to the human.',
    '',
    '## Operating Contract',
    '',
    '- Treat sources, notes, prompts, runs, and outputs as inspectable canvas state.',
    '- If MCP is available, read the live canvas before mutating it and write durable findings back as nodes.',
    '- Use `ingest_text_source`, `ingest_url`, or `ingest_youtube` for new evidence instead of keeping important context only in chat.',
    '- Use `run_node_action` for deterministic local summaries, claims, comparisons, matrices, build briefs, and source-grounded answers.',
    '- Do not post externally, spend money, mutate accounts, expose secrets, or assume destructive tools exist.',
    '',
    '## Canvas Metadata',
    '',
    `- Canvas ID: \`${canvas.id}\``,
    `- Updated: ${canvas.updatedAt}`,
    `- Nodes: ${canvas.nodes.length}`,
    `- Edges: ${canvas.edges.length}`,
    `- Runs: ${canvas.runs.length}`,
    `- Artifacts: ${canvas.artifacts.length}`,
    '',
    '## Node Index',
    '',
    '| Node ID | Kind | Title | Source |',
    '| --- | --- | --- | --- |',
  ];

  for (const node of canvas.nodes) {
    lines.push(`| \`${tableCell(node.id)}\` | \`${tableCell(node.kind)}\` | ${tableCell(node.title)} | ${tableCell(sourceOf(node)) || 'n/a'} |`);
  }

  if (canvas.edges.length) {
    lines.push('', '## Edge Map', '');
    for (const edge of canvas.edges) {
      lines.push(`- \`${edge.source}\` --${edge.kind}--> \`${edge.target}\``);
    }
  }

  lines.push('', '## Evidence Corpus', '');
  for (const node of canvas.nodes) {
    lines.push(`### ${node.title}`);
    lines.push('');
    lines.push(`- Node ID: \`${node.id}\``);
    lines.push(`- Kind: \`${node.kind}\``);
    const source = sourceOf(node);
    if (source) lines.push(`- Source: ${source}`);
    lines.push('');
    lines.push(truncate(node.body || '_No body text._', 4000));
    lines.push('');
  }

  if (canvas.runs.length) {
    lines.push('## Recent Action Runs', '');
    for (const run of canvas.runs.slice(-10)) {
      lines.push(`- ${run.createdAt}: \`${run.action}\` (${run.status}) -> ${run.summary}`);
    }
    lines.push('');
  }

  lines.push(
    '## Continuation Prompt',
    '',
    'Continue from this Starlight Agent Canvas context. Identify the next highest-leverage action, cite the node ids you used, and write durable updates back to the canvas through MCP when available.',
  );

  return lines.join('\n').trimEnd() + '\n';
}
