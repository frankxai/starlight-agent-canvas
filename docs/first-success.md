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
- the Codex MCP loop: `get_latest_canvas`, `ingest_anything`, `run_node_action`, `export_canvas`
- current v0.1 limits

Write a local handoff artifact:

```powershell
pnpm first-success -- --out .agent-canvas/first-success.md
```

`.agent-canvas/` is ignored, so the artifact can include local machine context without becoming public repo content.

## The Contract Loop

1. Install: `node scripts/setup.mjs`.
2. Open: `pnpm dev`.
3. Capture: paste/drop/upload/type source context in the first viewport.
4. Inspect: select the source/output and review receipts, chunks, citations, and body text.
5. Handoff: copy `Context`, copy `Codex`, or export from CLI.
6. Codex: wire MCP, restart Codex, and operate on the latest canvas.

The same loop is visible in the app through `Setup / MCP`, enforced by `pnpm release:audit`, and included in the adoption report.
