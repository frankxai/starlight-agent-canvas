import type { CanvasRecord } from './schemas.js';

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
