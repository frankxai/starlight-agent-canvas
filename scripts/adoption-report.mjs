#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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

function fromRoot(...parts) {
  return path.join(repoRoot, ...parts);
}

function relativePath(filePath) {
  return slash(path.relative(repoRoot, filePath));
}

function readJson(relPath, fallback = null) {
  const absolute = fromRoot(...relPath.split('/'));
  if (!existsSync(absolute)) return fallback;
  return JSON.parse(readFileSync(absolute, 'utf8'));
}

function fileExists(relPath) {
  return existsSync(fromRoot(...relPath.split('/')));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
    error: result.error?.message ?? '',
  };
}

function runGit(args) {
  const result = run('git', args);
  return result.ok ? result.stdout : '';
}

function runJsonNode(scriptRelPath, args = []) {
  const result = run(process.execPath, [scriptRelPath, ...args]);
  try {
    const data = JSON.parse(result.stdout);
    return {
      ok: result.ok,
      error: result.ok ? '' : result.stderr || result.error || `${scriptRelPath} exited with ${result.status}`,
      data,
    };
  } catch (error) {
    return {
      ok: false,
      error: result.stderr || result.error || `${scriptRelPath} did not emit valid JSON: ${error.message}`,
      data: null,
    };
  }
}

function runGhJson(args) {
  const result = run('gh', args);
  if (!result.ok) return null;
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

function githubState() {
  const repo = runGhJson(['repo', 'view', '--json', 'nameWithOwner,url,isPrivate,description,homepageUrl']);
  const runs = runGhJson(['run', 'list', '--limit', '1', '--json', 'workflowName,status,conclusion,headSha,url,createdAt']);
  return {
    available: Boolean(repo),
    repo: repo ?? null,
    latestRun: Array.isArray(runs) ? runs[0] ?? null : null,
  };
}

function doctorCheck(doctor, label) {
  return doctor?.checks?.find((check) => check.label === label) ?? null;
}

function releaseResultsByLevel(release, level) {
  return (release?.results ?? []).filter((result) => result.level === level);
}

function packageScriptState() {
  const pkg = readJson('package.json', {});
  const expected = [
    'setup:local',
    'doctor',
    'doctor:json',
    'first-success',
    'first-success:json',
    'adoption:report',
    'adoption:report:json',
    'release:audit',
    'verify',
    'first-run:check',
    'canvas:smoke',
    'mcp:smoke',
    'mcp:codex:smoke',
    'test:e2e',
  ];
  return expected.map((name) => ({
    name,
    exists: Boolean(pkg.scripts?.[name]),
    command: pkg.scripts?.[name] ?? '',
  }));
}

function proofState() {
  const demo = readJson('examples/demo-canvas.json', {});
  const design = readJson('docs/design-loop-evidence.json', {});
  const artifacts = Array.isArray(design.artifacts) ? design.artifacts : [];
  const visualScore = design.visualQaScore?.total ?? design.score?.total ?? null;
  const criticalVisuals = [
    'docs/visual-qa/desktop-self-serve-video-mapped.png',
    'docs/visual-qa/mobile-self-serve-note-intake.png',
    'docs/visual-qa/desktop-operator-loop-active.png',
    'docs/visual-qa/mobile-operator-loop-active.png',
    'docs/visual-qa/desktop-add-anything-codex-preview.png',
  ];
  return {
    demoCanvas: {
      exists: fileExists('examples/demo-canvas.json'),
      nodes: demo.nodes?.length ?? 0,
      artifacts: demo.artifacts?.length ?? 0,
      runs: demo.runs?.length ?? 0,
      edges: demo.edges?.length ?? 0,
      nodeKinds: [...new Set((demo.nodes ?? []).map((node) => node.kind).filter(Boolean))].sort(),
    },
    visual: {
      score: visualScore,
      artifactCount: artifacts.length,
      inspectedCount: artifacts.filter((artifact) => artifact.inspected).length,
      criticalScreenshots: criticalVisuals.map((relPath) => ({ path: relPath, exists: fileExists(relPath) })),
    },
    docs: [
      'docs/install.md',
      'docs/activation.md',
      'docs/first-success.md',
      'docs/first-success.contract.json',
      'docs/adoption-report.md',
      'docs/operator-loop.md',
      'docs/codex-integration.md',
      'docs/github-readiness.md',
      'docs/readiness-evidence.md',
    ].map((relPath) => ({ path: relPath, exists: fileExists(relPath) })),
  };
}

function codexState(doctor) {
  const checks = [
    doctorCheck(doctor, 'Codex config'),
    doctorCheck(doctor, 'Codex MCP block'),
    doctorCheck(doctor, 'Codex MCP CLI path'),
    doctorCheck(doctor, 'Codex canvas home env'),
  ].filter(Boolean);
  return {
    canvasHome: doctor?.canvasHome ?? '',
    mcpCliPath: doctor?.mcpCliPath ?? '',
    codexConfigPath: doctor?.codexConfigPath ?? '',
    wired: checks.length === 4 && checks.every((check) => check.ok),
    checks,
  };
}

function firstSuccessState(run) {
  const data = run.data;
  const phaseIds = Array.isArray(data?.phases) ? data.phases.map((phase) => phase.id) : [];
  const inputContracts = Array.isArray(data?.inputContracts) ? data.inputContracts : [];
  const inputIds = inputContracts.map((contract) => contract.id);
  const expectedPhaseIds = ['install', 'open', 'capture', 'inspect', 'handoff', 'codex'];
  const expectedInputIds = ['youtube', 'video', 'image', 'web', 'pdf', 'text', 'note'];
  const ready = Boolean(
    run.ok
      && data?.schemaVersion === 'starlight.agentCanvas.firstSuccess.v1'
      && expectedPhaseIds.every((id) => phaseIds.includes(id))
      && expectedInputIds.every((id) => inputIds.includes(id))
      && inputContracts.every((contract) => contract.input && contract.output && contract.nodeKind && contract.artifactKind && contract.status)
      && typeof data?.codexPrompt === 'string'
      && data.codexPrompt.includes('get_latest_canvas')
      && data.codexPrompt.includes('export_canvas'),
  );
  return {
    ready,
    error: run.error,
    phaseCount: Array.isArray(data?.phases) ? data.phases.length : 0,
    inputContractCount: inputContracts.length,
    phases: phaseIds,
    inputContracts: inputContracts.map((contract) => ({
      id: contract.id,
      input: contract.input,
      output: contract.output,
      nodeKind: contract.nodeKind,
      artifactKind: contract.artifactKind,
      status: contract.status,
    })),
    command: 'pnpm first-success',
    jsonCommand: 'pnpm first-success:json',
  };
}

function commandSets() {
  return {
    firstRun: [
      'corepack enable',
      'corepack prepare pnpm@11.7.0 --activate',
      'node scripts/setup.mjs',
      'pnpm first-success',
      'pnpm adoption:report',
      'pnpm dev',
    ],
    frankLocal: [
      'pnpm setup:local -- --skip-install --codex-write',
      'pnpm adoption:report',
      'pnpm dev',
    ],
    codexMcp: [
      'pnpm mcp:build',
      'pnpm mcp:codex:smoke',
      'pnpm mcp:install:codex -- --write',
      'pnpm doctor',
      'pnpm adoption:report',
    ],
    proof: [
      'pnpm doctor:json',
      'pnpm first-success:json',
      'pnpm adoption:report:json',
      'pnpm release:audit',
      'pnpm canvas:smoke',
      'pnpm mcp:smoke',
      'pnpm mcp:codex:smoke',
      'pnpm first-run:check',
    ],
    terminalHandoff: [
      'pnpm canvas -- demo',
      'pnpm canvas -- export latest --format codex --out .agent-canvas/latest-codex.md',
    ],
  };
}

function buildReport() {
  const doctorRun = runJsonNode('scripts/doctor.mjs', ['--json']);
  const firstSuccessRun = runJsonNode('scripts/first-success-contract.mjs', ['--json']);
  const releaseRun = runJsonNode('scripts/release-audit.mjs', ['--json']);
  const doctor = doctorRun.data;
  const release = releaseRun.data;
  const releaseFailures = releaseResultsByLevel(release, 'fail');
  const releaseWarnings = releaseResultsByLevel(release, 'warn');
  const branch = runGit(['branch', '--show-current']) || '(detached)';
  const statusPorcelain = runGit(['status', '--porcelain']);
  const github = githubState();
  const proof = proofState();
  const codex = codexState(doctor);
  const firstSuccess = firstSuccessState(firstSuccessRun);
  const scripts = packageScriptState();
  const warnings = [
    ...((doctor?.checks ?? []).filter((check) => check.level === 'warn').map((check) => `doctor: ${check.label} - ${check.detail}`)),
    ...releaseWarnings.map((warning) => `release: ${warning.name} - ${warning.detail}`),
    ...(firstSuccess.ready ? [] : [`first-success: ${firstSuccess.error || 'contract shape is incomplete'}`]),
    ...(github.available ? [] : ['github: gh metadata unavailable; local report still valid']),
    ...(statusPorcelain ? ['repo: working tree has local changes'] : []),
  ];
  const ok = Boolean(doctorRun.ok && firstSuccess.ready && releaseRun.ok && doctor?.ok && release?.ok && releaseFailures.length === 0);

  return {
    schemaVersion: 'starlight.agentCanvas.adoptionReport.v1',
    generatedAt: new Date().toISOString(),
    status: {
      ok,
      label: ok ? 'ready' : 'needs-attention',
      warnings,
    },
    repo: {
      root: slash(repoRoot),
      branch,
      clean: !statusPorcelain,
      head: runGit(['log', '-1', '--format=%h %s']),
      remote: runGit(['remote', 'get-url', 'origin']),
      github,
    },
    install: {
      doctorOk: Boolean(doctor?.ok),
      doctorSummary: doctor?.summary ?? null,
      doctorError: doctorRun.error,
    },
    release: {
      auditOk: Boolean(release?.ok),
      auditSummary: release?.summary ?? null,
      auditError: releaseRun.error,
      failures: releaseFailures,
      warnings: releaseWarnings,
    },
    firstSuccess,
    codex,
    proof,
    scripts,
    commands: commandSets(),
    codexPrompt: [
      'Use starlight-agent-canvas as shared local context.',
      'Call get_latest_canvas, read the graph before writing, add durable evidence as nodes, run the smallest useful action, and export format "codex".',
      'Return node ids, artifact ids, chunk ids, and every node/action changed.',
    ].join(' '),
  };
}

function marker(ok) {
  return ok ? 'OK' : 'CHECK';
}

function table(rows) {
  const header = '| Area | Result | Evidence |';
  const sep = '| --- | --- | --- |';
  const body = rows.map((row) => `| ${row.map((cell) => String(cell).replaceAll('|', '\\|')).join(' | ')} |`);
  return [header, sep, ...body].join('\n');
}

function codeList(items) {
  return items.map((item) => `- \`${item}\``).join('\n');
}

function renderMarkdown(report) {
  const latestRun = report.repo.github.latestRun;
  const visual = report.proof.visual;
  const missingCritical = visual.criticalScreenshots.filter((screenshot) => !screenshot.exists).map((screenshot) => screenshot.path);
  const scriptMisses = report.scripts.filter((script) => !script.exists).map((script) => script.name);
  const docMisses = report.proof.docs.filter((doc) => !doc.exists).map((doc) => doc.path);
  const codexLabel = report.codex.wired ? 'wired' : 'not fully wired';
  const runLabel = latestRun ? `${latestRun.workflowName}: ${latestRun.status}${latestRun.conclusion ? `/${latestRun.conclusion}` : ''}` : 'not available';

  return [
    '# Starlight Agent Canvas Adoption Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status.label.toUpperCase()}`,
    '',
    '## Summary',
    '',
    table([
      ['Local install', marker(report.install.doctorOk), `doctor ${JSON.stringify(report.install.doctorSummary ?? {})}`],
      ['Release posture', marker(report.release.auditOk), `release audit ${JSON.stringify(report.release.auditSummary ?? {})}`],
      ['First success', marker(report.firstSuccess.ready), `${report.firstSuccess.phaseCount} phases, ${report.firstSuccess.inputContractCount} input contracts`],
      ['Codex MCP', marker(report.codex.wired), `${codexLabel}; home ${slash(report.codex.canvasHome) || '(unknown)'}`],
      ['Proof canvas', marker(report.proof.demoCanvas.exists), `${report.proof.demoCanvas.nodes} nodes, ${report.proof.demoCanvas.artifacts} artifacts, ${report.proof.demoCanvas.runs} runs`],
      ['Visual QA', marker((visual.score ?? 0) >= 26 && missingCritical.length === 0), `${visual.score ?? 'n/a'}/30; ${visual.inspectedCount}/${visual.artifactCount} inspected artifacts`],
      ['GitHub', marker(report.repo.github.available), report.repo.github.repo?.url ?? 'gh metadata unavailable'],
      ['Latest CI', marker(Boolean(latestRun) && latestRun.status === 'completed' && latestRun.conclusion === 'success'), runLabel],
    ]),
    '',
    '## What Is Proven',
    '',
    `The bundled demo canvas contains ${report.proof.demoCanvas.nodeKinds.join(', ')} nodes and is portable JSON at \`examples/demo-canvas.json\`.`,
    `The current visual evidence score is \`${visual.score ?? 'n/a'}/30\` with real product screenshots under \`docs/visual-qa\`.`,
    `The first-success contract is \`${report.firstSuccess.ready ? 'ready' : 'not ready'}\` at \`docs/first-success.md\` and \`docs/first-success.contract.json\`.`,
    `The MCP CLI path is \`${slash(report.codex.mcpCliPath) || '(not built)'}\`.`,
    `The Codex config path is \`${slash(report.codex.codexConfigPath) || '(unknown)'}\`.`,
    '',
    '## First Success Commands',
    '',
    codeList(report.commands.firstRun),
    '',
    '## Frank Local Loop',
    '',
    codeList(report.commands.frankLocal),
    '',
    '## Codex MCP Loop',
    '',
    codeList(report.commands.codexMcp),
    '',
    '## Proof Commands',
    '',
    codeList(report.commands.proof),
    '',
    '## Codex Prompt',
    '',
    '```text',
    report.codexPrompt,
    '```',
    '',
    '## Attention',
    '',
    report.status.warnings.length
      ? report.status.warnings.map((warning) => `- ${warning}`).join('\n')
      : '- No warnings.',
    scriptMisses.length ? `- Missing scripts: ${scriptMisses.join(', ')}` : '- Required scripts are present.',
    docMisses.length ? `- Missing docs: ${docMisses.join(', ')}` : '- Adoption docs are present.',
    missingCritical.length ? `- Missing critical visuals: ${missingCritical.join(', ')}` : '- Critical visuals are present.',
    '',
  ].join('\n');
}

function printHelp() {
  console.log(`Usage:
  pnpm adoption:report
  pnpm adoption:report:json
  pnpm adoption:report -- --out .agent-canvas/adoption-report.md

Options:
  --json       Emit the machine-readable report.
  --out PATH   Also write the report to PATH.
  --help       Show this help.
`);
}

if (help) {
  printHelp();
  process.exit(0);
}

const report = buildReport();
const rendered = jsonOutput ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report);

if (outputPath !== null) {
  if (!outputPath) {
    console.error('--out requires a path.');
    process.exit(1);
  }
  const absoluteOutput = path.resolve(repoRoot, outputPath);
  mkdirSync(path.dirname(absoluteOutput), { recursive: true });
  writeFileSync(absoluteOutput, rendered, 'utf8');
  if (!jsonOutput) {
    console.error(`Wrote ${relativePath(absoluteOutput)}.`);
  }
}

process.stdout.write(rendered.endsWith('\n') ? rendered : `${rendered}\n`);

if (!report.status.ok) {
  process.exitCode = 1;
}
