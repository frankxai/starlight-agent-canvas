import { describe, expect, it } from 'vitest';
import { createCanvasRecord, listTemplates } from '../templates.js';

describe('workflow templates', () => {
  it('lists workflow metadata for launch cards', () => {
    const templates = listTemplates();
    const teardown = templates.find((template) => template.id === 'competitor_teardown');

    expect(teardown?.steps).toContain('Capture evidence');
    expect(teardown?.steps).toContain('Handoff to Codex');
    expect(teardown?.outcome).toContain('Codex implementation brief');
  });

  it('creates guided workflow canvases with ordered steps', () => {
    const canvas = createCanvasRecord({ title: 'Competitor teardown proof', template: 'competitor_teardown' });
    const workflowSteps = canvas.nodes
      .map((node) => node.metadata.workflowStep)
      .filter((step): step is string => typeof step === 'string');

    expect(canvas.nodes.length).toBeGreaterThanOrEqual(8);
    expect(canvas.edges.length).toBeGreaterThanOrEqual(7);
    expect(workflowSteps).toEqual(expect.arrayContaining([
      'Capture evidence',
      'Normalize capabilities',
      'Compare wedges',
      'Decide build path',
      'Handoff to Codex',
    ]));
    expect(canvas.nodes.some((node) => node.kind === 'mcp_tool' && node.metadata.tool === 'export_canvas')).toBe(true);
  });
});
