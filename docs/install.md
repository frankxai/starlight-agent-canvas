# Install And First Run

This guide is for people trying Starlight Agent Canvas from GitHub and for local operators wiring it into Codex, Claude, Gemini, or another MCP host.

## What You Get

- A local web canvas for notes, URLs, YouTube transcripts, PDFs, text files, and agent outputs.
- A file-backed data home outside the repo.
- A safe stdio MCP server so agents can read, add to, run actions on, import, and export the same canvas as JSON, Markdown, or an agent context packet.
- Deterministic local actions that work without model provider keys.

## Requirements

- Node.js 20.11 or newer.
- pnpm 11.7 or compatible.
- Git.
- Optional: Playwright browsers for `pnpm test:e2e`.

If pnpm is missing, use Corepack:

```powershell
corepack enable
corepack prepare pnpm@11.7.0 --activate
```

## Install From GitHub

Fast path:

```powershell
# Use the clone URL from this repository's GitHub Code button or project release page.
git clone <repo-url>
cd starlight-agent-canvas
corepack enable
corepack prepare pnpm@11.7.0 --activate
node scripts/setup.mjs
pnpm dev
```

The app starts on `http://localhost:3000` unless Next.js chooses another port.

Already installed dependencies, or reviewing a pull request branch:

```powershell
pnpm install
node scripts/setup.mjs --skip-install
pnpm dev
```

Need the full verification path after setup:

```powershell
node scripts/setup.mjs --verify
```

The setup script:

1. Runs `pnpm install`.
2. Runs `pnpm doctor`.
3. Builds the MCP server.
4. Runs the MCP smoke test against a throwaway local data home.
5. Seeds the `Starlight Agent Canvas OS` local canvas.
6. Prints the Codex MCP config block as a dry-run.

Optional flags:

```powershell
node scripts/setup.mjs --skip-install
node scripts/setup.mjs --verify
node scripts/setup.mjs --codex-write
node scripts/setup.mjs --skip-smoke
node scripts/setup.mjs --skip-seed
```

`--codex-write` updates `~/.codex/config.toml` and creates a timestamped backup first.

`pnpm doctor` verifies the local prerequisites, workspace files, built MCP server, `.mcp.json`, and Codex wiring. The Codex check only reports fully wired when the installed config points at this repository's current `packages/mcp/dist/cli.js` and the active `AGENT_CANVAS_HOME`.

Manual sample data:

```powershell
pnpm seed:starlight
```

This creates or refreshes `canvas-starlight-agent-canvas-os` in your configured `AGENT_CANVAS_HOME`.

Terminal canvas operations:

```powershell
pnpm canvas -- demo
pnpm canvas -- list
pnpm canvas -- export latest --format context --out .agent-canvas/demo-context.md
pnpm canvas:smoke
```

The CLI, web app, and MCP server operate over the same local store. See `docs/cli.md`.

## Install From Frank's Local Estate

```powershell
cd C:\Users\frank\starlight\repos\starlight-agent-canvas
pnpm setup:local -- --skip-install --codex-write
pnpm dev
```

Frank's default data home is:

```text
C:\Users\frank\.starlight\agent-canvas
```

To use a different local home:

```powershell
$env:AGENT_CANVAS_HOME="D:\agent-canvas-data"
pnpm dev
```

## First Ten Minutes

1. Open the web app.
2. Check the `Setup / MCP` panel for data home, MCP build, and Codex wiring status.
3. Click `Demo` in the first-viewport composer when you want an immediate working proof canvas.
4. Inspect the selected YouTube source receipt: source kind, ingest method, chunks, source URL, and character count.
5. Use `Context` to copy a full clipboard-ready agent packet for Codex, Claude, Gemini, or another MCP-aware workflow.
6. Use the first-viewport quick starters: `Video`, `Web`, `Note`, or `Ask` when you want to start from your own material.
7. Paste or drop YouTube links, Loom/Vimeo/direct video links, URLs, transcripts, PDFs, files, and raw source text.
8. Use the `Drop -> Map -> Ask -> Handoff` loop as the mental model.
9. Keep the default `Map + Brief` when you want an immediate output node, or switch to `Map only` when you want raw source nodes first.
10. Inspect the new source/output pair on the canvas and the selected node in the inspector.
11. Select a source node and inspect the context receipt: source kind, ingest method, chunks, URL/file, and character count.
12. Run `Source summary`, `Extract claims`, or `Ask selected` when you want the action scoped to only that source.
13. Use the action drawer for multi-node or whole-canvas `Summarize`, `Claims`, `Compare`, `Matrix`, `Build Brief`, or `Ask`.
14. Click `Copy source` for selected-source context, or `Context` when you want the full canvas packet.
15. Export JSON or Markdown from the canvas toolbar.
16. Re-import a JSON export later from the same toolbar when you want to rehydrate a canvas snapshot.
17. Manual import of `examples/demo-canvas.json` remains available when you want to test portable JSON import directly.
18. Build the MCP server with `pnpm mcp:build`.
19. Add the MCP config to Codex, Claude, Gemini, or another MCP client.
20. Run `pnpm doctor` to confirm Codex points at this MCP server.
21. Ask the agent to list canvases and add a source node.
22. Keep building with the same shared canvas context.

## Input Behavior

| Input | Result |
| --- | --- |
| YouTube URL | Transcript/captions when available; manual transcript fallback; `source_youtube` node |
| Loom/Vimeo/Wistia/TikTok/Drive/Dropbox/direct video URL | Safe URL source plus `media: video_reference`; attach transcript or notes for analysis |
| Web URL | Bounded readable-text fetch or safe reference fallback |
| PDF | Local text extraction into PDF artifact |
| Markdown/text/JSON/CSV/log | Manual source artifact with chunks |
| Note | Editable note node usable as context |

## Production Local Preview

```powershell
pnpm preview:prod
```

This builds the monorepo and starts the production Next.js server on `http://127.0.0.1:3101`.

## MCP Setup

```powershell
pnpm mcp:build
pnpm mcp:config -- --client codex
pnpm mcp:config -- --client json
pnpm mcp:install:codex
pnpm mcp:install:codex -- --write
pnpm mcp:smoke
```

`pnpm mcp:install:codex` is a dry-run. It prints the target config path and the exact TOML block. Add `-- --write` to install or replace only the `starlight-agent-canvas` MCP sections in Codex config, preserving unrelated settings and creating a backup first.

You can still copy the relevant config from:

- `.mcp.json`
- `examples/mcp/codex.toml`
- `examples/mcp/claude-desktop.json`
- `examples/mcp/gemini.md`

See `docs/mcp-setup.md` and `docs/codex-integration.md` for the operating workflow.

## Export Modes

- `JSON`: portable canvas state for import/re-hydration.
- `MD`: readable human handoff.
- `Context`: agent packet with metadata, operating contract, node index, evidence corpus, recent runs, and a continuation prompt.

The same exports are available from the terminal with `pnpm canvas -- export <canvas-id|latest> --format json|markdown|context`.

## Troubleshooting

- `pnpm doctor` warns that the MCP server is not built: run `pnpm mcp:build`.
- `pnpm doctor` says Codex has a path/home mismatch: run `pnpm mcp:install:codex -- --write`, restart Codex, then run `pnpm doctor` again.
- The app cannot find canvases: check `AGENT_CANVAS_HOME`.
- Import creates a duplicate title: this is intentional when a JSON export has the same canvas id as an existing local canvas.
- Browser says the API is blocked from a remote host: this is intentional. Set `AGENT_CANVAS_ALLOW_REMOTE=1` only for a protected deployment.
- YouTube has no transcript: paste a manual transcript or notes with the URL.
- URL ingestion rejects a private host: local/private network URLs are blocked by default to prevent SSRF.
- Playwright fails on a fresh machine: run `pnpm --filter @starlight-agent-canvas/web exec playwright install --with-deps chromium`.
