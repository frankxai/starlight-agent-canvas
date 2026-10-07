import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { FileCanvasStore, websiteDirectionDemo } from '@starlight-agent-canvas/core';
import { createToolHandlers } from '../tool-handlers.js';
it('lets an agent shape a plan and export a browser-selected checkpoint without a selection tool', async () => {
  const home = await mkdtemp(path.join(os.tmpdir(), 'website-mcp-'));
  try {
    const store = new FileCanvasStore(home); const handlers = createToolHandlers(store);
    const canvas = await store.createCanvas({ title: 'Agent plan', template: 'blank' });
    expect((await handlers.get_website_plan({ canvasId: canvas.id })).structuredContent?.record).toBeNull();
    await handlers.save_website_plan({ canvasId: canvas.id, plan: websiteDirectionDemo() });
    const record = await store.getWebsitePlan(canvas.id);
    expect(Object.keys(handlers)).not.toContain('select_website_direction');
    await expect(handlers.export_website_implementation({ canvasId: canvas.id })).rejects.toThrow('Choose a saved');
    await store.selectWebsiteDirection(canvas.id, 'workshop', record!.planHash);
    expect((await handlers.export_website_implementation({ canvasId: canvas.id })).content[0]!.text).toContain('Read-only proposal');
  } finally { await rm(home, { recursive: true, force: true }); }
});
