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

```powershell
# Use the clone URL from the GitHub Code button.
git clone https://github.com/<owner>/starlight-agent-canvas.git
cd starlight-agent-canvas
pnpm install
pnpm doctor
pnpm dev
```

The app starts on `http://localhost:3000` unless Next.js chooses another port.

Optional sample data:

```powershell
pnpm seed:starlight
```

This creates or refreshes `canvas-starlight-agent-canvas-os` in your configured `AGENT_CANVAS_HOME`.

## Install From Frank's Local Estate

```powershell
cd C:\Users\frank\starlight\repos\starlight-agent-canvas
pnpm install
pnpm doctor
pnpm seed:starlight
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
2. Paste a YouTube link, URL, transcript, or raw note into the top canvas composer.
3. Click `Map`.
4. Select the new node and edit its title/body in the inspector if needed.
5. Run `Summarize`, `Claims`, `Compare`, `Matrix`, `Build Brief`, or `Ask`.
6. Click `Context` when you want a clipboard-ready agent packet for Codex, Claude, Gemini, or another MCP-aware workflow.
7. Export JSON or Markdown from the canvas toolbar.
8. Re-import a JSON export later from the same toolbar when you want to rehydrate a canvas snapshot.
9. Build the MCP server with `pnpm mcp:build`.
10. Add the MCP config to Codex, Claude, Gemini, or another MCP client.
11. Ask the agent to list canvases and add a source node.
12. Keep building with the same shared canvas context.

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
pnpm mcp:smoke
```

Then copy the relevant config from:

- `.mcp.json`
- `examples/mcp/codex.toml`
- `examples/mcp/claude-desktop.json`
- `examples/mcp/gemini.md`

See `docs/mcp-setup.md` and `docs/codex-integration.md` for the operating workflow.

## Export Modes

- `JSON`: portable canvas state for import/re-hydration.
- `MD`: readable human handoff.
- `Context`: agent packet with metadata, operating contract, node index, evidence corpus, recent runs, and a continuation prompt.

## Troubleshooting

- `pnpm doctor` warns that the MCP server is not built: run `pnpm mcp:build`.
- The app cannot find canvases: check `AGENT_CANVAS_HOME`.
- Import creates a duplicate title: this is intentional when a JSON export has the same canvas id as an existing local canvas.
- Browser says the API is blocked from a remote host: this is intentional. Set `AGENT_CANVAS_ALLOW_REMOTE=1` only for a protected deployment.
- YouTube has no transcript: paste a manual transcript or notes with the URL.
- URL ingestion rejects a private host: local/private network URLs are blocked by default to prevent SSRF.
- Playwright fails on a fresh machine: run `pnpm --filter @starlight-agent-canvas/web exec playwright install --with-deps chromium`.
