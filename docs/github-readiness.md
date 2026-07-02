# GitHub Readiness

This repo is prepared for public OSS work when the local and GitHub-side checklist below is complete.

## Repository Settings

Recommended GitHub metadata:

- Description: `OSS-first, MCP-native research/workflow canvas for humans and agents.`
- Repository: `https://github.com/frankxai/starlight-agent-canvas`
- Website: hosted docs/demo URL once connected; do not use a localhost URL in public metadata.
- Topics: `mcp`, `agents`, `research`, `workflow`, `canvas`, `nextjs`, `react-flow`, `local-first`, `codex`, `claude`, `gemini`.
- Visibility: public after secrets scan and product boundary review pass.

README first-read requirements before public announcement:

- Shows the real app, not a mockup: `docs/visual-qa/desktop-self-serve-video-mapped.png`.
- States the local-first/MCP-native wedge in the first paragraph.
- Includes a concrete input behavior matrix.
- Explains that non-YouTube video links are references plus notes in v0.1, not automatic full transcription.
- Shows a one-click `Demo` path that imports the real bundled example canvas from the app.
- Shows the first-viewport human operating loop: `Capture -> Map -> Inspect -> Ask -> Handoff`.
- Links to install, PRD, user flows, Codex integration, MCP setup, and readiness evidence.
- Links to the human/agent operator loop and documents `pnpm doctor:json` as the parseable local health contract.
- Links to the first-success contract and documents `pnpm first-success:json` as the parseable install-to-Codex operating contract.
- Links to the adoption report and documents `pnpm adoption:report` as the combined install, release, proof, visual, GitHub, and Codex status snapshot.
- Links to `docs/activation.md` and shows the in-app activation runway as the first install-to-Codex success path.
- Avoids comparing itself as a clone of Poppy, Nodeflow, or another closed product.

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
- Setup / MCP help template.
- Pull request template.
- Support guide.
- Security policy with private-reporting guidance.
- Code of conduct.
- Governance and maintainer notes.
- CODEOWNERS placeholder to replace with real GitHub handles before branch protection enforcement.

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

1. Run `pnpm doctor` and confirm it reports Node/pnpm, workspaces, built MCP server, `.mcp.json`, and Codex MCP path/home checks.
2. Run `pnpm doctor:json` and confirm `summary.fail` is `0`; Codex wiring warnings are acceptable until the user opts into config writes.
3. Run `pnpm first-success` and confirm the install/open/capture/inspect/handoff/Codex phases match the product.
4. Run `pnpm first-success:json` when an agent or setup helper needs the same contract.
5. Run `pnpm adoption:report` and confirm it shows ready state or only understood warnings.
6. Run `pnpm release:audit` and address failures. The public GitHub remote should be attached before public release.
7. Run `pnpm verify`.
8. Run `pnpm canvas:smoke`.
9. Run `pnpm mcp:smoke`.
10. Run `pnpm mcp:codex:smoke` to prove the Codex config installer through a temporary config and temporary canvas home without mutating the real user config.
11. Run `pnpm first-run:check` to prove a fresh production preview can boot, import the demo canvas, and export context from a temporary data home.
12. Run `pnpm test:e2e`.
13. Confirm `/api/setup/status` exposes `activation.steps`, `firstSuccess.phases`, proof commands, and the Codex activation prompt.
14. Run `pnpm setup:local -- --skip-install --skip-seed` as the install path smoke.
15. Run `pnpm mcp:install:codex` and verify the dry-run block points at the built MCP server; after `--write`, rerun `pnpm doctor`.
16. Run the Starlight staged/full security scan.
17. Confirm visual QA screenshots are current.
18. Confirm `AGENT_CANVAS_HOME` runtime data is not staged.
19. Confirm `.env` and private canvas exports are not staged.
20. Confirm `pnpm release:audit` reports required public files are tracked or staged, not merely present in the local working tree.
21. Update README links and docs index.
22. Keep CODEOWNERS pointed at the active maintainer account or team before enforcing owner review.
23. Tag release only after GitHub CI passes.

Public install proof to keep current:

```powershell
git clone https://github.com/frankxai/starlight-agent-canvas.git
cd starlight-agent-canvas
corepack enable
corepack prepare pnpm@11.7.0 --activate
node scripts/setup.mjs
pnpm dev
```

The setup script must remain explicit about what it does: dependency install, doctor, MCP build, MCP smoke, Codex config smoke, seed, and Codex config dry-run unless `--codex-write` is supplied.

Use `docs/readiness-evidence.md` as the current proof matrix before tagging or announcing a release. Use `docs/release-audit.md` for the local machine-checkable release gate.

## First Good Issues

- Add richer image OCR/vision and richer selected-subgraph visualization.
- Add a standalone packaged CLI binary once the local script surface stabilizes.
- Add a local SQLite store adapter behind the existing store contract.
- Add citation-to-node navigation from the inspector.
- Add MCP smoke fixtures for public URL fallback edge cases.
- Add docs screenshots for Mac/Linux install.

## Public Positioning

Use this framing:

> Starlight Agent Canvas is a local-first, MCP-native context canvas. It helps humans and coding agents map sources, notes, actions, and outputs into a portable workflow graph.

Avoid this framing:

> A clone of Poppy, Nodeflow, or another closed-source AI canvas.
