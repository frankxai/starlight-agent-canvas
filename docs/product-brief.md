# Product Brief

## Product

Starlight Agent Canvas is a local-first research/workflow canvas for agent-assisted work.

## Audience

- Frank and Starlight operators using Codex, Claude, Gemini, ACOS, SIS, and MCP tools.
- Builders who need a visible, portable context layer for research, planning, and implementation briefs.
- Creators who want source-backed workflows without locking their research into a closed SaaS.

## First Read

The first viewport must communicate: this is a working agent canvas where the canvas itself accepts sources, notes, actions, run logs, and MCP-safe state.

## v0.1 Promise

Turn mixed source material into reusable agent context, Codex continuation prompts, and implementation artifacts without requiring a hosted account or API key.

## v0.1 Capability Standard

- Paste or drop URLs, YouTube links, image URLs/screenshots, transcripts, PDFs, text files, Markdown, JSON, CSV, and raw notes.
- Start from the latest local canvas, one-click demo proof canvas, or a fresh blank canvas from the first viewport.
- Keep primary intake actions responsive: empty `Map` or `Ask` clicks focus the right composer and explain the next move instead of feeling disabled.
- Show the mapping contract before commit: source text previews the future node kind, artifact kind, readiness state, and output mode.
- Launch guided workflow templates for competitor teardown, repo/product planning, agent workflow design, and content synthesis.
- Show each template's stages and expected outcome before launch, then show a live Workflow Map after launch.
- Convert each source into a durable artifact plus typed node with provenance metadata.
- Create notes from the canvas composer or by double-clicking blank canvas space.
- Edit node titles and bodies in the inspector, then reuse the edited canvas as agent context.
- Ask source-grounded questions over selected nodes or the whole canvas.
- Click answer or run-log citations to return to the cited source node and chunk.
- Copy a ready Codex handoff that tells Codex which MCP canvas to resume and embeds the current context packet.
- See handoff readiness in the workspace: evidence, synthesis, selected scope, and Codex/MCP status are computed from live state.
- Export selected nodes as focused JSON, Markdown, context, or Codex handoff packets when the human wants the next agent turn constrained to specific evidence.
- Auto-select newly created source and action output nodes so answers and ingested context are immediately inspectable.
- Persist graph interaction: node drag positions, direct node connections, run outputs, and exports.
- Let MCP clients perform the same source ingest, node update, action, search, and export workflow.
- Give humans and agents the same operator contract through `docs/operator-loop.md`, MCP guide resources, `pnpm doctor`, and `pnpm doctor:json`.
- Keep the public GitHub surface credible with support, security, governance, maintainer, issue, PR, CODEOWNERS, CI, and release-audit gates.

## Non-Goals

- Multiplayer.
- Billing.
- Hosted sync.
- Marketplace.
- Social scraping or posting.
- Autonomous external mutations.
- Direct clone positioning against Poppy, Nodeflow, AI Flow Chat, or Superly.
