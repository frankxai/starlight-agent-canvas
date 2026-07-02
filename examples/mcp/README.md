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
Get the latest canvas, or list canvases and inspect the active canvas if you need a specific one.
Create a new blank canvas titled "MCP agent workflow demo".
Use ingest_anything for this pasted source blob and run summarize on the new nodes:
"https://vimeo.com/987654321
Manual notes: this generic video explains how a human and Codex share one context canvas."
Ingest a YouTube URL with this manual transcript:
"The canvas should accept video links, transcripts, notes, PDFs, and web sources, then export a cited context packet for Codex."
Ingest a Vimeo URL with this manual transcript:
"Generic video links become source_video nodes with video artifacts when captions are not fetched automatically."
Ingest this text source:
"Human note: the first viewport must expose Source, Note, and Ask modes."
Connect the source nodes as references.
Run summarize on those nodes.
Search artifacts for "Source Note Ask".
Export the canvas with format "codex".
Export the canvas again with format "codex" and nodeIds set to the YouTube node id.
Return the node ids, artifact ids, chunk ids, and export format you used.
```

Expected proof points:

- `get_latest_canvas` resumes the active human/agent canvas.
- `ingest_anything` mirrors the web paste-anything path and can run an action over newly mapped nodes.
- `ingest_youtube` uses `manualTranscript`.
- `ingest_video` creates a `source_video` node and `video` artifact.
- `ingest_text_source` creates a durable artifact.
- `connect_nodes` makes the relationship visible.
- `run_node_action` creates an output node.
- `search_artifacts` returns chunk-aware results.
- `export_canvas` with `format: "context"` returns an agent packet.
- `export_canvas` with `format: "codex"` returns a Codex-ready continuation prompt with the context packet embedded.
- `export_canvas` with `nodeIds` returns a scoped handoff that excludes unrelated nodes and artifacts.
