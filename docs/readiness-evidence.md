# Readiness Evidence Matrix

Last local verification: 2026-07-02.

This matrix connects the product promises in `docs/prd.md` and `docs/user-flows.md` to current evidence. It is intentionally practical: if a row cannot point to a command, screenshot, test, or file, it is not considered proven.

| Promise | Current Evidence | Status |
| --- | --- | --- |
| First screen is the usable workspace | `apps/web/components/WorkspaceClient.tsx`, `docs/scene-brief.md`, `docs/visual-qa/desktop-context-import-toolbar.png`, `docs/visual-qa/mobile-context-import-toolbar.png` | Proven locally |
| First-use canvas is actionable | Blank first-run canvas, interactive empty-state `Map`/`Note`/`Upload`, canvas toolbar `Note`, and right-rail empty inspector actions in `apps/web/components/WorkspaceClient.tsx` | Proven in UI code; visual evidence pending refresh |
| Intake preview shows what will be mapped | `intake-preview` and `rail-intake-preview` in `apps/web/components/WorkspaceClient.tsx`; Playwright preview chip assertions | Proven locally |
| User can paste/drop links, transcripts, files, and notes | Playwright `apps/web/tests/workspace.spec.ts`; web routes under `apps/web/app/api/canvases/[id]/ingest`; `pnpm test:e2e` passed | Proven for text, URL+notes, YouTube manual transcript, Markdown file upload, and paste-anywhere happy paths; more PDF/drop browser cases needed |
| YouTube is transcript-first with manual fallback | `packages/core/src/ingest.ts`, `docs/user-flows.md`, core ingest tests, Playwright YouTube manual transcript path | Proven locally |
| User can run local actions and inspect outputs | `packages/core/src/actions.ts`, `packages/core/src/__tests__/actions.test.ts`, Playwright `ask-canvas` path | Proven locally |
| JSON import/export is portable and non-destructive | `packages/core/src/store.ts`, `apps/web/app/api/canvases/import/route.ts`, `packages/core/src/__tests__/store.test.ts`, Playwright import path | Proven locally |
| Agent context packet is available | `packages/core/src/exporters.ts`, web `format=context` route, MCP `export_canvas` with `format: "context"`, live preview API check on 2026-07-02 | Proven locally |
| Source chunks and citations are available | `packages/core/src/chunks.ts`, `packages/core/src/actions.ts`, `packages/core/src/__tests__/actions.test.ts`, `packages/core/src/__tests__/store.test.ts`, inspector citation UI in `apps/web/components/WorkspaceClient.tsx` | Proven at core/UI level |
| Search results navigate back to graph evidence | Web search UI in `apps/web/components/WorkspaceClient.tsx`; Playwright search-focus assertion | Proven locally |
| Selected context is visible before actions | `selected-context` tray in `apps/web/components/WorkspaceClient.tsx`; Playwright assertion | Proven locally |
| MCP can read/write canvas state safely | `packages/mcp/src/index.ts`, `packages/mcp/src/tool-handlers.ts`, `pnpm mcp:smoke` passed with 14 tools | Proven locally |
| MCP can ingest text, URL, YouTube, and PDF sources | MCP tool schemas and smoke test include text/PDF; URL/YouTube handlers share core adapters | Proven for text/PDF smoke; URL/YouTube live network remains best-effort |
| MCP and web support graph positioning | Web drag persistence and MCP optional `position` inputs; MCP handler test asserts position | Proven locally |
| New users have a one-command setup path | `scripts/setup.mjs`, `pnpm setup:local`, install docs, dry-run command verification | Proven locally |
| Codex MCP can be installed safely | `scripts/install-codex-mcp.mjs`, `pnpm mcp:install:codex`, timestamped backup before `--write`, dry-run verification | Proven locally |
| Setup and Codex status are visible in the app | `apps/web/app/api/setup/status/route.ts`, `Setup / MCP` panel in `apps/web/components/WorkspaceClient.tsx`, Playwright setup-panel assertion | Proven locally |
| Local data remains outside Git | `.gitignore`, `AGENT_CANVAS_HOME`, `packages/core/src/home.ts`, `pnpm doctor` | Proven by repo structure and doctor |
| Security scan is clean | `Invoke-RepoSecurityScan.ps1 -Path ...` passed on 2026-07-02 after generated cache cleanup | Proven locally |
| Visual QA passes 26/30+ | `docs/design-loop-evidence.json` validates and scores 27/30 | Proven locally |

## Current Known Gaps

- Citation chunks and answer metadata are visible in the inspector; deeper citation-to-node/chunk navigation remains future work.
- Browser tests still need broader coverage for PDF upload, drag/drop positioning, edge creation, clipboard permission button behavior, and import conflict UX.
- Import preview/diff and selected-subgraph export are not yet implemented.
- Mac/Linux install screenshots are not yet captured.
- Hosted deployment, auth, collaboration, billing, marketplace, and provider-backed AI actions remain v0.2+ decisions.
