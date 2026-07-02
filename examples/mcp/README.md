# MCP Examples

Use generated config whenever possible. Static files in this folder are templates, not install scripts.

## Generate Local Config

```powershell
pnpm mcp:build
pnpm mcp:config -- --client codex
pnpm mcp:config -- --client json
pnpm mcp:install:codex
pnpm mcp:install:codex -- --write
pnpm mcp:smoke
```

`pnpm mcp:install:codex` is a dry-run. Add `-- --write` only when you want to update `~/.codex/config.toml`.

## Agent Workflow

Ask the MCP client:

```text
Use starlight-agent-canvas as the shared local research canvas.
List canvases and inspect the active canvas.
Create a new blank canvas titled "MCP agent workflow demo".
Ingest a YouTube URL with this manual transcript:
"The canvas should accept video links, transcripts, notes, PDFs, and web sources, then export a cited context packet for Codex."
Ingest this text source:
"Human note: the first viewport must expose Source, Note, and Ask modes."
Connect the two source nodes as references.
Run summarize on those nodes.
Search artifacts for "Source Note Ask".
Export the canvas with format "context".
Return the node ids, artifact ids, chunk ids, and export format you used.
```

Expected proof points:

- `ingest_youtube` uses `manualTranscript`.
- `ingest_text_source` creates a durable artifact.
- `connect_nodes` makes the relationship visible.
- `run_node_action` creates an output node.
- `search_artifacts` returns chunk-aware results.
- `export_canvas` with `format: "context"` returns an agent packet.
