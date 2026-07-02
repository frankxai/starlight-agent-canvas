# Demo Walkthrough

`examples/demo-canvas.json` is the fastest way to see what the product is meant to be.

It proves the complete v0.1 loop:

- A YouTube/manual transcript source becomes a `source_youtube` node.
- A URL benchmark and human note become durable source artifacts.
- Artifacts include chunk ids that can be cited by actions and agents.
- `Map + Brief` creates an output node connected to the source map.
- A Codex handoff output explains how to continue with `export_canvas` using `format: "context"`.

## Try It In The Web App

1. Start the app.

```powershell
pnpm dev
```

2. Open the canvas.
3. Click `Import` in the canvas toolbar.
4. Choose `examples/demo-canvas.json`.
5. Select `Nodeflow-style video source`.
6. Inspect the source receipt: kind, ingest mode, chunk count, source URL, and chunk preview.
7. Click `Source summary`, `Extract claims`, or `Ask selected`.
8. Click `Context` in the toolbar to copy the full agent context packet.
9. Export JSON if you want to re-import the same portable graph later.

## Try The Same Loop Through MCP

Build and smoke-test the stdio server:

```powershell
pnpm mcp:build
pnpm mcp:smoke
```

Then ask Codex, Claude, Gemini, or another MCP host:

```text
Use starlight-agent-canvas.
List canvases.
Import the JSON from examples/demo-canvas.json.
Inspect the imported canvas.
Run answer_question on the YouTube source:
"What product capabilities and gaps does this source imply?"
Export the canvas with format "context".
Summarize the node ids and chunk ids you used.
```

## Expected Result

The imported canvas should contain:

- 5 nodes
- 4 edges
- 2 action runs
- 3 artifacts
- chunk ids such as `artifact-youtube-nodeflow:chunk-001`
- citation metadata on the `Map + Brief output`

The context export should include:

- `Agent Context Packet`
- `Source Chunk Manifest`
- `Nodeflow-style video source`
- `Codex context handoff`

## Why This Matters

The demo is not fake product copy. It is portable canvas state. If import, source receipts, actions, chunk citations, and context export all work on this file, the core product promise is visible before anyone wires a model provider or hosted account.
