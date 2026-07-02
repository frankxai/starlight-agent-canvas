# Activation Runway

The activation runway is the first successful loop for Starlight Agent Canvas. It is shared by the README, install docs, in-app `Setup / MCP` panel, `/api/setup/status`, and Codex operating prompts.

## The Five Steps

1. Install and health
   - Run `node scripts/setup.mjs`.
   - This installs dependencies, builds MCP, runs doctor, smoke-tests MCP, smoke-tests temporary Codex config installation plus launch, seeds the Starlight canvas, and prints Codex config as a dry-run.
   - Proof: `pnpm doctor:json` has `summary.fail === 0`.
   - First-success contract: `pnpm first-success` shows the maintained install-to-Codex path.
   - Adoption snapshot: `pnpm adoption:report` shows install, release, demo, visual, GitHub, and Codex status in one place.

2. Load proof canvas
   - Click `Demo` in the web app, or import `examples/demo-canvas.json`.
   - Proof: the canvas has source nodes, artifacts, chunks, citations, output nodes, and exportable context.

3. Map your own source
   - Paste or drop a YouTube/video link, image, transcript, URL, PDF, file, or note.
   - Use `Map + Brief` for immediate synthesis, or `Map only` when you want raw source nodes first.
   - Proof: a source node is selected and the inspector shows a context receipt.

4. Export context
   - Click `Context` for a general agent packet.
   - Click `Codex` for a ready-to-paste continuation prompt.
   - Select nodes first when the next agent turn should stay scoped to specific evidence.

5. Wire Codex MCP
   - Run `pnpm mcp:install:codex -- --write`.
   - Run `pnpm mcp:codex:smoke` when you want a safe temp-config proof before or after the real write. It verifies doctor checks, launches the configured MCP server, and calls safe read tools without touching your real config.
   - Restart Codex.
   - Run `pnpm doctor` again and confirm the Codex server, CLI path, and `AGENT_CANVAS_HOME` match.

## Codex Activation Prompt

```text
Use starlight-agent-canvas as shared local context.
Find the most recently updated canvas, read it before writing, identify the source nodes and artifacts that matter, run one useful action, then export format "codex".
Return the node ids, artifact ids, chunk ids, and every node/action you changed.
```

## Machine-Readable Contract

The app exposes the same runway at:

```text
GET /api/setup/status
```

Look for:

- `activation.steps`
- `activation.firstRunCheckCommand`
- `activation.previewCommand`
- `activation.codexPrompt`
- `firstSuccess.phases`
- `firstSuccess.proofCommands`

This lets browser tests, local agents, and setup automation verify the same journey a human sees in the UI.

## Verification Commands

```powershell
pnpm doctor:json
pnpm first-success:json
pnpm adoption:report:json
pnpm first-run:check
pnpm canvas:smoke
pnpm mcp:smoke
pnpm mcp:codex:smoke
pnpm test:e2e
```

`pnpm first-run:check` is the best non-interactive proof for a fresh install: it builds the production app, starts a temporary preview with a temporary data home, checks setup status, imports the demo canvas, verifies context export, and shuts down cleanly.
