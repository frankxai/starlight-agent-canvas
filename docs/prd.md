# Product Requirements Document

## Product

Starlight Agent Canvas is an OSS-first, local-first, MCP-native research and workflow canvas for humans and agents working over the same context.

## Problem

Creators and builders collect context across YouTube, PDFs, web pages, notes, repo plans, prompts, and agent outputs. Closed SaaS canvases make this work visible, but they often lock context into a hosted surface that agents cannot safely share, inspect, export, or mutate through local tools. Coding agents also need durable memory that is more structured than chat history and safer than giving every tool broad file or account access.

## Product Promise

Turn mixed source material into reusable, inspectable, portable agent context. A user can populate the canvas directly, an agent can operate on the same canvas through MCP, and both can export the result as JSON or Markdown.

## Primary Users

- Creator/operators doing competitor research, synthesis, product planning, and content briefs.
- Codex, Claude, Gemini, and Starlight system users who need shared context between human canvas work and agent actions.
- OSS builders who want local-first research workflows without committing source material to a closed hosted system.

## v0.1 Goals

- The first screen is the usable workspace, not a landing page.
- First run opens a user-owned blank canvas with templates nearby, not a pre-filled demo as the primary experience.
- User can paste or drop URLs, YouTube links, transcripts, PDFs, text files, Markdown, JSON, CSV, and raw notes.
- The composer previews what it detected before mapping: YouTube source, non-YouTube video reference, web source, source notes, text, PDF, or file.
- Non-YouTube video links are captured as safe source references with attached notes and `media: video_reference` provenance; full provider-specific transcription is deferred.
- The first-viewport composer exposes quick starters for `Video`, `Web`, `Note`, and `Ask`, plus a visible `Drop -> Map -> Ask -> Handoff` loop.
- User can create notes directly on the canvas and edit selected node title/body.
- Empty canvas, composer, toolbar, and inspector all expose direct add/map actions.
- Newly created source, note, file, and action nodes become selected and open in the inspector.
- Selected source nodes show a context receipt with artifact kind, ingest method, chunk count, source path/URL, and character count.
- Selected source nodes expose immediate source-scoped actions: summary, claims, cited ask, and selected context copy.
- User can see the active selected context before running actions.
- User can run deterministic local actions: summarize, claims, compare, matrix, implementation brief, and cited answer question.
- User can search local evidence and jump from a result back to the matching graph node/chunk.
- User can export portable JSON, readable Markdown, and agent context packets; user can re-import portable JSON.
- User can inspect local setup, data home, MCP build status, and Codex MCP wiring from inside the workspace.
- User can use a terminal CLI to list, import, search, and export local canvases when browser or MCP host restart is inconvenient.
- MCP clients can list, read, create, import, add/update positioned nodes, ingest text/URL/YouTube/PDF sources, connect nodes, run actions, search node/artifact evidence, and export.
- Runtime data lives outside Git by default.

## Non-Goals

- Hosted collaboration.
- Auth, teams, billing, marketplace, or paid hosted storage.
- External posting, outreach, scraping social platforms, payments, or destructive MCP actions.
- Replacing specialized whiteboard tools.
- Requiring live model provider keys for first use.

## Core Workflows

1. Human source mapping: paste a video URL and transcript/notes, map it into nodes, inspect the source receipt, run a selected-source question, edit the node, export the brief.
2. Agent-assisted research: ask Codex to read the current canvas, add a source, run an action, and export Markdown.
3. Competitor teardown: collect pages/videos/notes for Poppy, Nodeflow, AI Flow Chat, and Superly, compare capabilities, and generate a build wedge.
4. Repo/product planning: map local repo estate notes into product candidates and implementation briefs.
5. MCP tool design: define tool boundaries, risks, and safe action contracts as connected nodes.

## Acceptance Criteria

- `pnpm doctor` explains local readiness and missing build steps.
- The web workspace exposes a setup/MCP status panel backed by local status APIs, not hardcoded badges.
- `pnpm verify`, `pnpm test:e2e`, and `pnpm mcp:smoke` pass.
- `pnpm canvas:smoke` passes and proves demo import, list, search, and context export from the terminal.
- README links to install, PRD, user flows, MCP setup, Codex integration, system design, and production readiness.
- GitHub has issue templates, PR template, CI, and a readiness checklist.
- Visual evidence proves desktop and mobile first-use paths.
- No secrets, runtime canvases, or local data homes are committed.

## Design Principles

- The canvas is both display and input.
- First-use affordances beat hidden shortcuts.
- Every source becomes an artifact plus a visible node.
- Every durable source artifact gets chunk ids that answers and context exports can cite.
- Every action output becomes inspectable context.
- Every search result should help the user re-enter the graph, not become a detached list.
- Every install/Codex claim shown in the UI should be backed by a local check or a copyable command.
- Human edits are first-class, not an afterthought.
- MCP tools are explicit, bounded, local, and non-destructive.
- Portability beats lock-in.

## Success Metrics

- A new local user can install, seed, and open the app in under 10 minutes.
- A local operator can confirm data home, MCP build, Codex config, and Codex server wiring without leaving the workspace.
- A user can map a YouTube/manual transcript source and run `Ask Canvas` with citations in under 2 minutes after launch.
- A user can select any source and run `Ask selected` or copy its source context without exporting the whole canvas.
- A user can identify what `Map` will create before clicking it, then immediately edit the created node.
- A user can start from `Video`, `Web`, `Note`, or `Ask` without knowing hidden shortcuts.
- A user can add a non-YouTube video reference plus notes and preserve the media provenance in JSON/context export.
- An MCP client can ingest a text source, run an action, export Markdown/JSON/context, and import portable JSON through smoke tests.
- Contributors can identify the right issue template and local verification command without reading code.

## Roadmap

### v0.1 Hardening

- Better import feedback for URL/video/PDF failures.
- Canvas cleanup tools that remain non-destructive by default.
- Richer export templates.
- More visual QA states around empty, error, and long-source workflows.

### v0.2

- Optional SQLite local store.
- Freeform sketch mode after typed workflow nodes are stable.
- Provider-backed AI actions behind explicit adapters.
- Chunk-level citations and retrieval.
- Hosted preview path with explicit auth/storage model.

## Risks

- Large local files can outgrow JSON storage. Mitigation: cap input sizes now and plan SQLite/history later.
- Live URL/video ingestion is inherently unreliable. Mitigation: graceful fallback nodes and manual transcript support.
- MCP tools can create messy canvases if too broad. Mitigation: safe, typed tools and no destructive actions in v0.1.
- OSS users may expect hosted collaboration. Mitigation: position clearly as local-first v0.1.
