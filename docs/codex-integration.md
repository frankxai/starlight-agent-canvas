# Codex Integration

Starlight Agent Canvas gives Codex a shared local context surface. The human can map sources visually, and Codex can operate through safe MCP tools instead of guessing from chat history alone.

## Setup

Build the MCP server:

```powershell
pnpm mcp:build
pnpm mcp:smoke
```

Add this to Codex MCP config, adjusting paths if your clone lives elsewhere:

```toml
[mcp_servers.starlight-agent-canvas]
command = 'C:\Program Files\nodejs\node.exe'
args = ["C:/Users/frank/starlight/repos/starlight-agent-canvas/packages/mcp/dist/cli.js"]
startup_timeout_sec = 60

[mcp_servers.starlight-agent-canvas.env]
AGENT_CANVAS_HOME = "C:/Users/frank/.starlight/agent-canvas"
```

Run `pnpm doctor` any time the local setup feels uncertain.

## Agent Operating Contract

Codex should treat the canvas as a typed local context layer:

- Read before writing when a canvas already exists.
- Add source nodes for durable evidence, not one-off chat snippets.
- Run actions to create output nodes that the human can inspect.
- Prefer `update_node` for human-readable cleanup over creating duplicate nodes.
- Export Markdown when handing a canvas result back into a PRD, issue, or implementation brief.
- Never assume destructive tools exist; v0.1 intentionally has no delete or external-posting tools.

## Recommended Prompt

```text
Use the starlight-agent-canvas MCP server as shared local context.
List canvases, inspect the active Starlight canvas, add new evidence as nodes,
run the smallest useful action, and export Markdown when the workflow needs a handoff.
Keep mutations explicit and summarize every node/action you changed.
```

## Common Codex Moves

- `list_canvases`: find the active local canvas.
- `get_canvas`: inspect current graph state before editing.
- `ingest_text_source`: add pasted research, transcripts, repo notes, or meeting notes.
- `ingest_url`: add a public URL as source context.
- `ingest_youtube`: add a YouTube URL plus optional manual transcript.
- `add_node`: create note, prompt, MCP tool, agent run, or output nodes.
- `update_node`: clean up titles, bodies, metadata, or positions.
- `connect_nodes`: make evidence relationships explicit.
- `run_node_action`: summarize, compare, build matrix, build brief, or answer a question.
- `search_artifacts`: find local source material across canvases.
- `export_canvas`: produce JSON or Markdown for handoff.

## Human Interaction Pattern

1. Human drops messy context into the canvas.
2. Codex reads the canvas and proposes the next action.
3. Human approves or edits nodes directly.
4. Codex runs an action and creates an output node.
5. Human exports or asks Codex to continue implementation from the output.

## Safety Notes

- Canvas data is local under `AGENT_CANVAS_HOME`.
- Tools do not post externally, spend money, mutate accounts, or delete canvases.
- URL ingestion blocks private/localhost targets by default.
- Provider-backed AI is intentionally deferred; v0.1 actions are deterministic.

