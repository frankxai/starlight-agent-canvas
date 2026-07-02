# Readiness Evidence Matrix

Last local verification: 2026-07-02.

This matrix connects the product promises in `docs/prd.md` and `docs/user-flows.md` to current evidence. It is intentionally practical: if a row cannot point to a command, screenshot, test, or file, it is not considered proven.

Latest local proof commit: use `git log --oneline -1`; this matrix tracks evidence by artifact instead of relying on a hand-maintained hash.

| Promise | Current Evidence | Status |
| --- | --- | --- |
| First screen is the usable workspace | `apps/web/components/WorkspaceClient.tsx`, `docs/scene-brief.md`, `docs/visual-qa/desktop-live-composer-modes.png`, `docs/visual-qa/mobile-live-composer-modes.png` | Proven locally |
| First-use canvas is actionable | Blank first-run canvas, interactive empty-state `Map`/`Note`/`Upload`, canvas toolbar `Note`, right-rail empty inspector actions, and visual captures in `docs/visual-qa/desktop-source-receipt-actions.png` / `docs/visual-qa/mobile-source-receipt-actions.png` | Proven locally |
| Intake preview shows what will be mapped | `intake-preview` and `rail-intake-preview` in `apps/web/components/WorkspaceClient.tsx`; Playwright preview chip assertions | Proven locally |
| User can paste/drop links, transcripts, files, and notes | Playwright `apps/web/tests/workspace.spec.ts`; web routes under `apps/web/app/api/canvases/[id]/ingest`; `pnpm test:e2e` passed | Proven for text, URL+notes, YouTube manual transcript, Markdown file upload, paste-anywhere, and text drop-to-canvas happy paths; broader PDF browser cases still needed |
| YouTube is transcript-first with manual fallback | `packages/core/src/ingest.ts`, `docs/user-flows.md`, core ingest tests, Playwright YouTube manual transcript path | Proven locally |
| Non-YouTube video links can be captured as first-class video context | `apps/web/components/WorkspaceClient.tsx`, `apps/web/app/api/canvases/[id]/nodes/route.ts`, Playwright `source_video` assertion, `packages/mcp/src/tool-handlers.ts`, `docs/visual-qa/desktop-self-serve-video-intake.png`, `docs/visual-qa/desktop-self-serve-video-mapped.png` | Proven locally for `source_video` nodes, `video` artifacts, attached notes, chunks, and exported `media: video_reference`; provider transcription remains future work |
| First-viewport quick starters make intake self-serve | `canvas-quick-start`, `new-blank-canvas`, empty primary-action focus handling, and `context-loop` in `apps/web/components/WorkspaceClient.tsx`; Playwright desktop/mobile assertions; visual captures in `docs/visual-qa/desktop-first-touch-active-intake.png`, `docs/visual-qa/mobile-first-touch-active-intake.png`, `docs/visual-qa/desktop-self-serve-video-intake.png`, and `docs/visual-qa/mobile-self-serve-note-intake.png` | Proven locally |
| New users can load a working proof canvas from the app | `apps/web/app/api/canvases/demo/route.ts`, `load-demo-canvas` controls in `apps/web/components/WorkspaceClient.tsx`, Playwright bundled demo assertion, `docs/visual-qa/desktop-demo-proof-canvas.png`, `docs/visual-qa/mobile-demo-proof-canvas.png` | Proven locally for in-app import of `examples/demo-canvas.json`, selected YouTube receipt, chunk preview, and context export |
| User can run local actions and inspect outputs | `packages/core/src/actions.ts`, `packages/core/src/__tests__/actions.test.ts`, Playwright `ask-canvas` path | Proven locally |
| JSON import/export is portable and non-destructive | `packages/core/src/store.ts`, `apps/web/app/api/canvases/import/route.ts`, `packages/core/src/__tests__/store.test.ts`, Playwright import path | Proven locally |
| Agent context packet is available | `packages/core/src/exporters.ts`, web `format=context` route, MCP `export_canvas` with `format: "context"`, live preview API check on 2026-07-02 | Proven locally |
| Source chunks and citations are available | `packages/core/src/chunks.ts`, `packages/core/src/actions.ts`, `packages/core/src/__tests__/actions.test.ts`, `packages/core/src/__tests__/store.test.ts`, inspector citation UI in `apps/web/components/WorkspaceClient.tsx` | Proven at core/UI level |
| Selected sources expose a usable context receipt | `source-receipt`, `source-chunk-preview`, `selected-source-ask`, and `selected-source-copy` in `apps/web/components/WorkspaceClient.tsx`; Playwright assertions for YouTube/manual transcript receipt and selected-source ask | Proven locally |
| Search results navigate back to graph evidence | Web search UI in `apps/web/components/WorkspaceClient.tsx`; Playwright search-focus assertion | Proven locally |
| Selected context is visible before actions | `selected-context` tray in `apps/web/components/WorkspaceClient.tsx`; Playwright assertion | Proven locally |
| MCP can read/write canvas state safely | `packages/mcp/src/index.ts`, `packages/mcp/src/tool-handlers.ts`, `pnpm mcp:smoke` covers 15 tools, source ingest, edges, search, import, and export | Proven locally |
| MCP can ingest text, URL, YouTube, generic video, and PDF sources | MCP tool schemas; handler tests; smoke test includes text, URL fallback, YouTube/manual transcript, generic video reference, PDF, connected nodes, chunk-aware search, and context chunk manifest assertions | Proven locally for text, URL fallback, YouTube/manual transcript, generic video reference, and PDF; live URL quality remains best-effort |
| MCP and web support graph positioning | Web drag persistence and MCP optional `position` inputs; MCP handler test asserts position | Proven locally |
| New users have a one-command setup path | `scripts/setup.mjs`, `pnpm setup:local`, install docs, dry-run command verification | Proven locally |
| Terminal users can operate local canvases without browser or MCP restart | `scripts/canvas.mjs`, `scripts/canvas-smoke.mjs`, `pnpm canvas:smoke`, `docs/cli.md`, CI `canvas:smoke` step | Proven locally for demo import, list, search, and context export against a throwaway local home |
| Local install readiness is machine-readable | `scripts/doctor.mjs`, `pnpm doctor:json`, `docs/operator-loop.md`, `docs/install.md`, CI `doctor:json` step | Proven locally for pass/warn/fail health output with repo root, data home, MCP CLI path, Codex config path, checks, and next steps |
| GitHub/release readiness is machine-checkable | `scripts/release-audit.mjs`, `pnpm release:audit`, `docs/release-audit.md`, CI `release:audit` step | Proven locally for required OSS/community files, docs, examples, scripts, CI gates, demo proof, visual evidence, env hygiene, tracked/staged public files, and runtime-data safety |
| Public contributor governance exists | `CODE_OF_CONDUCT.md`, `SUPPORT.md`, `GOVERNANCE.md`, `MAINTAINERS.md`, `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/config.yml`, `.github/pull_request_template.md` | Proven locally for project norms, support routing, governance boundaries, maintainer duties, CODEOWNERS placeholder, security-reporting contact link, and PR verification checklist |
| Codex MCP can be installed safely | `scripts/install-codex-mcp.mjs`, `pnpm mcp:install:codex`, timestamped backup before `--write`, dry-run verification, and `pnpm doctor` path/home checks | Proven locally |
| Setup and Codex status are visible in the app | `apps/web/app/api/setup/status/route.ts`, `Setup / MCP` panel in `apps/web/components/WorkspaceClient.tsx`, Playwright setup-panel assertion; server is considered wired only when config sections, CLI path, and canvas home match | Proven locally |
| Local data remains outside Git | `.gitignore`, `AGENT_CANVAS_HOME`, `packages/core/src/home.ts`, `pnpm doctor` | Proven by repo structure and doctor |
| Security scan is clean | `Invoke-RepoSecurityScan.ps1 -Path ...` passed on 2026-07-02 after generated cache cleanup | Proven locally |
| Public demo proves the product loop | `examples/demo-canvas.json`, `docs/demo-walkthrough.md`, `examples/mcp/README.md`, in-app `Demo` loader route; JSON parse check passed | Proven locally |
| Human and agent operating model is documented | `docs/operator-loop.md`, README docs index, MCP resource `starlight-agent-canvas://docs/operator-loop` | Proven locally |
| Visual QA passes 26/30+ | `docs/design-loop-evidence.json` validates and scores 28/30 | Proven locally |

## Current Known Gaps

- Citation chunks and answer metadata are visible in the inspector; deeper citation-to-node/chunk navigation remains future work.
- Browser tests still need broader coverage for PDF upload, edge creation, clipboard permission button behavior, and import conflict UX.
- Non-YouTube video links are safe references plus notes in v0.1; provider-specific transcript adapters are not implemented yet.
- Import preview/diff and selected-subgraph export are not yet implemented.
- Mac/Linux install screenshots are not yet captured.
- Public release still needs the final GitHub remote URL inserted after the repository is created or connected.
- Hosted deployment, auth, collaboration, billing, marketplace, and provider-backed AI actions remain v0.2+ decisions.
