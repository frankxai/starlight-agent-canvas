#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
const contractPath = path.join(repoRoot, 'docs', 'first-success.contract.json');

function slash(value) {
  return String(value ?? '').replaceAll('\\', '/');
}

function contract() {
  const base = JSON.parse(readFileSync(contractPath, 'utf8'));
  return {
    ...base,
    generatedAt: new Date().toISOString(),
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
