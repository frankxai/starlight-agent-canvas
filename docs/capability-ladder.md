# Capability Ladder

This document is the product maturity contract for Starlight Agent Canvas. It separates what works in v0.1 from what is intentionally next, so GitHub users, Frank, and MCP agents can judge the product without guessing from screenshots or roadmap language.

## Product Thesis

Starlight Agent Canvas is a local-first context canvas where humans can map research visually and coding agents can use the same graph through safe MCP tools.

The strongest version of the product combines three things:

1. Human ease: paste, drop, upload, note, ask, inspect, and export without learning a schema.
2. Agent truth: every source, artifact, chunk, run, and output has ids an MCP client can read and cite.
3. Portable ownership: the data home is local, exportable, inspectable, and not trapped in a hosted account.

## v0.1 Today

| Layer | What works now | Proof |
| --- | --- | --- |
| Install | `node scripts/setup.mjs`, `pnpm install:proof`, `pnpm doctor`, `pnpm adoption:report` | CI, `docs/install.md`, `scripts/setup.mjs`, `scripts/first-run-check.mjs` |
| First screen | Usable workspace, not a landing page | `docs/scene-brief.md`, visual QA screenshots |
| Human intake | Paste/drop/upload YouTube, video links, image links/uploads, web URLs, PDFs, text files, transcripts, and notes | Playwright, core intake tests, visual QA |
| Mapping | Map preview, typed node kind, artifact kind, readiness, optional output action | `apps/web/components/WorkspaceClient.tsx`, e2e tests |
| Source readiness | Codex-ready vs reference-only vs needs-context states | `packages/core/src/readiness.ts`, MCP structured output |
| Enrichment | Attach transcript, OCR, visual notes, timestamp notes, claims, or excerpts after mapping | Web inspector, API route, MCP `enrich_source_node` |
| Actions | Summarize, claims, compare, matrix, implementation brief, source-grounded ask | deterministic local action runner |
| Handoff | JSON, Markdown, context packet, Codex continuation prompt, selected-node scope | exporters, CLI, API, MCP |
| MCP | Safe stdio tools for read, ingest, enrich, update, connect, run action, search, import, and export | `pnpm mcp:smoke`, `pnpm mcp:codex:smoke` |
| OSS readiness | README, install docs, issue templates, security, governance, CI, release audit | `pnpm release:audit` |

## AI Canvas Expectations

| User expectation | v0.1 answer | Next maturity step |
| --- | --- | --- |
| "Can I drop a YouTube link?" | Yes. Transcript-first with manual transcript fallback; no video download. | Richer transcript adapters and source quality scoring. |
| "Can I drop any video link?" | Yes as a `source_video` reference with attached notes/transcript/chunks. | Provider-specific transcript adapters for Loom, Vimeo, Drive, Dropbox, and direct files. |
| "Can I drop images or screenshots?" | Yes as `source_image` with preview/provenance and attached notes/OCR text. | Provider-backed OCR/vision extraction with citations back to source image regions. |
| "Can I add notes like a human canvas?" | Yes. Notes are first-class nodes and export context. | Faster keyboard creation, bulk note clustering, and richer source-note binding UI. |
| "Can I ask across the canvas?" | Yes, with selected-node or whole-canvas scope and citation metadata. | Provider-backed answer generation with model adapters and eval traces. |
| "Can Codex use the same canvas?" | Yes. Codex can use MCP tools or a Codex handoff export over the same `AGENT_CANVAS_HOME`. | Deeper Codex Desktop live-tool verification and richer agent-authored layout conventions. |
| "Can agents populate it for me?" | Yes through MCP `ingest_anything`, `add_node`, `connect_nodes`, `run_node_action`, and `export_canvas`. | Agent templates that build full research maps from prompts and source bundles. |
| "Can I share it?" | Yes through portable JSON/Markdown/context/Codex exports. | Hosted preview, collaboration, and optional sync after local-first boundaries stay clear. |

## v0.2 Direction

The next product stage should increase real-world usefulness without breaking the local-first contract:

- Richer media ingestion: provider transcript adapters, OCR, and vision extraction with provenance.
- Faster canvas creation: command palette, keyboard-first node creation, and better drag/drop target feedback.
- Agent-authored maps: MCP clients should create coherent layouts, not only correct nodes.
- Workflow packs: competitor teardown, repo planning, agent design, and content synthesis should become reusable recipe files.
- Eval traces: every AI/provider action should show model, prompt, source ids, citations, and confidence limits.

## v0.3 Direction

This stage makes the canvas feel like a serious daily operating tool:

- Optional SQLite store adapter behind the current store contract.
- Local history, snapshots, and diffable canvas changes.
- Better selected-subgraph visualization and export previews.
- tldraw-style freeform sketch mode alongside typed workflow nodes.
- Plugin connectors for Drive, GitHub, Notion, Slack, and Vercel while preserving safe local permissions.

## v1.0 Direction

v1.0 should be production-grade OSS infrastructure:

- Stable package boundaries and public API contracts.
- Hosted/Vercel deployment path with explicit local/hosted data boundaries.
- Auth and collaboration only after single-user local workflows remain excellent.
- Provider-backed AI actions with deterministic test doubles and privacy-aware defaults.
- A public demo and docs site that never requires secrets to understand the product.

## Non-Claims

Do not claim these in v0.1:

- Automatic full transcription for every video host.
- Automatic OCR or visual reasoning from every image.
- Multiplayer collaboration.
- Hosted sync or cloud persistence.
- Marketplace, billing, autonomous outreach, social posting, or destructive agent tools.
- Full parity with every closed AI canvas interaction.

## Operating Standard

A capability is considered real only when it has at least one of:

- A product control visible in the first-use workflow.
- A schema/store/export implementation.
- A unit, MCP, browser, or smoke test.
- A visual QA screenshot.
- A documented command that a new user or agent can run.

If a feature cannot point to evidence, it belongs in the next maturity step, not the current promise.
