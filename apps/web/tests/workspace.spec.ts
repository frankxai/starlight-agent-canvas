import { readFile, writeFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('workspace maps sources and answers from the canvas', async ({ page }, testInfo) => {
  test.setTimeout(90_000);

  const title = `e2e ${testInfo.project.name} ${Date.now()}`;
  const createdResponse = await page.request.post('/api/canvases', {
    data: { title, template: 'blank' },
  });
  await expect(createdResponse).toBeOK();
  const created = await createdResponse.json() as { canvas: { id: string } };

  await page.goto('/');
  await expect(page.getByTestId('workspace')).toBeVisible();
  await expect(page.getByText('Starlight Agent Canvas')).toBeVisible();
  const setupStatus = await page.request.get('/api/setup/status');
  await expect(setupStatus).toBeOK();
  const setupJson = await setupStatus.json() as {
    canvasHome: string;
    mcp: { smokeCommand: string };
    codex: { installWriteCommand: string; smokeCommand: string };
    adoption: { reportCommand: string; jsonCommand: string };
    firstSuccess: {
      schemaVersion: string;
      contractCommand: string;
      jsonCommand: string;
      proofCommands: string[];
      phases: Array<{ id: string; label: string; detail: string }>;
      inputContracts: Array<{ id: string; input: string; output: string; nodeKind: string; outputLabel: string }>;
    };
    agent: { prompt: string; terminalHandoffCommand: string; tools: Array<{ name: string; detail: string }> };
    activation: { firstRunCheckCommand: string; codexPrompt: string; steps: Array<{ id: string; label: string }> };
  };
  expect(setupJson.canvasHome).toBeTruthy();
  expect(setupJson.mcp.smokeCommand).toBe('pnpm mcp:smoke');
  expect(setupJson.codex.installWriteCommand).toBe('pnpm mcp:install:codex -- --write');
  expect(setupJson.codex.smokeCommand).toBe('pnpm mcp:codex:smoke');
  expect(setupJson.adoption.reportCommand).toBe('pnpm adoption:report');
  expect(setupJson.adoption.jsonCommand).toBe('pnpm adoption:report:json');
  expect(setupJson.firstSuccess.contractCommand).toBe('pnpm first-success');
  expect(setupJson.firstSuccess.jsonCommand).toBe('pnpm first-success:json');
  expect(setupJson.firstSuccess.proofCommands).toContain('pnpm first-run:check');
  expect(setupJson.firstSuccess.proofCommands).toContain('pnpm mcp:codex:smoke');
  expect(setupJson.firstSuccess.schemaVersion).toBe('starlight.agentCanvas.firstSuccess.v1');
  expect(setupJson.firstSuccess.phases.map((phase) => phase.id)).toEqual(['install', 'open', 'capture', 'inspect', 'handoff', 'codex']);
  expect(setupJson.firstSuccess.inputContracts.map((contract) => contract.id)).toEqual(['youtube', 'video', 'image', 'web', 'pdf', 'text', 'note']);
  expect(setupJson.firstSuccess.inputContracts.find((contract) => contract.id === 'youtube')?.nodeKind).toBe('source_youtube');
  expect(setupJson.firstSuccess.inputContracts.find((contract) => contract.id === 'video')?.output).toContain('source_video');
  expect(setupJson.agent.prompt).toContain('get_latest_canvas');
  expect(setupJson.agent.terminalHandoffCommand).toContain('format codex');
  expect(setupJson.agent.tools.map((tool) => tool.name)).toEqual(['get_latest_canvas', 'ingest_anything', 'enrich_source_node', 'run_node_action', 'export_canvas']);
  expect(setupJson.activation.firstRunCheckCommand).toBe('pnpm first-run:check');
  expect(setupJson.activation.codexPrompt).toContain('Use starlight-agent-canvas');
  expect(setupJson.activation.steps.map((step) => step.id)).toEqual(['install', 'proof', 'context', 'handoff', 'codex']);
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await expect(page.getByTestId('intake-text')).toBeVisible();
  if (testInfo.project.name === 'mobile') {
    await expect(page.getByTestId('empty-canvas-actions')).toBeHidden();
    await expect(page.getByTestId('mobile-first-source-actions')).toBeVisible();
    await expect(page.getByTestId('mobile-first-source-actions')).toContainText('Add your first context');
    await expect(page.getByTestId('mobile-first-source-paste')).toBeEnabled();
    await expect(page.getByTestId('mobile-first-source-note')).toBeEnabled();
  } else {
    await expect(page.getByTestId('empty-canvas-actions')).toBeVisible();
    await expect(page.getByTestId('empty-canvas-actions')).toContainText('Paste, drop, or upload context here');
    await expect(page.getByTestId('canvas-intake-contract')).toContainText('Video');
    await expect(page.getByTestId('canvas-intake-contract')).toContainText('File');
    await expect(page.getByTestId('empty-intake-text')).toBeVisible();
  }
  await expect(page.getByTestId('selected-context')).toContainText('Whole canvas context');
  await expect(page.getByTestId('live-intake-heading')).toContainText('Paste / Drop Anything');
  await expect(page.getByTestId('live-intake-helper')).toContainText('Codex-readable context');
  await expect(page.getByTestId('input-contract-strip')).toContainText('YouTube');
  await expect(page.getByTestId('input-contract-strip')).toContainText('Any video');
  await expect(page.getByTestId('input-contract-strip')).toContainText('Preview node');
  await expect(page.getByTestId('input-contract-pdf')).toContainText('Extracted text');
  await expect(page.getByTestId('codex-export-preview')).toContainText('Codex export preview');
  await expect(page.getByTestId('codex-export-mode')).toContainText('canvas');
  await expect(page.getByTestId('codex-export-rules')).toContainText('Whole canvas exports all nodes');
  await expect(page.getByTestId('operator-loop')).toContainText('Capture');
  await expect(page.getByTestId('operator-loop')).toContainText('Map');
  await expect(page.getByTestId('operator-loop')).toContainText('Inspect');
  await expect(page.getByTestId('operator-loop')).toContainText('Ask');
  await expect(page.getByTestId('operator-loop')).toContainText('Handoff');
  await expect(page.getByTestId('shared-context-contract')).toContainText('Shared context contract');
  await expect(page.getByTestId('shared-context-contract')).toContainText('You populate');
  await expect(page.getByTestId('shared-context-contract')).toContainText('Canvas maps');
  await expect(page.getByTestId('shared-context-contract')).toContainText('Codex reads/writes');
  await expect(page.getByTestId('shared-context-contract')).toContainText('Handoff stays scoped');
  await expect(page.getByTestId('shared-context-contract')).toContainText('paste/drop/note');
  await expect(page.getByTestId('shared-context-contract')).toContainText('MCP tools');
  await expect(page.getByTestId('shared-context-add')).toBeEnabled();
  await expect(page.getByTestId('shared-context-ask')).toBeDisabled();
  await expect(page.getByTestId('shared-context-codex')).toBeEnabled();
  await expect(page.getByTestId('operator-loop-capture')).toContainText('empty');
  await expect(page.getByTestId('operator-loop-map')).toContainText('no source');
  await expect(page.getByTestId('setup-panel')).toContainText('Setup / MCP');
  await expect(page.getByTestId('setup-panel')).toContainText('Codex server');
  await expect(page.getByTestId('setup-panel')).toContainText('Codex proof');
  await expect(page.getByTestId('setup-codex-handoff')).toBeEnabled();
  await expect(page.getByTestId('agent-toolbelt')).toContainText('Agent toolbelt');
  await expect(page.getByTestId('agent-tool-get_latest_canvas')).toContainText('get_latest_canvas');
  await expect(page.getByTestId('agent-tool-ingest_anything')).toContainText('ingest_anything');
  await expect(page.getByTestId('agent-tool-enrich_source_node')).toContainText('enrich_source_node');
  await expect(page.getByTestId('agent-tool-run_node_action')).toContainText('run_node_action');
  await expect(page.getByTestId('agent-tool-export_canvas')).toContainText('export_canvas');
  await expect(page.getByTestId('agent-toolbelt-prompt')).toBeEnabled();
  await expect(page.getByTestId('agent-toolbelt-report')).toContainText('Report');
  await expect(page.getByTestId('agent-toolbelt-terminal-handoff')).toContainText('CLI handoff');
  await expect(page.getByTestId('activation-runway')).toContainText('Activation runway');
  await expect(page.getByTestId('activation-step-install')).toContainText('Install and health');
  await expect(page.getByTestId('activation-step-proof')).toContainText('Load proof canvas');
  await expect(page.getByTestId('activation-step-codex')).toContainText('Wire Codex MCP');
  await expect(page.getByTestId('activation-copy-prompt')).toBeEnabled();
  await expect(page.getByTestId('activation-action-proof')).toBeEnabled();
  await expect(page.getByTestId('first-success-contract')).toContainText('First success');
  await expect(page.getByTestId('first-success-phase-install')).toContainText('Install');
  await expect(page.getByTestId('first-success-phase-capture')).toContainText('Capture');
  await expect(page.getByTestId('first-success-phase-codex')).toContainText('Codex');
  await expect(page.getByTestId('first-success-input-contracts')).toContainText('Input contracts');
  await expect(page.getByTestId('first-success-input-youtube')).toContainText('source_youtube');
  await expect(page.getByTestId('first-success-input-video')).toContainText('source_video');
  await expect(page.getByTestId('first-success-input-image')).toContainText('source_image');
  await expect(page.getByTestId('first-success-copy')).toContainText('Contract');
  await expect(page.getByTestId('first-success-json')).toContainText('JSON');
  await expect(page.getByTestId('first-success-proof')).toContainText('Proof');
  await expect(page.getByTestId('workflow-map')).toContainText('Workflow map');
  await expect(page.getByTestId('template-steps-competitor_teardown')).toContainText('Capture evidence');
  await expect(page.getByTestId('template-competitor_teardown')).toContainText('Codex implementation brief');
  await expect(page.getByTestId('handoff-readiness')).toContainText('Handoff readiness');
  await expect(page.getByTestId('handoff-readiness')).toContainText('Evidence');
  await expect(page.getByTestId('handoff-readiness')).toContainText('Synthesis');
  await expect(page.getByTestId('handoff-readiness')).toContainText('Codex');
  await expect(page.getByTestId('handoff-readiness-source')).toBeEnabled();
  await expect(page.getByTestId('handoff-readiness-codex')).toBeEnabled();
  await expect(page.getByTestId('intake-ingest')).toContainText('Map + Brief');
  await expect(page.getByTestId('intake-ingest')).toBeEnabled();
  await expect(page.getByTestId('new-blank-canvas')).toBeVisible();
  await expect(page.getByTestId('rail-intake-paste')).toContainText('Paste & Map');
  await expect(page.getByTestId('intake-paste')).toContainText('Paste & Map');
  await page.getByTestId('ask-canvas').click();
  await expect(page.getByTestId('status')).toContainText('Add a source or note before asking');
  await expect(page.getByTestId('intake-text')).toBeFocused();
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        readText: async () => {
          throw new DOMException('Clipboard permission denied', 'NotAllowedError');
        },
        writeText: async () => {},
      },
    });
  });
  await page.getByTestId('intake-paste').click();
  await expect(page.getByTestId('clipboard-fallback')).toContainText('Paste manually');
  await expect(page.getByTestId('clipboard-fallback')).toContainText('source');
  await expect(page.getByTestId('status')).toContainText('Clipboard read was blocked or empty');
  await expect(page.getByTestId('intake-text')).toBeFocused();
  await page.getByTestId('intake-text').fill('Manual clipboard fallback source note.');
  await expect(page.getByTestId('clipboard-fallback')).toHaveCount(0);
  await page.getByTestId('intake-text').fill('');
  await page.getByTestId('intake-ingest').click();
  await expect(page.getByTestId('status')).toContainText('Paste or drop a YouTube link');
  await expect(page.getByTestId('intake-text')).toBeFocused();
  await expect(page.getByTestId('context-loop')).toContainText('Drop');
  await expect(page.getByTestId('context-loop')).toContainText('Map');
  await expect(page.getByTestId('context-loop')).toContainText('Ask');
  await expect(page.getByTestId('context-loop')).toContainText('Handoff');
  await expect(page.getByTestId('composer-mode')).toContainText('Source');
  await expect(page.getByTestId('composer-mode')).toContainText('Note');
  await expect(page.getByTestId('composer-mode')).toContainText('Ask');
  await expect(page.getByTestId('canvas-quick-start')).toContainText('Video');
  await expect(page.getByTestId('canvas-quick-start')).toContainText('Image');
  await expect(page.getByTestId('canvas-quick-start')).toContainText('Web');
  await expect(page.getByTestId('canvas-quick-start')).toContainText('Note');
  await expect(page.getByTestId('canvas-quick-start')).toContainText('Ask');
  await expect(page.getByTestId('canvas-command-tray')).toContainText('Source');
  await expect(page.getByTestId('canvas-command-tray')).toContainText('Paste');
  await expect(page.getByTestId('canvas-command-tray')).toContainText('File');
  await expect(page.getByTestId('canvas-command-tray')).toContainText('Note');
  await expect(page.getByTestId('canvas-command-tray')).toContainText('Ask');
  await expect(page.getByTestId('canvas-command-tray')).toContainText('Context');
  await expect(page.getByTestId('canvas-command-tray')).toContainText('Codex');
  await page.getByTestId('canvas-toolbar-source').click();
  await expect(page.getByTestId('status')).toContainText('Paste or drop a YouTube link');
  await expect(page.getByTestId('intake-text')).toBeFocused();
  await page.getByTestId('canvas-quick-start').getByRole('button', { name: /Video/ }).click();
  await expect(page.getByTestId('status')).toContainText('Ready for a video link');
  const firstInputSurface = testInfo.project.name === 'mobile' ? page.getByTestId('intake-text') : page.getByTestId('empty-intake-text');
  await firstInputSurface.fill('https://example.com/demo.mp4\nManual video notes about workflow intake.');
  await expect(page.getByTestId('intake-preview')).toContainText('Video link');
  await expect(page.getByTestId('intake-map-preview-summary')).toContainText('source_video');
  await expect(page.getByTestId('intake-map-preview-summary')).toContainText('Codex-ready video notes');
  await expect(page.getByTestId('intake-map-preview')).toContainText('Map preview');
  await expect(page.getByTestId('intake-map-preview-item-video')).toContainText('source_video');
  await expect(page.getByTestId('intake-map-preview-item-video')).toContainText('video');
  await expect(page.getByTestId('intake-map-preview-item-video')).toContainText('Codex-ready video notes');
  await expect(page.getByTestId('intake-map-action-preview')).toContainText('adds a linked summary node');
  await page.getByTestId('intake-preview').getByRole('button', { name: 'Map only' }).click();
  await expect(page.getByTestId('intake-map-action-preview')).toContainText('maps raw nodes only');
  await page.getByTestId('intake-ingest').click();
  await expect(page.getByTestId('status')).toContainText('Mapped 1 item(s): Video link.');
  await expect(page.getByTestId('context-mapping-receipt')).toContainText('Mapped context receipt');
  await expect(page.getByTestId('context-mapping-receipt')).toContainText('Composer intake');
  await expect(page.getByTestId('context-receipt-node-count')).toContainText('1 context node');
  await expect(page.getByTestId('context-receipt-artifacts')).toContainText('video artifacts');
  await expect(page.getByTestId('context-receipt-codex-ready')).toContainText('Codex-ready');
  await expect(page.getByTestId('context-receipt-items')).toContainText('source video');
  await expect(page.getByTestId('context-receipt-items')).toContainText('Video example.com');
  await expect(page.getByTestId('shared-context-contract')).toContainText('1 source');
  await expect(page.getByTestId('shared-context-contract')).toContainText('1 artifact');
  await expect(page.getByTestId('shared-context-ask')).toBeEnabled();
  await expect(page.getByTestId('context-receipt-inspect')).toBeEnabled();
  await expect(page.getByTestId('context-receipt-copy-context')).toBeEnabled();
  await expect(page.getByTestId('context-receipt-copy-codex')).toBeEnabled();
  await expect(page.getByTestId('intake-trace-panel')).toContainText('Latest intake trace');
  await expect(page.getByTestId('intake-trace-summary')).toContainText('example.com');
  await expect(page.getByTestId('intake-trace-count')).toContainText('1 node');
  await expect(page.getByTestId('intake-trace-stats')).toContainText('1 / 1');
  await expect(page.getByTestId('intake-trace-items')).toContainText('video');
  await expect(page.getByTestId('intake-trace-items')).toContainText('Video example.com');
  await expect(page.getByTestId('intake-trace-inspect')).toBeEnabled();
  await expect(page.getByTestId('intake-trace-context')).toBeEnabled();
  await expect(page.getByTestId('intake-trace-codex')).toBeEnabled();
  await expect(page.getByTestId('source-readiness-label')).toContainText('Codex-ready video notes');
  await expect(page.getByTestId('source-readiness-state')).toContainText('Actions ready');
  await expect(page.getByTestId('source-readiness-detail')).toContainText('Manual transcript, notes, or timestamp context');
  await expect(page.getByTestId('source-readiness-next')).toContainText('Ask selected');
  await expect(page.getByTestId('operator-loop-map')).toContainText('1 source');
  await expect(page.getByTestId('operator-loop-inspect')).toContainText('Video example.com');
  {
    const exportHref = await page.getByLabel('Export JSON').getAttribute('href');
    expect(exportHref).toBeTruthy();
    const exportResponse = await page.request.get(exportHref!);
    await expect(exportResponse).toBeOK();
    const exported = await exportResponse.json() as {
      nodes: Array<{ kind: string; body: string; metadata: Record<string, unknown> }>;
      artifacts: Array<{ kind: string; body: string; metadata: Record<string, unknown> }>;
      intakeTraces: Array<{ nodeIds: string[]; items: Array<{ readinessLabel?: string }> }>;
    };
    expect(exported.nodes.some((node) => node.kind === 'source_video' && node.body.includes('Manual video notes'))).toBe(true);
    expect(exported.artifacts.some((artifact) => artifact.kind === 'video' && artifact.body.includes('Manual video notes'))).toBe(true);
    expect(exported.intakeTraces.some((trace) => trace.items.some((item) => item.readinessLabel === 'Codex-ready video notes'))).toBe(true);
  }

  await page.getByTestId('intake-text').fill('https://vimeo.com/246813579');
  await expect(page.getByTestId('intake-preview')).toContainText('Video link');
  await page.getByTestId('intake-preview').getByRole('button', { name: 'Map only' }).click();
  await page.getByTestId('intake-ingest').click();
  await expect(page.getByTestId('status')).toContainText('Mapped 1 item(s): Video link.');
  await expect(page.getByTestId('source-readiness-label')).toContainText('Video reference saved');
  await expect(page.getByTestId('source-readiness-state')).toContainText('Needs context');
  await expect(page.getByTestId('context-gaps')).toContainText('Context gaps');
  await expect(page.getByTestId('context-gaps')).toContainText('Video reference saved');
  await expect(page.getByTestId('context-gaps')).toContainText('1 open');
  await page.getByTestId('context-gap-attach').first().click();
  await expect(page.getByTestId('source-enrichment-body')).toBeFocused();
  await expect(page.getByTestId('source-enrichment')).toContainText('Attach context');
  await expect(page.getByTestId('source-enrichment-kind')).toContainText('Transcript');
  await expect(page.getByTestId('source-enrichment-attach')).toBeDisabled();
  await page.getByTestId('source-enrichment-body').fill('Transcript: the reference-only video explains how creators paste, enrich, ask, and hand context to Codex.');
  await page.getByTestId('source-enrichment-attach').click();
  await expect(page.getByTestId('status')).toContainText('Attached transcript to selected source.');
  await expect(page.getByTestId('source-readiness-label')).toContainText('Codex-ready video notes');
  await expect(page.getByTestId('source-readiness-state')).toContainText('Actions ready');
  await expect(page.getByTestId('source-readiness-evidence')).toContainText('manual video transcript');
  await expect(page.getByTestId('source-chunk-preview')).toContainText('reference-only video explains');
  await expect(page.getByTestId('intake-trace-panel')).toContainText('Latest intake trace');
  await expect(page.getByTestId('intake-trace-stats')).toContainText('1 / 1');
  await expect(page.getByTestId('context-gaps')).toHaveCount(0);
  {
    const exportHref = await page.getByLabel('Export JSON').getAttribute('href');
    expect(exportHref).toBeTruthy();
    const exportResponse = await page.request.get(exportHref!);
    await expect(exportResponse).toBeOK();
    const exported = await exportResponse.json() as {
      artifacts: Array<{ kind: string; body: string; metadata: Record<string, unknown>; chunks: Array<{ text: string }> }>;
      intakeTraces: Array<{ sourceLabel: string; items: Array<{ readinessLabel?: string }> }>;
    };
    expect(exported.artifacts.some((artifact) => artifact.kind === 'video' && artifact.body.includes('reference-only video explains') && artifact.chunks.length > 0)).toBe(true);
    expect(exported.intakeTraces.some((trace) => trace.sourceLabel === 'Inspector enrichment' && trace.items.some((item) => item.readinessLabel === 'Codex-ready video notes'))).toBe(true);
  }

  await page.getByTestId('intake-preview').getByRole('button', { name: 'Brief' }).click();
  await page.getByTestId('intake-text').fill('');
  await page.getByTestId('composer-mode').getByRole('button', { name: 'Note' }).click();
  await expect(page.getByTestId('intake-ingest')).toContainText('Add Note');
  await expect(page.getByTestId('intake-paste')).toContainText('Paste Note');
  await page.getByTestId('composer-mode').getByRole('button', { name: 'Ask' }).click();
  await expect(page.getByTestId('intake-ingest')).toContainText('Ask Canvas');
  await expect(page.getByTestId('intake-paste')).toContainText('Ask Clipboard');
  await page.getByTestId('composer-mode').getByRole('button', { name: 'Source' }).click();
  await expect(page.getByTestId('intake-ingest')).toContainText('Map + Brief');
  await expect(page.getByTestId('intake-paste')).toContainText('Paste & Map');

  await page.getByTestId('intake-text').fill('My canvas note: collect the product gaps and turn them into a brief.');
  await expect(page.getByTestId('quick-note')).toBeEnabled();
  await page.getByTestId('quick-note').click();
  await expect(page.getByTestId('inspector-title')).toBeVisible();
  await expect(page.getByTestId('inspector-title')).toHaveValue('My canvas note: collect the product gaps and turn them into a brief.');
  await expect(page.getByTestId('context-receipt-node-count')).toContainText('1 context node');
  await expect(page.getByTestId('context-receipt-codex-ready')).toContainText('Codex-ready');
  await expect(page.getByTestId('canvas-drop-affordance')).toBeVisible();
  await expect(page.getByTestId('canvas-drop-affordance')).toContainText('Canvas accepts context');
  await expect(page.getByTestId('canvas-affordance-paste')).toBeEnabled();
  await expect(page.getByTestId('canvas-affordance-note')).toBeEnabled();
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
  await expect(page.getByTestId('context-receipt-action')).toContainText('summarize output');
  await expect(page.getByTestId('context-receipt-items')).toContainText('Nodeflow connects YouTube');
  await expect(page.getByTestId('context-receipt-items')).toContainText('output linked');
  await expect(page.getByTestId('intake-ingest')).toBeEnabled();
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
  await expect(page.getByTestId('intake-map-preview-item-youtube')).toContainText('source_youtube');
  await expect(page.getByTestId('intake-map-preview-item-youtube')).toContainText('youtube');
  await expect(page.getByTestId('intake-map-preview-item-youtube')).toContainText('Codex-ready transcript');
  await expect(page.getByTestId('intake-preview')).not.toContainText('Source notes');
  await page.getByTestId('intake-ingest').click();
  await expect(page.getByTestId('inspector-body')).toHaveValue(/Manual transcript/);
  await expect(page.getByTestId('source-receipt')).toContainText('Context receipt');
  await expect(page.getByTestId('source-receipt-kind')).toContainText('youtube');
  await expect(page.getByTestId('source-receipt-ingest')).toContainText('manual transcript');
  await expect(page.getByTestId('source-readiness-label')).toContainText('Codex-ready transcript');
  await expect(page.getByTestId('source-readiness-evidence')).toContainText('manual transcript');
  await expect(page.getByTestId('source-chunk-preview')).toContainText('Manual transcript');
  await expect(page.getByTestId('selected-source-copy')).toBeEnabled();
  await page.getByTestId('selected-source-ask').click();
  await expect(page.getByTestId('inspector-title')).toHaveValue('answer question output');
  await expect(page.getByTestId('inspector')).toContainText('Citations');
  await expect(page.getByTestId('citation-focus').first()).toContainText('Focus source');
  await page.getByTestId('citation-focus').first().click();
  await expect(page.getByTestId('inspector-body')).toHaveValue(/Manual transcript/);
  await expect(page.getByTestId('source-receipt-kind')).toContainText('youtube');
  await expect(page.getByTestId('source-chunk-preview')).toContainText('focused');
  await expect(page.getByTestId('run-citation-focus').first()).toBeVisible();
  await page.getByTestId('run-citation-focus').first().click();
  await expect(page.getByTestId('source-chunk-preview')).toContainText('Manual transcript');
  await expect(page.getByTestId('quick-note')).toBeEnabled();

  const markdownPath = testInfo.outputPath(`uploaded-${testInfo.project.name}.md`);
  await writeFile(markdownPath, '# Uploaded markdown source\n\nUploaded markdown source with context chunks for agent synthesis.', 'utf8');
  await page.getByTestId('composer-upload-source').setInputFiles(markdownPath);
  await expect(page.getByTestId('inspector-body')).toHaveValue(/Uploaded markdown source/);
  await expect(page.getByTestId('quick-note')).toBeEnabled();

  const pdfPath = testInfo.outputPath(`uploaded-pdf-${testInfo.project.name}.pdf`);
  await writeFile(
    pdfPath,
    [
      '%PDF-1.4',
      '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
      '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
      '3 0 obj << /Type /Page /Parent 2 0 R /Resources << >> /MediaBox [0 0 200 200] /Contents 4 0 R >> endobj',
      '4 0 obj << /Length 44 >> stream',
      'BT /F1 12 Tf 20 120 Td (PDF canvas source) Tj ET',
      'endstream endobj',
      'xref',
      '0 5',
      '0000000000 65535 f ',
      '0000000009 00000 n ',
      '0000000058 00000 n ',
      '0000000115 00000 n ',
      '0000000230 00000 n ',
      'trailer << /Root 1 0 R /Size 5 >>',
      'startxref',
      '323',
      '%%EOF',
    ].join('\n'),
    'utf8',
  );
  await page.getByTestId('composer-upload-source').setInputFiles(pdfPath);
  await expect(page.getByTestId('inspector-title')).toHaveValue(new RegExp(`uploaded-pdf-${testInfo.project.name}\\.pdf`));
  await expect(page.getByTestId('source-receipt-kind')).toContainText('pdf');
  await expect(page.getByTestId('source-receipt-source')).toContainText(`uploaded-pdf-${testInfo.project.name}.pdf`);
  await expect(page.getByTestId('source-receipt-chunks')).not.toContainText('0');
  await expect(page.getByTestId('source-readiness-label')).toContainText('Codex-ready PDF');
  await expect(page.getByTestId('quick-note')).toBeEnabled();

  await page.getByTestId('intake-text').fill('https://example.com/workflow-screenshot.png\nVisual notes: this screenshot shows composer, source receipt, and canvas handoff states.');
  await expect(page.getByTestId('intake-preview')).toContainText('Image source');
  await page.getByTestId('intake-ingest').click();
  await expect(page.getByTestId('source-receipt-kind')).toContainText('image');
  await expect(page.getByTestId('source-receipt-ingest')).toContainText('manual image notes');
  await expect(page.getByTestId('source-readiness-label')).toContainText('Codex-ready visual notes');
  await expect(page.getByTestId('source-readiness-next')).toContainText('visual evidence');
  await expect(page.getByTestId('source-image-preview')).toBeVisible();

  const imagePath = testInfo.outputPath(`uploaded-image-${testInfo.project.name}.png`);
  await writeFile(imagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64'));
  await page.getByTestId('composer-upload-source').setInputFiles(imagePath);
  await expect(page.getByTestId('inspector-title')).toHaveValue(new RegExp(`uploaded-image-${testInfo.project.name}\\.png`));
  await expect(page.getByTestId('source-receipt-kind')).toContainText('image');
  await expect(page.getByTestId('source-receipt-ingest')).toContainText('image upload');
  await expect(page.getByTestId('source-image-preview')).toBeVisible();
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
  await expect(page.getByTestId('ask-canvas')).toBeEnabled();
  await page.getByTestId('ask-canvas').click();
  await expect(page.getByTestId('inspector-title')).toHaveValue('answer question output');
  await expect(page.getByTestId('inspector')).toContainText('Citations');
  await expect(page.getByTestId('copy-context')).toBeEnabled();
  await expect(page.getByTestId('operator-loop-ask')).toContainText('output');

  const searchInput = page.getByPlaceholder('Search canvases');
  await searchInput.scrollIntoViewIfNeeded();
  await searchInput.fill('Nodeflow');
  await expect(searchInput).toHaveValue('Nodeflow');
  const currentCanvasResponse = await page.request.get(`/api/canvases/${created.canvas.id}`);
  await expect(currentCanvasResponse).toBeOK();
  const currentCanvas = await currentCanvasResponse.json() as {
    canvas: { nodes: Array<{ id: string; body: string; title: string }> };
  };
  const nodeflowNode = currentCanvas.canvas.nodes.find((node) => node.body.includes('Nodeflow connects YouTube'));
  if (!nodeflowNode) throw new Error('Expected current canvas to contain the Nodeflow source node.');
  const searchResponse = page.waitForResponse((response) =>
    response.url().includes('/api/search?q=Nodeflow') && response.request().method() === 'GET',
  );
  await page.getByRole('button', { name: 'Go' }).click();
  expect((await searchResponse).ok()).toBe(true);
  const currentSearchResult = page.getByTestId(`search-result-${created.canvas.id}-${nodeflowNode.id}`).first();
  await expect(page.getByTestId('search-results')).toContainText('Nodeflow connects YouTube');
  await expect(currentSearchResult).toBeVisible();
  await currentSearchResult.click();
  await expect(page.getByTestId('inspector-body')).toHaveValue(/Nodeflow connects YouTube/);
  await expect(page.getByTestId('selected-context')).toContainText('1 node context');
  await expect(page.getByTestId('codex-export-preview')).toContainText('Codex export preview');
  await expect(page.getByTestId('codex-export-mode')).toContainText('selected');
  await expect(page.getByTestId('codex-export-nodes')).toContainText('Nodeflow connects YouTube');
  await expect(page.getByTestId('codex-export-counts')).toContainText('Nodes');
  await expect(page.getByTestId('codex-export-counts')).toContainText('Chunks');
  await expect(page.getByTestId('codex-export-rules')).toContainText('Excludes');
  await expect(page.getByTestId('codex-export-rules')).toContainText('Edges export only when both endpoints are selected');
  await expect(page.getByTestId('codex-preview-handoff')).toBeEnabled();
  await expect(page.getByTestId('operator-loop-handoff')).toContainText('selected');

  const exportHref = await page.getByLabel('Export JSON').getAttribute('href');
  expect(exportHref).toBeTruthy();
  expect(exportHref).toContain('nodeIds=');
  const selectedExportResponse = await page.request.get(exportHref!);
  await expect(selectedExportResponse).toBeOK();
  const selectedExportedCanvas = await selectedExportResponse.json() as {
    nodes: Array<{ kind: string; body: string; metadata: Record<string, unknown> }>;
    artifacts: Array<{ kind: string; body: string; chunks?: unknown[]; metadata: Record<string, unknown> }>;
  };
  expect(selectedExportedCanvas.nodes).toHaveLength(1);
  expect(selectedExportedCanvas.nodes[0].body).toContain('Nodeflow connects YouTube');
  expect(JSON.stringify(selectedExportedCanvas)).not.toContain('Edited canvas note');

  const selectedCodexResponse = await page.request.get(exportHref!.replace('format=json', 'format=codex'));
  await expect(selectedCodexResponse).toBeOK();
  const selectedCodexText = await selectedCodexResponse.text();
  expect(selectedCodexText).toContain('selected node');
  expect(selectedCodexText).toContain('Nodeflow connects YouTube');
  expect(selectedCodexText).toContain('## Intake Trace Manifest');
  expect(selectedCodexText).not.toContain('Edited canvas note');

  const fullExportHref = exportHref!.replace(/&nodeIds=[^&]+/, '');
  const exportResponse = await page.request.get(fullExportHref);
  await expect(exportResponse).toBeOK();
  expect(exportResponse.headers()['content-type']).toContain('application/json');
  const exportedCanvas = await exportResponse.json() as {
    id: string;
    title: string;
    nodes: Array<{ id: string; kind: string; body: string; metadata: Record<string, unknown> }>;
    edges: Array<{ source: string; target: string; kind: string }>;
    artifacts: Array<{ kind: string; body: string; chunks?: unknown[]; metadata: Record<string, unknown> }>;
  };
  expect(JSON.stringify(exportedCanvas)).toContain('Edited canvas note');
  expect(exportedCanvas.nodes.some((node) => node.kind === 'source_video')).toBe(true);
  expect(exportedCanvas.nodes.some((node) => node.kind === 'source_image')).toBe(true);
  expect(exportedCanvas.nodes.some((node) => node.kind === 'source_pdf')).toBe(true);
  expect(exportedCanvas.nodes.some((node) => node.kind === 'source_url')).toBe(true);
  expect(exportedCanvas.nodes.some((node) => node.kind === 'source_youtube' && node.body.includes('Manual transcript'))).toBe(true);
  expect(exportedCanvas.nodes.some((node) => node.metadata.artifactId)).toBe(true);
  expect(exportedCanvas.artifacts.some((artifact) => artifact.kind === 'video' && artifact.body.includes('Manual video notes'))).toBe(true);
  expect(exportedCanvas.artifacts.some((artifact) => artifact.kind === 'image' && artifact.body.includes('Visual notes'))).toBe(true);
  expect(exportedCanvas.artifacts.some((artifact) => artifact.kind === 'image' && typeof artifact.metadata.imageDataUrl === 'string')).toBe(true);
  expect(exportedCanvas.artifacts.some((artifact) => artifact.kind === 'pdf' && Array.isArray(artifact.chunks) && artifact.chunks.length > 0)).toBe(true);
  expect(exportedCanvas.artifacts.some((artifact) => artifact.kind === 'url' && Array.isArray(artifact.chunks) && artifact.chunks.length > 0)).toBe(true);
  expect(exportedCanvas.artifacts.some((artifact) => artifact.kind === 'youtube' && artifact.body.includes('Manual transcript'))).toBe(true);
  expect(exportedCanvas.artifacts.some((artifact) => artifact.kind === 'markdown' && artifact.body.includes('Uploaded markdown source'))).toBe(true);

  const sourceNode = exportedCanvas.nodes.find((node) => node.kind === 'source_youtube') ?? exportedCanvas.nodes[0];
  const targetNode = exportedCanvas.nodes.find((node) => node.kind === 'output') ?? exportedCanvas.nodes.at(-1);
  if (!sourceNode || !targetNode) throw new Error('Expected at least two nodes before creating a test edge.');
  const edgeResponse = await page.request.post(`/api/canvases/${exportedCanvas.id}/edges`, {
    data: { source: sourceNode.id, target: targetNode.id, kind: 'derives_from' },
  });
  await expect(edgeResponse).toBeOK();
  const edgeResult = await edgeResponse.json() as {
    canvas: { edges: Array<{ source: string; target: string; kind: string }> };
    edge: { source: string; target: string; kind: string };
  };
  expect(edgeResult.edge).toMatchObject({ source: sourceNode.id, target: targetNode.id, kind: 'derives_from' });
  expect(edgeResult.canvas.edges.some((edge) => edge.source === sourceNode.id && edge.target === targetNode.id && edge.kind === 'derives_from')).toBe(true);

  const contextResponse = await page.request.get(fullExportHref.replace('format=json', 'format=context'));
  await expect(contextResponse).toBeOK();
  expect(contextResponse.headers()['content-type']).toContain('text/markdown');
  const contextText = await contextResponse.text();
  expect(contextText).toContain('Agent Context Packet');
  expect(contextText).toContain('## Intake Trace Manifest');
  expect(contextText).toContain('Codex-ready video notes');

  const codexResponse = await page.request.get(fullExportHref.replace('format=json', 'format=codex'));
  await expect(codexResponse).toBeOK();
  expect(codexResponse.headers()['content-type']).toContain('text/markdown');
  const codexText = await codexResponse.text();
  expect(codexText).toContain('Codex Handoff');
  expect(codexText).toContain('get_canvas');
  expect(codexText).toContain('Agent Context Packet');
  expect(codexText).toContain('## Intake Trace Manifest');

  const importTitle = `imported ${testInfo.project.name} ${Date.now()}`;
  exportedCanvas.id = `canvas-${importTitle.replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase()}`;
  exportedCanvas.title = importTitle;
  const importPath = testInfo.outputPath(`${importTitle.replace(/\s+/g, '-')}.json`);
  await writeFile(importPath, JSON.stringify(exportedCanvas, null, 2), 'utf8');

  await page.getByTestId('import-canvas-file').setInputFiles(importPath);
  await expect(page.getByTestId('import-preview')).toBeVisible();
  await expect(page.getByTestId('import-preview-conflict')).toContainText('new canvas id');
  await expect(page.getByTestId('import-preview-counts')).toContainText('Nodes');
  await expect(page.getByTestId('import-preview-counts')).toContainText('Artifacts');
  await expect(page.getByTestId('import-preview-kinds')).toContainText('source');
  await expect(page.getByTestId('import-preview-nodes')).toContainText('Edited canvas note');
  await page.getByTestId('import-preview-cancel').click();
  await expect(page.getByTestId('status')).toContainText('Import cancelled');
  await expect(page.getByRole('button', { name: new RegExp(importTitle) })).toHaveCount(0);
  await page.getByTestId('import-canvas-file').setInputFiles(importPath);
  await expect(page.getByTestId('import-preview')).toBeVisible();
  await page.getByTestId('import-preview-confirm').click();
  await expect(page.getByRole('button', { name: new RegExp(importTitle) })).toBeVisible();
  await expect.poll(async () => {
    return await page.getByLabel('Export JSON').getAttribute('href') ?? '';
  }).toContain(exportedCanvas.id);
  await page.getByTestId('import-canvas-file').setInputFiles(importPath);
  await expect(page.getByTestId('import-preview')).toBeVisible();
  await expect(page.getByTestId('import-preview-conflict')).toContainText('copy on import');
  await expect(page.getByTestId('import-preview-diff')).toContainText('will be preserved');
  await page.getByTestId('import-preview-confirm').click();
  await expect(page.getByTestId('status')).toContainText(`Imported copy of ${importTitle}`);
  await expect(page.getByRole('button', { name: new RegExp(`${importTitle} \\(imported\\)`) })).toBeVisible();
  const duplicateExportHref = await page.getByLabel('Export JSON').getAttribute('href');
  expect(duplicateExportHref).toBeTruthy();
  expect(new URL(duplicateExportHref!, 'http://127.0.0.1').pathname).not.toBe(`/api/canvases/${exportedCanvas.id}/export`);
});

test('imports the public demo canvas and exports chunked context', async ({ page }, testInfo) => {
  const raw = await readFile(new URL('../../../examples/demo-canvas.json', import.meta.url), 'utf8');
  const demoCanvas = JSON.parse(raw) as { id: string; title: string; nodes: Array<{ id: string; kind: string; title: string }> };
  const youtubeNode = demoCanvas.nodes.find((node) => node.kind === 'source_youtube');
  if (!youtubeNode) throw new Error('Expected demo canvas to include a YouTube source node.');
  const importTitle = `public demo ${testInfo.project.name} ${Date.now()}`;
  demoCanvas.id = `canvas-${importTitle.replace(/[^A-Za-z0-9_-]+/g, '-').toLowerCase()}`;
  demoCanvas.title = importTitle;
  const importPath = testInfo.outputPath(`${importTitle.replace(/\s+/g, '-')}.json`);
  await writeFile(importPath, JSON.stringify(demoCanvas, null, 2), 'utf8');

  await page.goto('/');
  await expect(page.getByTestId('workspace')).toBeVisible();
  await page.getByTestId('import-canvas-file').setInputFiles(importPath);
  await expect(page.getByTestId('import-preview')).toBeVisible();
  await expect(page.getByTestId('import-preview-counts')).toContainText('5');
  await expect(page.getByTestId('import-preview-kinds')).toContainText('source');
  await page.getByTestId('import-preview-confirm').click();
  await expect(page.getByRole('button', { name: new RegExp(importTitle) })).toBeVisible();
  await expect.poll(async () => {
    return await page.getByLabel('Export JSON').getAttribute('href') ?? '';
  }).toContain(demoCanvas.id);
  await expect(page.getByTestId('canvas-live-state')).toContainText('5 nodes');
  await expect(page.getByTestId('canvas-live-state')).toContainText('3 artifacts');
  await expect(page.getByTestId('canvas-live-state')).toContainText('2 runs');

  await expect(page.getByTestId('selected-context')).toContainText('1 node context');
  await expect(page.getByTestId('inspector-title')).toHaveValue(youtubeNode.title);
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
  expect(contextText).not.toContain('Codex context handoff');

  const fullContextResponse = await page.request.get(exportHref!.replace(/&nodeIds=[^&]+/, '').replace('format=json', 'format=context'));
  await expect(fullContextResponse).toBeOK();
  const fullContextText = await fullContextResponse.text();
  expect(fullContextText).toContain('Codex context handoff');

  await page.reload();
  await expect(page.getByTestId('workspace')).toBeVisible();
  await page.getByTestId('import-canvas-file').setInputFiles(importPath);
  await expect(page.getByTestId('import-preview')).toBeVisible();
  await expect(page.getByTestId('import-preview-conflict')).toContainText('copy on import');
  await page.getByTestId('import-preview-cancel').click();
});

test('loads the bundled demo canvas from the first viewport', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('workspace')).toBeVisible();
  await expect(page.getByTestId('load-demo-canvas')).toBeVisible();
  await page.getByTestId('load-demo-canvas').click();

  await expect(page.getByTestId('status')).toContainText('Loaded demo from examples/demo-canvas.json');
  await expect(page.getByTestId('canvas-live-state')).toContainText('5 nodes');
  await expect(page.getByTestId('canvas-live-state')).toContainText('3 artifacts');
  await expect(page.getByTestId('canvas-live-state')).toContainText('2 runs');
  await expect(page.getByTestId('selected-context')).toContainText('1 node context');
  await expect(page.getByTestId('source-receipt-kind')).toContainText('youtube');
  await expect(page.getByTestId('source-receipt-ingest')).toContainText('manual transcript');
  await expect(page.getByTestId('source-chunk-preview')).toContainText('artifact-youtube-nodeflow:chunk-001');
  await expect(page.getByRole('button', { name: /Demo: YouTube To Codex Context Canvas/ }).first()).toBeVisible();

  const exportHref = await page.getByLabel('Export JSON').getAttribute('href');
  expect(exportHref).toBeTruthy();
  expect(exportHref).toContain('nodeIds=');
  const jsonResponse = await page.request.get(exportHref!);
  await expect(jsonResponse).toBeOK();
  const exported = await jsonResponse.json() as { title: string; nodes: Array<{ id: string }>; artifacts: Array<{ chunks?: unknown[] }> };
  expect(exported.title).toContain('Demo: YouTube To Codex Context Canvas');
  expect(exported.nodes).toHaveLength(1);
  expect(exported.artifacts.some((artifact) => Array.isArray(artifact.chunks) && artifact.chunks.length > 0)).toBe(true);

  const contextResponse = await page.request.get(exportHref!.replace('format=json', 'format=context'));
  await expect(contextResponse).toBeOK();
  const contextText = await contextResponse.text();
  expect(contextText).toContain('Agent Context Packet');
  expect(contextText).toContain('artifact-youtube-nodeflow:chunk-001');
  expect(contextText).not.toContain('Codex context handoff');

  const fullContextResponse = await page.request.get(exportHref!.replace(/&nodeIds=[^&]+/, '').replace('format=json', 'format=context'));
  await expect(fullContextResponse).toBeOK();
  const fullContextText = await fullContextResponse.text();
  expect(fullContextText).toContain('Agent Context Packet');
  expect(fullContextText).toContain('artifact-youtube-nodeflow:chunk-001');
  expect(fullContextText).toContain('Codex context handoff');
});

test('launches a guided workflow template with clickable stages', async ({ page }, testInfo) => {
  const title = `workflow template ${testInfo.project.name} ${Date.now()}`;
  await page.request.post('/api/canvases', {
    data: { title, template: 'blank' },
  });

  await page.goto('/');
  await expect(page.getByTestId('workspace')).toBeVisible();
  await page.getByRole('button', { name: new RegExp(title) }).click();
  await expect(page.getByTestId('template-competitor_teardown')).toContainText('Capture evidence');
  await page.getByTestId('template-competitor_teardown').click();

  await expect(page.getByTestId('canvas-live-state')).toContainText('8 nodes');
  await expect(page.getByTestId('workflow-map')).toContainText('Capture evidence');
  await expect(page.getByTestId('workflow-map')).toContainText('Normalize capabilities');
  await expect(page.getByTestId('workflow-map')).toContainText('Compare wedges');
  await expect(page.getByTestId('workflow-map')).toContainText('Handoff to Codex');
  await page.getByTestId('workflow-map').getByRole('button', { name: /Compare wedges/ }).click();
  await expect(page.getByTestId('inspector-title')).toHaveValue('Decision matrix prompt');

  const exportHref = await page.getByLabel('Export JSON').getAttribute('href');
  expect(exportHref).toBeTruthy();
  expect(exportHref).toContain('nodeIds=');
  const selectedContextResponse = await page.request.get(exportHref!.replace('format=json', 'format=context'));
  await expect(selectedContextResponse).toBeOK();
  const selectedContextText = await selectedContextResponse.text();
  expect(selectedContextText).toContain('Decision matrix prompt');
  expect(selectedContextText).not.toContain('Build wedge output');

  const fullContextResponse = await page.request.get(exportHref!.replace(/&nodeIds=[^&]+/, '').replace('format=json', 'format=context'));
  await expect(fullContextResponse).toBeOK();
  const fullContextText = await fullContextResponse.text();
  expect(fullContextText).toContain('Build wedge output');
  expect(fullContextText).toContain('Codex handoff target');
});
