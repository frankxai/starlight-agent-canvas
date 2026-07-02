# GitHub Readiness

This repo is prepared for public OSS work when the local and GitHub-side checklist below is complete.

## Repository Settings

Recommended GitHub metadata:

- Description: `OSS-first, MCP-native research/workflow canvas for humans and agents.`
- Website: local/preview URL once hosted docs or demo exists.
- Topics: `mcp`, `agents`, `research`, `workflow`, `canvas`, `nextjs`, `react-flow`, `local-first`, `codex`, `claude`, `gemini`.
- Visibility: public only after secrets scan and product boundary review pass.

## Branch Protection

Protect `main` with:

- Require pull request before merge.
- Require status checks: `CI / verify`.
- Require branches to be up to date before merge.
- Block force pushes.
- Require conversation resolution for PRs.

## Issue And PR Templates

This repo includes:

- Bug report template.
- Feature request template.
- Integration request template.
- Pull request template.

Use labels:

- `bug`
- `feature`
- `integration`
- `mcp`
- `docs`
- `security`
- `good first issue`
- `needs design`
- `local-first`

## Release Checklist

1. Run `pnpm doctor`.
2. Run `pnpm verify`.
3. Run `pnpm mcp:smoke`.
4. Run `pnpm test:e2e`.
5. Run `pnpm setup:local -- --skip-install --skip-seed` as the install path smoke.
6. Run `pnpm mcp:install:codex` and verify the dry-run block points at the built MCP server.
7. Run the Starlight staged/full security scan.
8. Confirm visual QA screenshots are current.
9. Confirm `AGENT_CANVAS_HOME` runtime data is not staged.
10. Confirm `.env` and private canvas exports are not staged.
11. Update README links and docs index.
12. Tag release only after GitHub CI passes.

Use `docs/readiness-evidence.md` as the current proof matrix before tagging or announcing a release.

## First Good Issues

- Add richer empty/error states to the canvas.
- Add a CLI command for importing/exporting canvas files.
- Add a local SQLite store adapter behind the existing store contract.
- Add citation-to-node navigation from the inspector.
- Add more MCP smoke fixtures for YouTube/manual transcript workflows.
- Add docs screenshots for Mac/Linux install.

## Public Positioning

Use this framing:

> Starlight Agent Canvas is a local-first, MCP-native context canvas. It helps humans and coding agents map sources, notes, actions, and outputs into a portable workflow graph.

Avoid this framing:

> A clone of Poppy, Nodeflow, or another closed-source AI canvas.
