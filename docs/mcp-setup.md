# MCP Setup

Starlight Agent Canvas exposes one local stdio MCP server. It gives agents a typed memory surface without destructive tools or external posting.

## Build First

```powershell
cd path\to\starlight-agent-canvas
pnpm mcp:build
pnpm mcp:config -- --client codex
pnpm mcp:config -- --client json
pnpm mcp:install:codex
pnpm mcp:smoke
pnpm mcp:codex:smoke
```

The smoke command starts the server over stdio, lists tools, creates a throwaway canvas in `.agent-canvas/mcp-smoke`, reads the latest canvas, ingests text, paste-anything mixed context, URL fallback, YouTube/manual transcript, generic video reference, enriches a reference-only video source, ingests image reference and PDF sources, connects nodes, updates node position, runs an action, searches artifacts, exports Markdown/JSON/context/Codex handoff, asserts chunk-manifest output, and imports the portable JSON back as local context.

The terminal CLI is a companion, not a replacement:

```powershell
pnpm canvas -- list
pnpm canvas -- export latest --format context
pnpm canvas -- export latest --format codex
pnpm canvas -- export latest --format codex --nodes source-youtube-nodeflow
pnpm canvas:smoke
```

It uses the same `AGENT_CANVAS_HOME` and is useful for install checks, scripts, or handing context to an agent before MCP is restarted.

## Codex

Generate a Codex config block for your machine:

```powershell
pnpm mcp:config -- --client codex
```

Use generated config for real clients because it prints absolute paths for the current machine. `.mcp.json` is a repo-local development hint for tools that understand project-relative MCP config; do not treat it as the preferred copy/paste block for Codex, Claude Desktop, or Gemini on another machine.

Or use the safe Codex installer:

```powershell
pnpm mcp:install:codex
pnpm mcp:install:codex -- --write
```

The first command is a dry-run. The second command updates `~/.codex/config.toml`, removes any previous `starlight-agent-canvas` MCP block, preserves unrelated settings, and writes a timestamped backup first.
Run `pnpm mcp:codex:smoke` when you want to prove the installer and doctor path without changing your real Codex config. It writes a temporary config, uses a temporary canvas home, verifies it through `doctor --config`, and cleans up.

The output shape is:

```toml
[mcp_servers.starlight-agent-canvas]
command = 'path\to\node.exe'
args = ["/absolute/path/to/starlight-agent-canvas/packages/mcp/dist/cli.js"]
startup_timeout_sec = 60

[mcp_servers.starlight-agent-canvas.env]
AGENT_CANVAS_HOME = "/absolute/path/to/.starlight/agent-canvas"
```

Frank's local home is `C:\Users\frank\.starlight\agent-canvas`; other users default to `<home>/.starlight/agent-canvas` unless `AGENT_CANVAS_HOME` is set.

See `docs/codex-integration.md` for the recommended Codex operating contract, prompts, and shared human/agent workflow.
See `docs/operator-loop.md` for the full human interaction, agent interaction, source semantics, and health contract.

## Claude Desktop / MCP-Compatible Clients

Generate a JSON config block for your machine:

```powershell
pnpm mcp:config -- --client json
```

The output shape is:

```json
{
  "mcpServers": {
    "starlight-agent-canvas": {
      "command": "C:/Program Files/nodejs/node.exe",
      "args": [
        "/absolute/path/to/starlight-agent-canvas/packages/mcp/dist/cli.js"
      ],
      "env": {
        "AGENT_CANVAS_HOME": "/absolute/path/to/.starlight/agent-canvas"
      }
    }
  }
}
```

For Claude Desktop, merge the `mcpServers.starlight-agent-canvas` entry into your Claude Desktop config, then restart Claude.

Common config locations:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

## Gemini / Other Agent Hosts

Use the same stdio shape when the host supports MCP servers:

- command: the Node executable printed by `pnpm mcp:config`.
- args: the built `packages/mcp/dist/cli.js` path printed by `pnpm mcp:config`.
- env: `AGENT_CANVAS_HOME=<home>/.starlight/agent-canvas` or your chosen local data path.

## Tools

- `list_canvases`
- `get_latest_canvas`
- `get_canvas`
- `create_canvas`
- `import_canvas`
- `add_node`
- `update_node`
- `enrich_source_node`
- `ingest_anything`
- `ingest_text_source`
- `ingest_url`
- `ingest_youtube`
- `ingest_video`
- `ingest_image`
- `ingest_pdf`
- `connect_nodes`
- `run_node_action`
- `search_artifacts`
- `export_canvas`

`import_canvas` is intentionally non-destructive by default: if the incoming JSON uses an id that already exists in the local home, the server saves it as a copy with a fresh id.

`export_canvas` supports:

- `json`: portable state for import.
- `markdown`: readable handoff.
- `context`: agent context packet with operating contract, node index, evidence corpus, recent runs, and continuation prompt.
- `codex`: ready-to-paste Codex continuation prompt that starts with MCP `get_canvas` for the canvas id and embeds the context packet as fallback.

`export_canvas` also accepts optional `nodeIds`. When present, every export format is scoped to those selected nodes, their linked artifacts/chunks, edges where both ends are selected, and action runs that used or produced selected nodes. Missing node ids are rejected instead of silently producing misleading context.

`get_latest_canvas` is the fastest read path for agents resuming a human-populated canvas. It returns the most recently updated canvas by default, plus `sourceReadiness` facts for each node so agents can tell which sources are Codex-ready and which still need transcript, OCR, notes, or readable page text. Use just its summary when `includeCanvas: false`.

`ingest_anything` mirrors the web app's paste-anything behavior for MCP clients. It accepts mixed pasted content, detects YouTube links, generic video links, image links, web URLs, and plain notes, then creates typed nodes and artifacts. When a media URL is followed by source-specific labels such as transcript, notes, timestamps, OCR, alt text, or visual observations, that text stays attached to the matching YouTube/video/image source instead of becoming a duplicate note node. The response includes `sourceReadiness` for the newly mapped nodes, including labels such as `Codex-ready transcript`, `Codex-ready video notes`, `Codex-ready visual notes`, `URL reference saved`, or `Needs visual text`. It accepts optional `canvasId`; when omitted, it uses the latest local canvas and creates a fresh local capture canvas only when none exists. It also accepts optional `runAction` when the agent should immediately summarize, extract claims, build a brief, or answer a question over only the newly mapped nodes.

`enrich_source_node` is the follow-up path for links that were mapped before transcript, OCR, excerpts, or notes were available. It accepts `body`, `enrichmentKind` (`transcript`, `timestamp_notes`, `ocr`, `visual_notes`, `claims`, or `notes`), optional `append`, optional `title`, and optional metadata. It updates the visible node and linked artifact together, rebuilds source chunks, returns fresh `sourceReadiness`, and records an intake trace with the new readiness label.

The web app exposes the matching local routes at `/api/canvases/:id/ingest/anything` and `/api/canvases/:id/nodes/:nodeId/enrich`. The first-viewport composer uses the intake route after client-side preview, and the inspector `Attach context` panel uses the enrichment route for selected sources.

`add_node`, `ingest_anything`, `ingest_text_source`, `ingest_url`, `ingest_youtube`, `ingest_video`, `ingest_image`, and `ingest_pdf` accept optional `{ x, y }` positions so agents can lay out context intentionally instead of only appending nodes to the default grid.

`search_artifacts` searches node text and durable source artifacts. Results include artifact ids, chunk ids, scores, and source metadata when available.

## Resources And Prompt

The server also exposes local guide resources:

- `starlight-agent-canvas://docs/install`
- `starlight-agent-canvas://docs/prd`
- `starlight-agent-canvas://docs/user-flows`
- `starlight-agent-canvas://docs/mcp-setup`
- `starlight-agent-canvas://docs/codex-integration`
- `starlight-agent-canvas://docs/operator-loop`
- `starlight-agent-canvas://docs/first-success`
- `starlight-agent-canvas://docs/demo-walkthrough`
- `starlight-agent-canvas://docs/technology-stack`
- `starlight-agent-canvas://docs/production-readiness`
- `starlight-agent-canvas://docs/readiness-evidence`

Prompt:

- `starlight_canvas_operator`

## Boundary

The server is local-only and non-destructive in v0.1. It does not delete canvases, post externally, scrape social platforms, spend money, alter external accounts, or require provider keys. `ingest_url`, `ingest_youtube`, `ingest_video`, and `ingest_image` are source intake tools that create local artifacts and nodes; `enrich_source_node` only updates existing local source context. Generic video links are saved as reference context with optional manual transcript or notes, while image links/uploads are saved with visual provenance and optional notes/OCR text.
