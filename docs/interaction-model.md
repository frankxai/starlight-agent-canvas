# Human-Agent Interaction Model

Starlight Agent Canvas is a shared local context loop. The human can populate the graph from the browser, and Codex, Claude, Gemini, or another MCP client can read and add to the same graph through safe local tools.

## Operating Contract

```mermaid
flowchart LR
  human["Human paste / drop / note / upload"] --> intake["Intake detector"]
  intake --> graph["Typed nodes on canvas"]
  graph --> artifacts["Artifacts, chunks, readiness"]
  artifacts --> actions["Local actions and cited answers"]
  actions --> handoff["Context / Codex export"]
  mcp["MCP client"] --> graph
  graph --> mcp
```

The browser, CLI, and MCP server are expected to point at the same `AGENT_CANVAS_HOME`. `pnpm doctor` warns when `.mcp.json` or Codex config would split local state into a different data home.

## Human Populate Path

1. Start from `New`, `Demo`, `Video`, `Image`, `Web`, `Note`, or `Ask`.
2. Paste or drop a YouTube link, generic video link, image, web URL, PDF, text file, transcript, OCR, note, or mixed research blob.
3. Review the map preview: node kind, artifact kind, readiness, and optional output action.
4. Choose `Map + Brief`, `Claims`, `Ask`, or `Map only`.
5. Inspect the latest intake receipt and selected source readiness.
6. Attach missing transcript, OCR, timestamp notes, claims, or excerpts when a source is reference-only.
7. Ask, export, or hand off only the selected evidence when scope matters.

## Agent Populate Path

MCP clients should mirror the browser path instead of writing raw files:

1. `get_latest_canvas` to read current nodes, source readiness, and intake traces.
2. `ingest_anything` for mixed pasted material.
3. `enrich_source_node` when a saved source later gets transcript, OCR, visual notes, claims, or excerpts.
4. `run_node_action` for summarize, claims, compare, matrix, implementation brief, or cited ask.
5. `export_canvas` with `format: "codex"` or `format: "context"` for handoff.

Agents must report node ids, artifact ids, chunk ids, and run ids they changed. v0.1 intentionally avoids destructive or external-posting tools.

## Shared State Rules

- Sources are useful only when they become typed nodes plus artifacts and chunks.
- Bare video/image/web references are allowed, but readiness must show whether they need transcript, OCR, notes, claims, excerpts, or readable text.
- Notes are first-class context and should enter the same receipt and export loop as sources.
- Selection is scope. If nodes are selected, Context/Codex export should include selected evidence and linked artifacts, not unrelated graph material.
- Handoff is reviewable. The human should be able to inspect what Codex will receive before leaving the browser.

## First-Success Proof

A working install proves:

1. Browser can create/open a canvas.
2. Browser can map at least one source or note.
3. Source readiness and intake trace are visible.
4. `pnpm mcp:codex:smoke` can launch the configured server and list safe tools.
5. A Codex handoff export can be copied from browser, CLI, API, or MCP.
