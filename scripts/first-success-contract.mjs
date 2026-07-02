#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rawArgs = process.argv.slice(2);
const jsonOutput = rawArgs.includes('--json');
const help = rawArgs.includes('--help') || rawArgs.includes('-h');

function optionValue(name) {
  const index = rawArgs.indexOf(name);
  if (index === -1) return null;
  return rawArgs[index + 1] && !rawArgs[index + 1].startsWith('--') ? rawArgs[index + 1] : '';
}

const outputPath = optionValue('--out');

function slash(value) {
  return String(value ?? '').replaceAll('\\', '/');
}

function contract() {
  return {
    schemaVersion: 'starlight.agentCanvas.firstSuccess.v1',
    generatedAt: new Date().toISOString(),
    promise: 'A human can install the repo, put real context on the canvas, inspect it, and hand the same state to Codex through MCP or a Codex export.',
    successDefinition: [
      'The local app starts from a GitHub clone without provider API keys.',
      'The first viewport lets a human paste, drop, upload, type, or load the demo without reading docs first.',
      'The captured material becomes typed source nodes with provenance, chunks, and inspector receipts.',
      'A local action can create an inspectable output node from the source context.',
      'Context can be exported as JSON, Markdown, agent context, or a Codex handoff prompt.',
      'Codex can read and mutate the same local canvas through safe MCP tools.',
    ],
    phases: [
      {
        id: 'install',
        label: 'Install',
        humanAction: 'Run the setup script from a GitHub clone.',
        command: 'node scripts/setup.mjs',
        proof: ['pnpm doctor:json', 'pnpm adoption:report'],
      },
      {
        id: 'open',
        label: 'Open',
        humanAction: 'Start the app and land directly in the canvas workspace.',
        command: 'pnpm dev',
        proof: ['pnpm first-run:check'],
      },
      {
        id: 'capture',
        label: 'Capture',
        humanAction: 'Paste or drop a YouTube/video link, image, URL, PDF, file, transcript, or note.',
        appSurface: 'Add Anything composer, canvas toolbar, empty-canvas capture box, and drop surface',
        proof: ['apps/web/tests/workspace.spec.ts'],
      },
      {
        id: 'inspect',
        label: 'Inspect',
        humanAction: 'Select the created source/output and review provenance, chunks, citations, and body text.',
        appSurface: 'Inspector source receipt, chunk preview, run log, and citation focus controls',
        proof: ['docs/readiness-evidence.md'],
      },
      {
        id: 'handoff',
        label: 'Handoff',
        humanAction: 'Copy Context or Codex, or export JSON/Markdown for portable review.',
        command: 'pnpm canvas -- export latest --format codex --out .agent-canvas/latest-codex.md',
        proof: ['pnpm canvas:smoke'],
      },
      {
        id: 'codex',
        label: 'Codex',
        humanAction: 'Install MCP config, restart Codex, and ask it to operate on the latest canvas.',
        command: 'pnpm mcp:install:codex -- --write',
        mcpLoop: ['get_latest_canvas', 'ingest_anything', 'run_node_action', 'export_canvas'],
        proof: ['pnpm mcp:smoke', 'pnpm doctor'],
      },
    ],
    inputContracts: [
      { input: 'YouTube URL', output: 'source_youtube node with transcript/caption/manual fallback chunks' },
      { input: 'Loom/Vimeo/direct video URL', output: 'source_video reference with attached notes/chunks' },
      { input: 'Image URL or upload', output: 'source_image node with preview/provenance and notes/chunks' },
      { input: 'Web URL', output: 'source_url artifact from bounded fetch or safe reference fallback' },
      { input: 'PDF upload', output: 'source_pdf artifact from local capped extraction' },
      { input: 'Text, Markdown, JSON, CSV, log, or transcript', output: 'manual source artifact with chunks' },
      { input: 'Human note', output: 'editable note node usable as selected context' },
    ],
    commands: {
      firstRun: ['node scripts/setup.mjs', 'pnpm dev'],
      proof: ['pnpm first-run:check', 'pnpm canvas:smoke', 'pnpm mcp:smoke', 'pnpm test:e2e'],
      readiness: ['pnpm doctor:json', 'pnpm first-success:json', 'pnpm adoption:report:json', 'pnpm release:audit'],
      codex: ['pnpm mcp:build', 'pnpm mcp:install:codex -- --write', 'pnpm doctor'],
    },
    codexPrompt: 'Use starlight-agent-canvas as shared local context. Call get_latest_canvas, read the graph before writing, add durable evidence with ingest_anything when new context appears, run one useful action, then export_canvas with format "codex". Return node ids, artifact ids, chunk ids, and every node/action changed.',
    knownLimits: [
      'Non-YouTube provider transcript adapters are future work; v0.1 captures them as safe video references plus notes.',
      'Image OCR and provider vision are future work; v0.1 captures image references/uploads plus human notes.',
      'Hosted collaboration, auth, billing, marketplace, and provider-backed AI actions are v0.2+.',
    ],
    docs: [
      'docs/install.md',
      'docs/activation.md',
      'docs/operator-loop.md',
      'docs/codex-integration.md',
      'docs/readiness-evidence.md',
    ],
  };
}

function codeList(items) {
  return items.map((item) => `- \`${item}\``).join('\n');
}

function renderMarkdown(data) {
  return [
    '# First Success Contract',
    '',
    `Generated: ${data.generatedAt}`,
    '',
    data.promise,
    '',
    '## Success Definition',
    '',
    data.successDefinition.map((item) => `- ${item}`).join('\n'),
    '',
    '## Human And Agent Loop',
    '',
    '| Step | Human action | Proof |',
    '| --- | --- | --- |',
    ...data.phases.map((phase) => `| ${phase.label} | ${phase.humanAction.replaceAll('|', '\\|')} | ${phase.proof.map((item) => `\`${item}\``).join('<br>')} |`),
    '',
    '## Input Contracts',
    '',
    '| Input | Output |',
    '| --- | --- |',
    ...data.inputContracts.map((item) => `| ${item.input} | ${item.output} |`),
    '',
    '## Commands',
    '',
    'First run:',
    '',
    codeList(data.commands.firstRun),
    '',
    'Proof:',
    '',
    codeList(data.commands.proof),
    '',
    'Readiness:',
    '',
    codeList(data.commands.readiness),
    '',
    'Codex:',
    '',
    codeList(data.commands.codex),
    '',
    '## Codex Prompt',
    '',
    '```text',
    data.codexPrompt,
    '```',
    '',
    '## Known Limits',
    '',
    data.knownLimits.map((item) => `- ${item}`).join('\n'),
    '',
  ].join('\n');
}

function printHelp() {
  console.log(`Usage:
  pnpm first-success
  pnpm first-success:json
  pnpm first-success -- --out .agent-canvas/first-success.md

Options:
  --json       Emit the machine-readable contract.
  --out PATH   Also write the rendered contract to PATH.
  --help       Show this help.
`);
}

if (help) {
  printHelp();
  process.exit(0);
}

const data = contract();
const rendered = jsonOutput ? `${JSON.stringify(data, null, 2)}\n` : renderMarkdown(data);

if (outputPath !== null) {
  if (!outputPath) {
    console.error('--out requires a path.');
    process.exit(1);
  }
  const absoluteOutput = path.resolve(repoRoot, outputPath);
  mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, rendered, 'utf8');
  if (!jsonOutput) {
    console.error(`Wrote ${slash(path.relative(repoRoot, absoluteOutput))}.`);
  }
}

process.stdout.write(rendered.endsWith('\n') ? rendered : `${rendered}\n`);
