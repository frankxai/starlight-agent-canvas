# First Success

First success means a person can clone the repo, open the canvas, add real context, inspect the result, and hand the same state to Codex through MCP or a Codex export.

Run the maintained contract:

```powershell
pnpm first-success
pnpm first-success:json
```

The JSON form is for agents, setup helpers, CI checks, and issue triage. It defines:

- the install-to-Codex phases
- the expected human action for each phase
- the proof command or artifact for each phase
- the input contracts for YouTube, video, images, URLs, PDFs, text, and notes
- the Codex MCP loop: `get_latest_canvas`, `ingest_anything`, `enrich_source_node`, `run_node_action`, `export_canvas`
- current v0.1 limits

The maintained source for the phases and supported-input mappings is `docs/first-success.contract.json`. The CLI, `/api/setup/status`, the in-app supported-input strip, and release audit all read or validate that same contract.

Write a local handoff artifact:

```powershell
pnpm first-success -- --out .agent-canvas/first-success.md
```

`.agent-canvas/` is ignored, so the artifact can include local machine context without becoming public repo content.

## The Contract Loop

1. Install: `node scripts/setup.mjs`.
2. Open: `pnpm dev`, or prove the local production boot path with `pnpm install:proof`.
3. Capture: paste/drop/upload/type source context in the first viewport.
4. Inspect: select the source/output and review receipts, chunks, citations, and body text.
5. Handoff: copy `Context`, copy `Codex`, or export from CLI.
6. Codex: prove the generated config with `pnpm mcp:codex:smoke`, wire MCP when ready, restart Codex, and operate on the latest canvas.

The same loop is visible in the app through `Setup / MCP`, enforced by `pnpm release:audit`, and included in the adoption report.
