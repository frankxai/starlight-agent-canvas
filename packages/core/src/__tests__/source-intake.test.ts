import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapSourceIntakeToCanvas } from '../source-intake.js';
import { FileCanvasStore } from '../store.js';
import type { CanvasRecord } from '../schemas.js';

describe('source intake transactions', () => {
  it('maps pasted video context, runs an action, and persists a durable trace', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'agent-canvas-intake-'));
    const store = new FileCanvasStore(home);
    const canvas = await store.createCanvas({ title: 'Trace canvas', template: 'blank' });

    const result = await mapSourceIntakeToCanvas(
      store,
      canvas.id,
      'https://vimeo.com/123456789\nNotes: this walkthrough shows how a human drops source context and exports it to Codex.',
      {
        origin: 'web_drop',
        sourceLabel: 'Dropped onto canvas',
        position: { x: 200, y: 240 },
        action: 'summarize',
      },
    );

    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].kind).toBe('source_video');
    expect(result.outputNode?.kind).toBe('output');
    expect(result.trace.status).toBe('mapped_with_action');
    expect(result.trace.nodeIds).toEqual([result.nodes[0].id]);
    expect(result.trace.outputNodeId).toBe(result.outputNode?.id);
    expect(result.trace.items[0]).toMatchObject({
      kind: 'video',
      readinessStatus: 'ready',
      readinessLabel: 'Codex-ready video notes',
    });

    const saved = await store.getCanvas(canvas.id);
    expect(saved.intakeTraces[0].id).toBe(result.trace.id);
    expect(saved.intakeTraces[0].sourceLabel).toBe('Dropped onto canvas');
  });

  it('scopes portable exports without leaking unrelated intake traces', async () => {
    const home = await mkdtemp(path.join(os.tmpdir(), 'agent-canvas-intake-scope-'));
    const store = new FileCanvasStore(home);
    const canvas = await store.createCanvas({ title: 'Scoped traces', template: 'blank' });

    const first = await mapSourceIntakeToCanvas(store, canvas.id, 'First research note for selected export.', {
      origin: 'web_composer',
      sourceLabel: 'Composer intake',
    });
    await mapSourceIntakeToCanvas(store, canvas.id, 'Second unrelated private note that must stay out.', {
      origin: 'web_composer',
      sourceLabel: 'Composer intake',
    });

    const exported = JSON.parse(await store.exportCanvas(canvas.id, 'json', { nodeIds: [first.nodes[0].id] })) as CanvasRecord;
    expect(exported.nodes).toHaveLength(1);
    expect(exported.intakeTraces).toHaveLength(1);
    expect(exported.intakeTraces[0].nodeIds).toEqual([first.nodes[0].id]);
    expect(JSON.stringify(exported.intakeTraces)).toContain('First research note');
    expect(JSON.stringify(exported.intakeTraces)).not.toContain('Second unrelated private note');
  });
});
