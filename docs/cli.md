# Local Canvas CLI

The local CLI is the terminal companion to the web app and MCP server. It uses the same file-backed store under `AGENT_CANVAS_HOME`, so a canvas imported in the CLI appears in the browser and is readable by Codex/Claude/Gemini through MCP.

## Commands

```powershell
pnpm canvas -- list
pnpm canvas -- demo
pnpm canvas -- import examples/demo-canvas.json
pnpm canvas -- export latest --format context --out .agent-canvas/demo-context.md
pnpm canvas -- export latest --format codex --out .agent-canvas/demo-codex.md
pnpm canvas -- export latest --format codex --nodes source-youtube-nodeflow --out .agent-canvas/demo-selected-codex.md
pnpm canvas -- export <canvas-id> --format json
pnpm canvas -- search "Codex context handoff"
pnpm canvas -- show latest
```

Use `--json` with `list`, `demo`, `import`, and `search` when another script or agent needs structured output.

Use `--home <path>` to operate against a specific local data home without changing your shell environment:

```powershell
pnpm canvas -- list --home C:\Users\frank\.starlight\agent-canvas
```

## Safety

- The CLI has no delete command.
- Imports are non-destructive. If an incoming canvas id already exists, the store saves a copy with a fresh id.
- Export defaults to `context` because the most common terminal use is an agent handoff packet.
- `json`, `markdown`, `context`, and `codex` export formats match the core/web export behavior.
- Use `--format codex` when you want a ready-to-paste Codex prompt that instructs Codex to resume with MCP `get_canvas` and includes the context packet as fallback.
- Use `--nodes node-a,node-b` when the human has selected a smaller evidence set and the handoff should include only those nodes, linked artifacts/chunks, selected-internal edges, and related runs.

## Smoke Test

```powershell
pnpm canvas:smoke
```

The smoke test uses a throwaway local home at `.agent-canvas/cli-smoke`, imports the bundled demo, lists canvases, searches artifacts, exports a context packet, exports full and selected Codex handoff prompts, and asserts that both include the expected source and resume evidence.
