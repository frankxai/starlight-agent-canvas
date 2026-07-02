#!/usr/bin/env node
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const jsonOutput = args.has('--json');

const results = [];

function rel(filePath) {
  return filePath.replaceAll('\\', '/');
}

function fromRoot(...parts) {
  return path.join(repoRoot, ...parts);
}

function record(level, name, detail, metadata = {}) {
  results.push({ level, name, detail, ...metadata });
}

function pass(name, detail, metadata) {
  record('pass', name, detail, metadata);
}

function warn(name, detail, metadata) {
  record('warn', name, detail, metadata);
}

function fail(name, detail, metadata) {
  record('fail', name, detail, metadata);
}

function fileExists(filePath) {
  const absolute = fromRoot(...filePath.split('/'));
  return existsSync(absolute) && statSync(absolute).isFile();
}

function dirExists(dirPath) {
  const absolute = fromRoot(...dirPath.split('/'));
  return existsSync(absolute) && statSync(absolute).isDirectory();
}

function readText(filePath) {
  return readFileSync(fromRoot(...filePath.split('/')), 'utf8');
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function runGit(args) {
  const result = spawnSync('git', args, { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}

function checkFiles(label, files) {
  const missing = files.filter((file) => !fileExists(file));
  if (missing.length) {
    fail(label, `Missing ${missing.length} required file(s).`, { missing });
  } else {
    pass(label, `${files.length} required file(s) exist.`);
  }
}

function trackedOrStagedFileSet() {
  const tracked = runGit(['ls-files']);
  const staged = runGit(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
  return new Set([
    ...(tracked ? tracked.split(/\r?\n/) : []),
    ...(staged ? staged.split(/\r?\n/) : []),
  ].map((file) => file.replaceAll('\\', '/')).filter(Boolean));
}

function checkTrackedFiles(label, files) {
  const trackedOrStaged = trackedOrStagedFileSet();
  const missing = files.filter((file) => !trackedOrStaged.has(file));
  if (missing.length) {
    fail(label, `Missing ${missing.length} required tracked or staged file(s).`, { missing });
  } else {
    pass(label, `${files.length} required file(s) are tracked or staged.`);
  }
}

function checkPackageScripts() {
  const pkg = readJson('package.json');
  const requiredScripts = [
    'build',
    'typecheck',
    'test',
    'verify',
    'test:e2e',
    'setup:local',
    'doctor',
    'doctor:json',
    'first-success',
    'first-success:json',
    'adoption:report',
    'adoption:report:json',
    'first-run:check',
    'release:audit',
    'canvas',
    'canvas:smoke',
    'mcp:build',
    'mcp:install:codex',
    'mcp:smoke',
  ];
  const missing = requiredScripts.filter((script) => !pkg.scripts?.[script]);
  if (missing.length) {
    fail('package scripts', `Missing required package scripts: ${missing.join(', ')}.`, { missing });
  } else {
    pass('package scripts', `${requiredScripts.length} release scripts exist.`);
  }
}

function checkCi() {
  const ci = readText('.github/workflows/ci.yml');
  const requiredSteps = [
    'node-version: [22.13.0, 24]',
    'node-version: ${{ matrix.node-version }}',
    'pnpm mcp:build',
    'pnpm doctor',
    'pnpm doctor:json',
    'pnpm first-success:json',
    'pnpm adoption:report:json',
    'pnpm release:audit',
    'pnpm typecheck',
    'pnpm test',
    'pnpm canvas:smoke',
    'pnpm mcp:smoke',
    'pnpm build',
    'pnpm first-run:check',
    'pnpm test:e2e',
  ];
  const missing = requiredSteps.filter((step) => !ci.includes(step));
  if (missing.length) {
    fail('ci gates', `CI is missing required step(s): ${missing.join(', ')}.`, { missing });
  } else {
    pass('ci gates', `${requiredSteps.length} CI gates are wired.`);
  }
}

function checkDoctorJson() {
  const result = spawnSync(process.execPath, ['scripts/doctor.mjs', '--json'], { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    fail('doctor json contract', `doctor --json exited with ${result.status}.`, {
      stderr: result.stderr.trim(),
    });
    return;
  }

  try {
    const parsed = JSON.parse(result.stdout);
    const requiredKeys = ['ok', 'summary', 'repoRoot', 'canvasHome', 'mcpCliPath', 'codexConfigPath', 'checks', 'nextSteps'];
    const missing = requiredKeys.filter((key) => !(key in parsed));
    const hasChecks = Array.isArray(parsed.checks) && parsed.checks.length > 0;
    const hasLevels = hasChecks && parsed.checks.every((check) => ['pass', 'warn', 'fail'].includes(check.level));
    if (missing.length || !hasChecks || !hasLevels) {
      fail('doctor json contract', 'doctor --json is missing required shape.', { missing, hasChecks, hasLevels });
    } else {
      pass('doctor json contract', `doctor --json returned ${parsed.checks.length} pass/warn/fail check(s).`);
    }
  } catch (error) {
    fail('doctor json contract', `doctor --json did not emit valid JSON: ${error.message}`);
  }
}

function checkFirstSuccessJson() {
  const result = spawnSync(process.execPath, ['scripts/first-success-contract.mjs', '--json'], { cwd: repoRoot, encoding: 'utf8' });
  if (result.status !== 0) {
    fail('first success json contract', `first-success --json exited with ${result.status}.`, {
      stderr: result.stderr.trim(),
    });
    return;
  }

  try {
    const parsed = JSON.parse(result.stdout);
    const requiredKeys = ['schemaVersion', 'promise', 'successDefinition', 'phases', 'inputContracts', 'commands', 'codexPrompt', 'knownLimits'];
    const missing = requiredKeys.filter((key) => !(key in parsed));
    const phaseIds = Array.isArray(parsed.phases) ? parsed.phases.map((phase) => phase.id) : [];
    const expectedPhaseIds = ['install', 'open', 'capture', 'inspect', 'handoff', 'codex'];
    const phasesOk = expectedPhaseIds.every((id) => phaseIds.includes(id));
    const inputOk = Array.isArray(parsed.inputContracts) && parsed.inputContracts.length >= 7;
    const codexOk = typeof parsed.codexPrompt === 'string'
      && parsed.codexPrompt.includes('get_latest_canvas')
      && parsed.codexPrompt.includes('export_canvas');
    if (missing.length || !phasesOk || !inputOk || !codexOk) {
      fail('first success json contract', 'first-success --json is missing required shape.', {
        missing,
        phaseIds,
        phasesOk,
        inputOk,
        codexOk,
      });
    } else {
      pass('first success json contract', `${parsed.phases.length} phases and ${parsed.inputContracts.length} input contract(s) verified.`);
    }
  } catch (error) {
    fail('first success json contract', `first-success --json did not emit valid JSON: ${error.message}`);
  }
}

function checkDemoCanvas() {
  const demo = readJson('examples/demo-canvas.json');
  const kinds = new Set(demo.nodes?.map((node) => node.kind) ?? []);
  const hasChunkedArtifacts = (demo.artifacts ?? []).some((artifact) => Array.isArray(artifact.chunks) && artifact.chunks.length > 0);
  const hasCitations = (demo.nodes ?? []).some((node) => Array.isArray(node.metadata?.citations) && node.metadata.citations.length > 0);
  const checks = [
    demo.schemaVersion === 'starlight.agentCanvas.v1',
    (demo.nodes?.length ?? 0) >= 5,
    (demo.artifacts?.length ?? 0) >= 3,
    (demo.runs?.length ?? 0) >= 2,
    kinds.has('source_youtube'),
    kinds.has('source_url'),
    kinds.has('note'),
    kinds.has('output'),
    hasChunkedArtifacts,
    hasCitations,
  ];
  if (checks.every(Boolean)) {
    pass('demo canvas', `Demo canvas has ${demo.nodes.length} nodes, ${demo.artifacts.length} artifacts, ${demo.runs.length} runs, chunks, and citations.`);
  } else {
    fail('demo canvas', 'Demo canvas is missing required v0.1 proof content.', {
      nodes: demo.nodes?.length ?? 0,
      artifacts: demo.artifacts?.length ?? 0,
      runs: demo.runs?.length ?? 0,
      nodeKinds: Array.from(kinds),
      hasChunkedArtifacts,
      hasCitations,
    });
  }
}

function checkDesignEvidence() {
  const evidence = readJson('docs/design-loop-evidence.json');
  const score = evidence.visualQaScore?.total ?? evidence.score?.total ?? 0;
  const artifacts = Array.isArray(evidence.artifacts) ? evidence.artifacts : [];
  const missingArtifacts = artifacts
    .map((artifact) => artifact.path_or_url)
    .filter((artifactPath) => typeof artifactPath === 'string' && !artifactPath.startsWith('http'))
    .filter((artifactPath) => !fileExists(rel(artifactPath)));
  const uninspected = artifacts.filter((artifact) => artifact.inspected !== true).map((artifact) => artifact.path_or_url);
  if (score < 26) {
    fail('visual evidence score', `Visual QA score is ${score}; expected 26+.`);
  } else {
    pass('visual evidence score', `Visual QA score is ${score}/30.`);
  }
  if (missingArtifacts.length || uninspected.length) {
    fail('visual evidence artifacts', 'Design evidence references missing or uninspected artifact(s).', { missingArtifacts, uninspected });
  } else {
    pass('visual evidence artifacts', `${artifacts.length} design evidence artifact(s) exist and are marked inspected.`);
  }
}

function checkCriticalScreenshots() {
  const screenshots = [
    'docs/visual-qa/desktop-first-touch-active-intake.png',
    'docs/visual-qa/mobile-first-touch-active-intake.png',
    'docs/visual-qa/desktop-demo-proof-canvas.png',
    'docs/visual-qa/mobile-demo-proof-canvas.png',
    'docs/visual-qa/desktop-setup-mcp-panel.png',
    'docs/visual-qa/mobile-setup-mcp-panel.png',
  ];
  const missing = screenshots.filter((screenshot) => !fileExists(screenshot));
  if (missing.length) {
    fail('critical screenshots', `Missing ${missing.length} screenshot(s).`, { missing });
  } else {
    pass('critical screenshots', `${screenshots.length} critical screenshots exist.`);
  }
}

function checkEnvExample() {
  const text = readText('.env.example');
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#'));
  const nonEmpty = lines.filter((line) => /^[A-Z0-9_]+=.+/.test(line));
  const requiredKeys = ['AGENT_CANVAS_HOME', 'AGENT_CANVAS_ALLOW_REMOTE', 'FIRECRAWL_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY'];
  const missingKeys = requiredKeys.filter((key) => !lines.some((line) => line.startsWith(`${key}=`)));
  if (nonEmpty.length || missingKeys.length) {
    fail('.env.example', 'Environment example should list key names only and include expected optional keys.', { nonEmpty, missingKeys });
  } else {
    pass('.env.example', `${requiredKeys.length} optional env keys are documented without values.`);
  }
}

function checkGitIgnore() {
  const text = readText('.gitignore');
  const required = ['node_modules/', '.next/', 'dist/', '.env', '.agent-canvas/'];
  const missing = required.filter((entry) => !text.includes(entry));
  if (missing.length) {
    fail('.gitignore', `Missing runtime/private ignore entries: ${missing.join(', ')}.`, { missing });
  } else {
    pass('.gitignore', 'Runtime, dependency, build, and private env paths are ignored.');
  }
}

function checkGitState() {
  const remote = runGit(['remote', '-v']);
  if (!remote) {
    warn('git remote', 'No Git remote configured. Add the public GitHub remote before public release.');
  } else {
    pass('git remote', 'At least one Git remote is configured.');
  }

  const trackedRuntime = runGit(['ls-files', '.agent-canvas', 'apps/web/.next', 'node_modules', '.env', '.env.local']);
  if (trackedRuntime) {
    fail('tracked runtime data', 'Runtime/build/private paths are tracked by Git.', { trackedRuntime: trackedRuntime.split(/\r?\n/) });
  } else {
    pass('tracked runtime data', 'No runtime/build/private paths are tracked.');
  }

  const staged = runGit(['diff', '--cached', '--name-only']);
  const stagedRuntime = staged
    ? staged.split(/\r?\n/).filter((file) => {
      const normalized = file.replaceAll('\\', '/');
      const isEnv = normalized === '.env' || (normalized.startsWith('.env.') && normalized !== '.env.example');
      return normalized.startsWith('.agent-canvas/')
        || normalized.startsWith('apps/web/.next/')
        || normalized.startsWith('node_modules/')
        || normalized.startsWith('data/')
        || isEnv;
    })
    : [];
  if (stagedRuntime.length) {
    fail('staged runtime data', 'Runtime/build/private paths are staged.', { stagedRuntime });
  } else {
    pass('staged runtime data', 'No runtime/build/private paths are staged.');
  }
}

checkFiles('oss surface files', [
  'README.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'LICENSE',
  '.env.example',
  '.gitignore',
  '.mcp.json',
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
]);

checkFiles('operator scripts', [
  'scripts/adoption-report.mjs',
  'scripts/doctor.mjs',
  'scripts/first-success-contract.mjs',
  'scripts/release-audit.mjs',
  'scripts/setup.mjs',
]);

checkFiles('community files', [
  'CODE_OF_CONDUCT.md',
  'SUPPORT.md',
  'GOVERNANCE.md',
  'MAINTAINERS.md',
  '.github/CODEOWNERS',
]);

checkFiles('github templates', [
  '.github/workflows/ci.yml',
  '.github/dependabot.yml',
  '.github/pull_request_template.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/integration_request.yml',
  '.github/ISSUE_TEMPLATE/setup_help.yml',
]);

checkFiles('docs surface', [
  'docs/install.md',
  'docs/activation.md',
  'docs/first-success.md',
  'docs/adoption-report.md',
  'docs/cli.md',
  'docs/prd.md',
  'docs/user-flows.md',
  'docs/codex-integration.md',
  'docs/operator-loop.md',
  'docs/mcp-setup.md',
  'docs/readiness-evidence.md',
  'docs/production-readiness.md',
  'docs/github-readiness.md',
  'docs/release-audit.md',
  'docs/system-design.md',
  'docs/technology-stack.md',
  'docs/product-brief.md',
  'docs/scene-brief.md',
  'docs/design-loop-evidence.json',
  'docs/demo-walkthrough.md',
]);

checkFiles('examples surface', [
  'examples/demo-canvas.json',
  'examples/mcp/README.md',
  'examples/mcp/codex.toml',
  'examples/mcp/claude-desktop.json',
  'examples/mcp/gemini.md',
]);

checkTrackedFiles('required tracked files', [
  'README.md',
  'AGENTS.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CODE_OF_CONDUCT.md',
  'SUPPORT.md',
  'GOVERNANCE.md',
  'MAINTAINERS.md',
  'LICENSE',
  '.env.example',
  '.gitignore',
  '.mcp.json',
  'package.json',
  'pnpm-workspace.yaml',
  'pnpm-lock.yaml',
  'scripts/adoption-report.mjs',
  'scripts/doctor.mjs',
  'scripts/first-success-contract.mjs',
  'scripts/release-audit.mjs',
  'scripts/setup.mjs',
  '.github/CODEOWNERS',
  '.github/workflows/ci.yml',
  '.github/dependabot.yml',
  '.github/pull_request_template.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/integration_request.yml',
  '.github/ISSUE_TEMPLATE/setup_help.yml',
  'docs/install.md',
  'docs/activation.md',
  'docs/first-success.md',
  'docs/adoption-report.md',
  'docs/cli.md',
  'docs/prd.md',
  'docs/user-flows.md',
  'docs/codex-integration.md',
  'docs/operator-loop.md',
  'docs/mcp-setup.md',
  'docs/readiness-evidence.md',
  'docs/production-readiness.md',
  'docs/github-readiness.md',
  'docs/release-audit.md',
  'docs/system-design.md',
  'docs/technology-stack.md',
  'docs/product-brief.md',
  'docs/scene-brief.md',
  'docs/design-loop-evidence.json',
  'docs/demo-walkthrough.md',
  'examples/demo-canvas.json',
  'examples/mcp/README.md',
  'examples/mcp/codex.toml',
  'examples/mcp/claude-desktop.json',
  'examples/mcp/gemini.md',
]);

if (!dirExists('docs/visual-qa')) {
  fail('visual qa directory', 'docs/visual-qa is missing.');
} else {
  pass('visual qa directory', 'docs/visual-qa exists.');
}

checkPackageScripts();
checkCi();
checkDoctorJson();
checkFirstSuccessJson();
checkDemoCanvas();
checkDesignEvidence();
checkCriticalScreenshots();
checkEnvExample();
checkGitIgnore();
checkGitState();

const summary = {
  pass: results.filter((result) => result.level === 'pass').length,
  warn: results.filter((result) => result.level === 'warn').length,
  fail: results.filter((result) => result.level === 'fail').length,
};

if (jsonOutput) {
  console.log(JSON.stringify({ ok: summary.fail === 0, summary, results }, null, 2));
} else {
  console.log('Starlight Agent Canvas release audit');
  for (const result of results) {
    const marker = result.level === 'pass' ? '[ok]' : result.level === 'warn' ? '[warn]' : '[fail]';
    console.log(`${marker} ${result.name} - ${result.detail}`);
  }
  console.log(`\nSummary: ${summary.pass} passed, ${summary.warn} warning(s), ${summary.fail} failure(s).`);
}

if (summary.fail > 0) {
  process.exitCode = 1;
}
