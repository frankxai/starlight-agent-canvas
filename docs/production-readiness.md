# Production Readiness

Starlight Agent Canvas is ready for local production use when these gates pass:

```powershell
cd C:\Users\frank\starlight\repos\starlight-agent-canvas
C:\Users\frank\starlight\repos\security\Invoke-RepoSecurityScan.ps1 -Path .
pnpm doctor
pnpm verify
pnpm mcp:smoke
pnpm test:e2e
```

## Local Production Preview

```powershell
pnpm preview:prod
```

This builds core, MCP, and web, then starts the Next.js production server on `http://127.0.0.1:3101`.

## Seed The Operating Canvas

```powershell
pnpm seed:starlight
```

This creates or replaces `canvas-starlight-agent-canvas-os` under `AGENT_CANVAS_HOME`. Frank's default home is:

```text
C:\Users\frank\.starlight\agent-canvas
```

The seed canvas lays out the north star, technology stack, MCP boundary, workflows, mobile access, production gates, and implementation brief output.

Portable JSON import/export is part of the production boundary. Import must never silently overwrite an existing canvas; same-id imports are saved as copies unless a future explicit replace mode is added to a trusted admin path. Agent context export is also part of the boundary: it should remain deterministic, local, and safe to paste into Codex, Claude, Gemini, or another MCP-compatible agent.

## Environment

Required:

- Node.js 20.11 or newer.
- pnpm 11.7.0 or compatible.

Optional:

- `AGENT_CANVAS_HOME`: overrides local canvas data path.
- `AGENT_CANVAS_ALLOW_REMOTE=1`: intentionally allows API use beyond localhost.
- `FIRECRAWL_API_KEY`: only used when URL ingestion explicitly opts into Firecrawl.
- Provider keys such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, and `GOOGLE_GENERATIVE_AI_API_KEY`: reserved for future provider-backed actions.

## Release Path

1. Run local gates.
2. Verify MCP stdio smoke.
3. Capture desktop, mobile, and reduced-motion screenshots.
4. Commit to `main`.
5. Confirm the GitHub readiness checklist in `docs/github-readiness.md`.
6. If a Vercel project is intentionally connected later, deploy a preview first.
7. Verify the live URL before any production promotion.

## Current Boundary

The current repo has no remote configured and no Vercel project linked. The production path today is a local production Next server plus local MCP. Hosted deployment should be added only after deciding the public data, auth, and storage model.

## Concurrency Boundary

Canvas mutations use both an in-process queue and an atomic per-canvas file lock under `AGENT_CANVAS_HOME\.locks`. This protects local writes when the web app and multiple MCP clients operate on the same canvas at the same time.

The v0.1 store is still single-user and local-first. Hosted multi-user collaboration should move to an explicit database/history layer instead of sharing JSON files over a network filesystem.
