import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('workspace maps sources and answers from the canvas', async ({ page }, testInfo) => {
  const title = `e2e ${testInfo.project.name} ${Date.now()}`;
  await page.request.post('/api/canvases', {
    data: { title, template: 'blank' },
  });

  await page.goto('/');
  await expect(page.getByTestId('workspace')).toBeVisible();
  await expect(page.getByText('Starlight Agent Canvas')).toBeVisible();
  const setupStatus = await page.request.get('/api/setup/status');
  await expect(setupStatus).toBeOK();
  const setupJson = await setupStatus.json() as { canvasHome: string; mcp: { smokeCommand: string }; codex: { installWriteCommand: string } };
  expect(setupJson.canvasHome).toBeTruthy();
  expect(setupJson.mcp.smokeCommand).toBe('pnpm mcp:smoke');
  expect(setupJson.codex.installWriteCommand).toBe('pnpm mcp:install:codex -- --write');
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await expect(page.getByTestId('intake-text')).toBeVisible();
  await expect(page.getByTestId('empty-canvas-actions')).toBeVisible();
  await expect(page.getByTestId('selected-context')).toContainText('Whole canvas context');
  await expect(page.getByTestId('setup-panel')).toContainText('Setup / MCP');
  await expect(page.getByTestId('setup-panel')).toContainText('Codex server');
  await expect(page.getByTestId('intake-ingest')).toContainText('Map + Brief');
  await expect(page.getByTestId('context-loop')).toContainText('Drop');
  await expect(page.getByTestId('context-loop')).toContainText('Map');
  await expect(page.getByTestId('context-loop')).toContainText('Ask');
  await expect(page.getByTestId('context-loop')).toContainText('Handoff');
  await expect(page.getByTestId('composer-mode')).toContainText('Source');
  await expect(page.getByTestId('composer-mode')).toContainText('Note');
  await expect(page.getByTestId('composer-mode')).toContainText('Ask');
  await expect(page.getByTestId('canvas-quick-start')).toContainText('Video');
  await expect(page.getByTestId('canvas-quick-start')).toContainText('Web');
  await expect(page.getByTestId('canvas-quick-start')).toContainText('Note');
  await expect(page.getByTestId('canvas-quick-start')).toContainText('Ask');
  await page.getByTestId('canvas-quick-start').getByRole('button', { name: /Video/ }).click();
  await expect(page.getByTestId('status')).toContainText('Ready for a video link');
  await page.getByTestId('intake-text').fill('https://example.com/demo.mp4\nManual video notes about workflow intake.');
  await expect(page.getByTestId('intake-preview')).toContainText('Video link');
  await page.getByTestId('intake-preview').getByRole('button', { name: 'Map only' }).click();
  await page.getByTestId('intake-ingest').click();
  await expect(page.getByTestId('status')).toContainText('Mapped 2 item(s): Video link, Source notes.');
  {
    const exportHref = await page.getByLabel('Export JSON').getAttribute('href');
    expect(exportHref).toBeTruthy();
    const exportResponse = await page.request.get(exportHref!);
    await expect(exportResponse).toBeOK();
    expect(await exportResponse.text()).toContain('video_reference');
  }
  await page.getByTestId('intake-preview').getByRole('button', { name: 'Brief' }).click();
  await page.getByTestId('intake-text').fill('');
  await page.getByTestId('composer-mode').getByRole('button', { name: 'Note' }).click();
  await expect(page.getByTestId('intake-ingest')).toContainText('Add Note');
  await page.getByTestId('composer-mode').getByRole('button', { name: 'Ask' }).click();
  await expect(page.getByTestId('intake-ingest')).toContainText('Ask Canvas');
  await page.getByTestId('composer-mode').getByRole('button', { name: 'Source' }).click();
  await expect(page.getByTestId('intake-ingest')).toContainText('Map + Brief');

  await page.getByTestId('intake-text').fill('My canvas note: collect the product gaps and turn them into a brief.');
  await expect(page.getByTestId('quick-note')).toBeEnabled();
  await page.getByTestId('quick-note').click();
  await expect(page.getByTestId('inspector-title')).toBeVisible();
  await expect(page.getByTestId('inspector-title')).toHaveValue('My canvas note: collect the product gaps and turn them into a brief.');
  if (testInfo.project.name === 'desktop') {
    await expect(page.getByTestId('canvas-drop-affordance')).toBeVisible();
  }
  await expect(page.getByTestId('save-node')).toBeEnabled();
  await page.getByTestId('inspector-title').fill('Edited canvas note');
  await page.getByTestId('inspector-body').fill('Edited note body with product gaps, source needs, and next actions.');
  await page.getByTestId('save-node').click();
  await expect(page.getByTestId('save-node')).toBeEnabled();

  await page.getByTestId('intake-text').fill('Nodeflow connects YouTube, PDFs, websites, and transcripts into visual AI workflows.');
  await expect(page.getByTestId('intake-ingest')).toBeEnabled();
  await page.getByTestId('intake-ingest').click();
  await expect(page.getByTestId('inspector-title')).toHaveValue('summarize output');
  await expect(page.getByTestId('inspector-body')).toHaveValue(/Nodeflow connects YouTube/);
  await expect(page.getByTestId('status')).toContainText('Ran summarize on 1 new item');
  await expect(page.getByTestId('intake-ingest')).toBeDisabled();
  await expect(page.getByTestId('quick-note')).toBeEnabled();
  await page.getByTestId('intake-preview').getByRole('button', { name: 'Map only' }).click();
  await expect(page.getByTestId('intake-ingest')).toContainText('Map');

  await page.getByTestId('intake-text').fill('https://example.com/research\nExample source notes about workflow mapping and source context.');
  await expect(page.getByTestId('intake-preview')).toContainText('Web source');
  await expect(page.getByTestId('intake-preview')).toContainText('Source notes');
  await page.getByTestId('intake-ingest').click();
  await expect(page.getByTestId('status')).toContainText('Mapped 2 item(s): Web source, Source notes.');

  await page.getByTestId('intake-text').fill('https://youtu.be/abcdefghijk\nManual transcript: this video explains canvas intake, context extraction, and cited synthesis.');
  await expect(page.getByTestId('intake-preview')).toContainText('Video source');
  await expect(page.getByTestId('intake-preview')).toContainText('manual transcript attached');
  await expect(page.getByTestId('intake-preview')).not.toContainText('Source notes');
  await page.getByTestId('intake-ingest').click();
  await expect(page.getByTestId('inspector-body')).toHaveValue(/Manual transcript/);
  await expect(page.getByTestId('source-receipt')).toContainText('Context receipt');
  await expect(page.getByTestId('source-receipt-kind')).toContainText('youtube');
  await expect(page.getByTestId('source-receipt-ingest')).toContainText('manual transcript');
  await expect(page.getByTestId('source-chunk-preview')).toContainText('Manual transcript');
  await expect(page.getByTestId('selected-source-copy')).toBeEnabled();
  await page.getByTestId('selected-source-ask').click();
  await expect(page.getByTestId('inspector-title')).toHaveValue('answer question output');
  await expect(page.getByTestId('inspector')).toContainText('Citations');
  await expect(page.getByTestId('quick-note')).toBeEnabled();

  const markdownPath = testInfo.outputPath(`uploaded-${testInfo.project.name}.md`);
  await writeFile(markdownPath, '# Uploaded markdown source\n\nUploaded markdown source with context chunks for agent synthesis.', 'utf8');
  await page.getByTestId('composer-upload-source').setInputFiles(markdownPath);
  await expect(page.getByTestId('inspector-body')).toHaveValue(/Uploaded markdown source/);
  await expect(page.getByTestId('quick-note')).toBeEnabled();

  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Pasted anywhere source: creators paste video notes directly onto the canvas for synthesis.');
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await expect(page.getByTestId('inspector-body')).toHaveValue(/Pasted anywhere source/);
  await expect(page.getByTestId('quick-note')).toBeEnabled();

  const surfaceBox = await page.getByTestId('canvas-surface').boundingBox();
  expect(surfaceBox).toBeTruthy();
  const dropTransfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Dropped source context: this canvas accepts dropped notes and turns them into selectable agent context.');
    return data;
  });
  await page.getByTestId('canvas-surface').dispatchEvent('dragover', {
    clientX: Math.round((surfaceBox?.x ?? 0) + 160),
    clientY: Math.round((surfaceBox?.y ?? 0) + 220),
    dataTransfer: dropTransfer,
  });
  await expect(page.getByText('Drop to map onto this canvas')).toBeVisible();
  await page.getByTestId('canvas-surface').dispatchEvent('drop', {
    clientX: Math.round((surfaceBox?.x ?? 0) + 160),
    clientY: Math.round((surfaceBox?.y ?? 0) + 220),
    dataTransfer: dropTransfer,
  });
  await expect(page.getByTestId('inspector-body')).toHaveValue(/Dropped source context/);
  await expect(page.getByTestId('source-receipt')).toContainText('Context receipt');
  await expect(page.getByTestId('source-receipt-chunks')).not.toContainText('0');

  await page.getByRole('button', { name: 'Summarize' }).click();
  await expect(page.getByTestId('inspector-title')).toHaveValue('summarize output');

  await page.getByTestId('ask-prompt').fill('What source types are supported?');
  await page.getByTestId('ask-canvas').click();
  await expect(page.getByTestId('inspector-title')).toHaveValue('answer question output');
  await expect(page.getByTestId('inspector')).toContainText('Citations');
  await expect(page.getByTestId('copy-context')).toBeEnabled();

  await page.getByPlaceholder('Search canvases').fill('Nodeflow');
  await page.getByRole('button', { name: 'Go' }).click();
  await expect(page.getByRole('button', { name: /Nodeflow connects YouTube/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /Nodeflow connects YouTube/ }).first().click();
  await expect(page.getByTestId('inspector-body')).toHaveValue(/Nodeflow connects YouTube/);
  await expect(page.getByTestId('selected-context')).toContainText('1 node context');

  const exportHref = await page.getByLabel('Export JSON').getAttribute('href');
  expect(exportHref).toBeTruthy();
  const exportResponse = await page.request.get(exportHref!);
  await expect(exportResponse).toBeOK();
  expect(exportResponse.headers()['content-type']).toContain('application/json');
  const exportedCanvas = await exportResponse.json() as {
    id: string;
    title: string;
    nodes: Array<{ kind: string; body: string; metadata: Record<string, unknown> }>;
    artifacts: Array<{ kind: string; body: string; chunks?: unknown[]; metadata: Record<string, unknown> }>;
  };
  expect(JSON.stringify(exportedCanvas)).toContain('Edited canvas note');
  expect(exportedCanvas.nodes.some((node) => node.kind === 'source_url')).toBe(true);
  expect(exportedCanvas.nodes.some((node) => node.kind === 'source_youtube' && node.body.includes('Manual transcript'))).toBe(true);
  expect(exportedCanvas.nodes.some((node) => node.metadata.artifactId)).toBe(true);
  expect(exportedCanvas.artifacts.some((artifact) => artifact.kind === 'url' && Array.isArray(artifact.chunks) && artifact.chunks.length > 0)).toBe(true);
  expect(exportedCanvas.artifacts.some((artifact) => artifact.kind === 'youtube' && artifact.body.includes('Manual transcript'))).toBe(true);
  expect(exportedCanvas.artifacts.some((artifact) => artifact.kind === 'markdown' && artifact.body.includes('Uploaded markdown source'))).toBe(true);

  const contextResponse = await page.request.get(exportHref!.replace('format=json', 'format=context'));
  await expect(contextResponse).toBeOK();
  expect(contextResponse.headers()['content-type']).toContain('text/markdown');
  expect(await contextResponse.text()).toContain('Agent Context Packet');

  const importTitle = `imported ${testInfo.project.name} ${Date.now()}`;
  exportedCanvas.id = `canvas-${importTitle.replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase()}`;
  exportedCanvas.title = importTitle;
  const importPath = testInfo.outputPath(`${importTitle.replace(/\s+/g, '-')}.json`);
  await writeFile(importPath, JSON.stringify(exportedCanvas, null, 2), 'utf8');

  await page.getByTestId('import-canvas-file').setInputFiles(importPath);
  await expect(page.getByRole('button', { name: new RegExp(importTitle) })).toBeVisible();
  await expect.poll(async () => {
    return await page.getByLabel('Export JSON').getAttribute('href') ?? '';
  }).toContain(exportedCanvas.id);
});

test('imports the public demo canvas and exports chunked context', async ({ page }, testInfo) => {
  const raw = await readFile(new URL('../../../examples/demo-canvas.json', import.meta.url), 'utf8');
  const demoCanvas = JSON.parse(raw) as { id: string; title: string };
  const importTitle = `public demo ${testInfo.project.name} ${Date.now()}`;
  demoCanvas.id = `canvas-${importTitle.replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase()}`;
  demoCanvas.title = importTitle;
  const importPath = testInfo.outputPath(`${importTitle.replace(/\s+/g, '-')}.json`);
  await writeFile(importPath, JSON.stringify(demoCanvas, null, 2), 'utf8');

  await page.goto('/');
  await expect(page.getByTestId('workspace')).toBeVisible();
  await page.getByTestId('import-canvas-file').setInputFiles(importPath);
  await expect(page.getByRole('button', { name: new RegExp(importTitle) })).toBeVisible();
  await page.getByRole('button', { name: new RegExp(importTitle) }).click();
  await expect.poll(async () => {
    return await page.getByLabel('Export JSON').getAttribute('href') ?? '';
  }).toContain(demoCanvas.id);
  await expect(page.getByTestId('canvas-live-state')).toContainText('5 nodes');
  await expect(page.getByTestId('canvas-live-state')).toContainText('3 artifacts');
  await expect(page.getByTestId('canvas-live-state')).toContainText('2 runs');

  await page.getByPlaceholder('Search canvases').fill('Nodeflow-style video source');
  await page.getByRole('button', { name: 'Go' }).click();
  await expect(page.getByRole('button', { name: /Nodeflow-style video source/ }).first()).toBeVisible();
  await page.getByRole('button', { name: /Nodeflow-style video source/ }).first().click();
  await expect(page.getByTestId('source-receipt-kind')).toContainText('youtube');
  await expect(page.getByTestId('source-receipt-ingest')).toContainText('manual transcript');
  await expect(page.getByTestId('source-chunk-preview')).toContainText('artifact-youtube-nodeflow:chunk-001');

  const exportHref = await page.getByLabel('Export JSON').getAttribute('href');
  expect(exportHref).toContain(demoCanvas.id);
  const contextResponse = await page.request.get(exportHref!.replace('format=json', 'format=context'));
  await expect(contextResponse).toBeOK();
  const contextText = await contextResponse.text();
  expect(contextText).toContain('Agent Context Packet');
  expect(contextText).toContain('Source Chunk Manifest');
  expect(contextText).toContain('artifact-youtube-nodeflow:chunk-001');
  expect(contextText).toContain('Codex context handoff');
});
