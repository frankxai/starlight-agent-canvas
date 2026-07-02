# Codex Integration

Starlight Agent Canvas gives Codex a shared local context surface. The human can map sources visually, and Codex can operate through safe MCP tools instead of guessing from chat history alone.

## Setup

Fast path:

```powershell
node scripts/setup.mjs --codex-write
```

This installs dependencies, runs doctor, builds and smoke-tests the MCP server, seeds the Starlight OS canvas, then updates Codex config with a timestamped backup.

Manual path:

```powershell
pnpm mcp:build
pnpm mcp:smoke
pnpm mcp:config -- --client codex
pnpm mcp:install:codex
pnpm mcp:install:codex -- --write
```

`pnpm mcp:install:codex` is a dry-run by default. Add `-- --write` only when you want it to update `~/.codex/config.toml`. The installed block shape is:

```toml
[mcp_servers.starlight-agent-canvas]
command = 'path\to\node.exe'
args = ["/absolute/path/to/starlight-agent-canvas/packages/mcp/dist/cli.js"]
startup_timeout_sec = 60

[mcp_servers.starlight-agent-canvas.env]
AGENT_CANVAS_HOME = "/absolute/path/to/.starlight/agent-canvas"
```

Run `pnpm doctor` any time the local setup feels uncertain.
It verifies that Codex has the `starlight-agent-canvas` server/env blocks and that they point at this repo's current built MCP CLI plus the active `AGENT_CANVAS_HOME`.
It also verifies that the built core/MCP artifacts include the current video and image node/tool schema, which catches stale MCP builds after source media support changes.
The in-app `Setup / MCP` panel also exposes the activation runway and a copyable Codex activation prompt backed by `/api/setup/status`.

When Codex or another agent needs parseable setup state, run:

```powershell
pnpm doctor:json
```

Use `summary.fail === 0` as the local health gate. Optional Codex wiring can still appear as warnings until the user chooses `pnpm mcp:install:codex -- --write` and restarts Codex.

Optional terminal bridge:

```powershell
pnpm canvas -- list
pnpm canvas -- demo
pnpm canvas -- export latest --format context --out .agent-canvas/latest-context.md
pnpm canvas -- export latest --format codex --out .agent-canvas/latest-codex.md
```

Use `context` when Codex should receive a self-contained evidence packet. Use `codex` when you want a ready-to-paste continuation prompt that names the canvas id, tells Codex to call MCP `get_canvas`, and embeds the context packet as fallback. Add `--nodes <id,id>` when the human selected a smaller evidence set.

## Agent Operating Contract

Codex should treat the canvas as a typed local context layer:

- Read before writing when a canvas already exists.
- Check `pnpm doctor:json` when MCP setup or data-home state is uncertain.
- Add source nodes for durable evidence, not one-off chat snippets.
- Run actions to create output nodes that the human can inspect.
- Cite node ids and chunk ids when using source-grounded answers or context packets.
- Prefer `update_node` for human-readable cleanup over creating duplicate nodes.
- Export `codex` when Codex needs a ready continuation prompt, `context` when any agent needs a self-contained packet, `markdown` for human handoff, and `json` for portable rehydration.
- Pass `nodeIds` to `export_canvas` when the human has selected sources/notes and Codex should stay scoped to that evidence.
- Import portable JSON when a user gives Codex a saved canvas snapshot that should become active local context again.
- Never assume destructive tools exist; v0.1 intentionally has no delete or external-posting tools.

## Recommended Prompt

```text
Use the starlight-agent-canvas MCP server as shared local context.
List canvases, inspect the active Starlight canvas, add new evidence as nodes,
run the smallest useful action, and export `codex` when the workflow needs a Codex continuation prompt.
Keep mutations explicit and summarize every node/action you changed.
```

For implementation continuation, prefer `export_canvas` with `format: "codex"` over Markdown. The Codex handoff includes the exact MCP resume instruction plus the full context packet. Use `format: "context"` when the next consumer is another MCP-compatible agent or an issue/PR artifact.

## Common Codex Moves

- `list_canvases`: find the active local canvas.
- `get_canvas`: inspect current graph state before editing.
- `import_canvas`: rehydrate a portable JSON canvas export without overwriting an existing local canvas.
- `ingest_text_source`: add pasted research, transcripts, repo notes, or meeting notes.
- `ingest_url`: add a public URL as source context.
- `ingest_youtube`: add a YouTube URL plus optional manual transcript.
- `ingest_video`: add a Loom, Vimeo, direct video, Drive, Dropbox, or similar video URL plus optional manual transcript/notes.
- `ingest_image`: add an image URL or local PNG/JPEG/WebP/GIF/AVIF bytes plus optional visual notes/OCR text.
- `ingest_pdf`: add a base64 PDF as a local PDF source artifact.
- `add_node`: create note, prompt, MCP tool, agent run, or output nodes.
- `update_node`: clean up titles, bodies, metadata, or positions.
- `connect_nodes`: make evidence relationships explicit.
- `run_node_action`: summarize, compare, build matrix, build brief, or answer a question.
- `search_artifacts`: find local source material across canvases, including artifact and chunk ids when available.
- `export_canvas`: produce JSON, Markdown, an agent context packet, or a ready-to-paste Codex handoff; pass `nodeIds` for selected evidence only.

If MCP is temporarily unavailable, `pnpm canvas -- export latest --format codex` produces the same ready-to-paste Codex prompt from the shared store. `--format context` remains the general agent packet.
If setup health is uncertain, `pnpm doctor:json` gives Codex a structured checklist without requiring it to parse terminal prose.

For graph layout, pass `position: { x, y }` when creating or ingesting nodes. Use this for agent-generated canvases so human review starts from a coherent visual map.

## Human Interaction Pattern

1. Human drops messy context into the canvas.
2. Human uses `Video`, `Web`, `Note`, or `Ask` quick starters to map the context into visible nodes.
3. Codex reads the canvas and proposes the next action.
4. Human approves or edits nodes directly.
5. Codex runs an action and creates an output node.
6. Human exports or asks Codex to continue implementation from the output.
7. Later, either side can import the JSON export to resume the same graph as durable context.

When the human clicks `Context` in the UI, the app copies the same agent context packet that MCP exposes through `export_canvas` with `format: "context"`. When the human clicks `Codex`, the app copies the `format: "codex"` handoff prompt, which tells Codex to resume with `get_canvas` against the current canvas id and embeds the context packet as fallback. If nodes are selected, both buttons export only the selected nodes, their linked artifacts/chunks, selected-internal edges, and related runs. Cite node ids and chunk ids from either export when making claims.

When the human clicks `Copy source` in a selected node receipt, Codex should treat that as a narrower source-only packet. Use it when the task is about one YouTube video, image, PDF, page, or note instead of the whole canvas.

For non-YouTube video links, Codex should use `ingest_video` or treat the UI-created `source_video` node as a video reference unless transcript text or notes were provided. The app preserves `media: video_reference` provenance so agents do not overstate what was extracted.

For image links or screenshots, Codex should use `ingest_image` or treat the UI-created `source_image` node as visual evidence. The app preserves `imageUrl` or `imageDataUrl` provenance and expects useful visual notes/OCR text in the node body until provider-backed vision extraction is added.

## Happy Path Transcript

Use this as a smoke prompt after wiring Codex:

```text
Use starlight-agent-canvas.
List canvases.
Import examples/demo-canvas.json as local canvas state.
Read the imported canvas.
Run answer_question on source-youtube-nodeflow:
"What should we build next to make this canvas feel closer to Poppy AI or Nodeflow while staying MCP-native?"
Export the canvas with format "codex".
Return the node ids, artifact ids, and chunk ids you used.
```

## Human-Populated Canvas Prompt

After the human has pasted or dropped sources in the UI, use:

```text
Use starlight-agent-canvas.
Find the most recently updated canvas.
Read the canvas before writing.
Identify the source nodes and artifacts that look most relevant.
Run one useful action over the selected evidence.
Export format "codex" and summarize the node ids, artifact ids, chunk ids, and changes you made.
```

## Selected Evidence Prompt

When the human has selected one or more sources/notes in the canvas:

```text
Use starlight-agent-canvas.
Read the current canvas, but keep this turn scoped to these selected node ids:
<paste node ids from the selected context tray>.
Run one useful selected-source action if needed.
Export the canvas with format "codex" and nodeIds set to those selected ids.
Return only claims supported by the selected node/chunk ids.
```

## Safety Notes

- Canvas data is local under `AGENT_CANVAS_HOME`.
- Tools do not post externally, spend money, mutate accounts, or delete canvases.
- URL ingestion blocks private/localhost targets by default.
- Provider-backed AI is intentionally deferred; v0.1 actions are deterministic.
