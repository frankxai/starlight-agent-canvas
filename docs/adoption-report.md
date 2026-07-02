# Adoption Report

`pnpm adoption:report` is the operator snapshot for GitHub users, Frank's local estate, and Codex handoffs. It explains whether the repo, local install, MCP wiring, demo proof, visual evidence, and release posture are ready.

It does not install dependencies, start a server, call provider APIs, write Codex config, or mutate canvas data.

## Run It

Human-readable report:

```powershell
pnpm adoption:report
```

Machine-readable report:

```powershell
pnpm adoption:report:json
```

Write a local handoff artifact:

```powershell
pnpm adoption:report -- --out .agent-canvas/adoption-report.md
```

`.agent-canvas/` is ignored by Git, so local reports can include machine paths without becoming public repo artifacts.

## What It Reads

- `scripts/doctor.mjs --json` for local install health, data home, MCP CLI path, and Codex config status.
- `scripts/first-success-contract.mjs --json` for the maintained human plus Codex first-success contract.
- `scripts/release-audit.mjs --json` for OSS/release readiness.
- `package.json` for maintained proof scripts.
- `examples/demo-canvas.json` for portable canvas proof counts and node kinds.
- `docs/design-loop-evidence.json` plus critical `docs/visual-qa` screenshots for visual proof.
- `git` for branch, remote, head commit, and dirty-tree status.
- `gh`, when available, for public repo metadata and latest CI status.

## How To Use It

Use the Markdown output when:

- A new contributor wants the shortest credible install and proof path.
- Frank wants to know whether the local repo is ready for hands-on use.
- A GitHub issue or PR needs the current evidence state attached.
- Codex needs a compact human-readable summary before operating.

Use the JSON output when:

- CI or a setup helper needs a stable adoption contract.
- Codex should parse local readiness before deciding whether to run MCP, CLI, or browser workflows.
- Another automation needs to distinguish required failures from optional warnings.

## Status Rules

The report is `ready` when:

- `doctor --json` exits cleanly and has no required failures.
- `first-success --json` has the expected install/open/capture/inspect/handoff/Codex phases and input contracts.
- `release:audit --json` exits cleanly and has no failures.
- Required scripts, docs, demo proof, and visual evidence are present.

Warnings remain visible but do not fail the report. Common warnings include optional Codex MCP wiring not installed yet, unavailable `gh` metadata, or a local dirty tree while work is in progress.

## Codex Prompt

The report includes a copyable Codex prompt:

```text
Use starlight-agent-canvas as shared local context. Call get_latest_canvas, read the graph before writing, add durable evidence as nodes, run the smallest useful action, and export format "codex". Return node ids, artifact ids, chunk ids, and every node/action changed.
```

This prompt is intentionally short. The detailed operating contract remains in `docs/codex-integration.md`, while the adoption report tells the agent whether the local environment is ready.
