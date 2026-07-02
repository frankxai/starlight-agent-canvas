# Product Requirements Document

## Product

Starlight Agent Canvas is an OSS-first, local-first, MCP-native research and workflow canvas for humans and agents working over the same context.

## Problem

Creators and builders collect context across YouTube, images/screenshots, PDFs, web pages, notes, repo plans, prompts, and agent outputs. Closed SaaS canvases make this work visible, but they often lock context into a hosted surface that agents cannot safely share, inspect, export, or mutate through local tools. Coding agents also need durable memory that is more structured than chat history and safer than giving every tool broad file or account access.

## Product Promise

Turn mixed source material into reusable, inspectable, portable agent context. A user can populate the canvas directly, an agent can operate on the same canvas through MCP, and both can export the result as JSON, Markdown, a general agent context packet, or a Codex-ready continuation prompt.

## Primary Users

- Creator/operators doing competitor research, synthesis, product planning, and content briefs.
- Codex, Claude, Gemini, and Starlight system users who need shared context between human canvas work and agent actions.
- OSS builders who want local-first research workflows without committing source material to a closed hosted system.

## v0.1 Goals

- The first screen is the usable workspace, not a landing page.
- First run opens a user-owned blank canvas with templates nearby, not a pre-filled demo as the primary experience.
- User can paste or drop URLs, YouTube links, image URLs/screenshots, transcripts, PDFs, text files, Markdown, JSON, CSV, and raw notes.
- The composer previews what it detected before mapping: YouTube source, non-YouTube video reference, image source, web source, source notes, text, PDF, or file.
- Mixed paste blobs preserve local source context: labeled transcript, notes, timestamps, OCR, alt text, or visual observations that appear after a YouTube/video/image URL attach to that source instead of becoming duplicate loose notes.
- After paste, drop, or upload mapping, the composer shows a latest intake receipt with created node kinds, artifact kinds, optional action output, and receipt-scoped `Context` / `Codex` copy actions.
- Non-YouTube video links are captured as first-class `source_video` nodes with `video` artifacts, attached notes/transcripts, chunks, and `media: video_reference` provenance; full provider-specific transcription is deferred.
- Image links and uploaded screenshots are captured as first-class `source_image` nodes with `image` artifacts, local preview metadata, optional visual notes/OCR text, chunks, and `media: image_reference` or `media: image_upload` provenance; first-class OCR/vision extraction is deferred.
- The first-viewport composer exposes quick starters for `Video`, `Image`, `Web`, `Note`, and `Ask`, plus a visible `Drop -> Map -> Ask -> Handoff` loop.
- The first-viewport composer exposes a live operator loop for `Capture -> Map -> Inspect -> Ask -> Handoff`, backed by actual canvas state and direct actions.
- Templates launch guided workflow canvases with ordered stages, source slots, prompt nodes, expected output targets, and Codex/MCP handoff nodes.
- User can inspect a live Workflow Map and click a stage to focus the corresponding canvas node.
- User can create notes directly on the canvas and edit selected node title/body.
- Empty canvas, composer, toolbar, and inspector all expose direct add/map actions.
- Newly created source, note, file, and action nodes become selected and open in the inspector.
- Selected source nodes show a context receipt with artifact kind, ingest method, chunk count, source path/URL, and character count.
- Selected source nodes expose immediate source-scoped actions: summary, claims, cited ask, and selected context copy.
- User can see the active selected context before running actions.
- User can see the supported-input contract in the first viewport: YouTube, any video link, image, web, PDF, text, and note, with each one mapped to the node/artifact type Codex will later receive.
- User can confirm immediately after mapping which new nodes/artifacts are now Codex-readable without hunting through the graph.
- User can see handoff readiness before leaving the browser: evidence captured, synthesis/output present, selected scope, and whether Codex is MCP-wired or should use a handoff prompt.
- User can export selected evidence as JSON, Markdown, agent context, or Codex handoff without exporting unrelated canvas material.
- User can run deterministic local actions: summarize, claims, compare, matrix, implementation brief, and cited answer question.
- User can click answer citations in the inspector or run log to refocus the source node and highlighted chunk that grounded the output.
- User can search local evidence and jump from a result back to the matching graph node/chunk.
- User can export portable JSON, readable Markdown, general agent context packets, and Codex-ready continuation prompts; user can re-import portable JSON.
- User can inspect local setup, data home, MCP build status, and Codex MCP wiring from inside the workspace.
- User can see the in-app agent tool path for Codex/MCP work: `get_latest_canvas`, `ingest_anything`, `run_node_action`, and `export_canvas`.
- User can copy the adoption report command, agent prompt, and terminal Codex handoff command from inside the workspace.
- User can see a maintained first-success contract in the workspace: install, open, capture, inspect, handoff, and Codex.
- User can follow a live activation runway from install health to proof canvas, mapped source context, context export, and Codex MCP wiring.
- User can follow a live human workflow loop from blank canvas to Codex handoff without discovering hidden shortcuts or reading docs first.
- User can use a terminal CLI to list, import, search, and export local canvases when browser or MCP host restart is inconvenient.
- Operators and agents can parse local readiness through `pnpm doctor:json`, not only human console text.
- Operators, GitHub contributors, setup helpers, and agents can parse the first-success contract through `pnpm first-success:json`.
- Operators, GitHub contributors, and agents can parse adoption readiness through `pnpm adoption:report:json`, not only scattered docs and screenshots.
- MCP clients can list, read, get the latest canvas, create, import, add/update positioned nodes, ingest mixed paste-anything content, ingest text/URL/YouTube/video/image/PDF sources, connect nodes, run actions, search node/artifact evidence, and export.
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
- `pnpm doctor:json` emits a stable pass/warn/fail health contract with repo root, canvas home, MCP CLI path, Codex config path, checks, and next steps.
- `pnpm adoption:report` and `pnpm adoption:report:json` combine doctor health, release audit health, demo proof, visual evidence, Git/GitHub state, Codex MCP path/home, first-success commands, and a compact Codex prompt.
- `pnpm first-success` and `pnpm first-success:json` expose the install/open/capture/inspect/handoff/Codex contract and supported input contracts.
- The web workspace exposes a setup/MCP status panel backed by local status APIs, not hardcoded badges.
- The setup/MCP status panel exposes the adoption report command and agent toolbelt from `/api/setup/status`.
- `/api/setup/status` exposes an activation contract with steps, proof commands, and a Codex activation prompt.
- `/api/setup/status` exposes `firstSuccess` with phases, supported-input mappings, proof commands, and first-success command copies from `docs/first-success.contract.json`.
- `pnpm verify`, `pnpm test:e2e`, and `pnpm mcp:smoke` pass.
- `pnpm canvas:smoke` passes and proves demo import, list, search, context export, and Codex handoff export from the terminal.
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
- Every citation should help the user re-enter the source graph, not remain a static footnote.
- Every install/Codex claim shown in the UI should be backed by a local check or a copyable command.
- Every handoff claim shown in the UI should be backed by live canvas state, not generic progress copy.
- Human edits are first-class, not an afterthought.
- MCP tools are explicit, bounded, local, and non-destructive.
- Portability beats lock-in.

## Success Metrics

- A new local user can install, seed, and open the app in under 10 minutes.
- A local operator can confirm data home, MCP build, Codex config, and Codex server wiring without leaving the workspace.
- A local operator can see the exact MCP tool path Codex should use and copy the adoption report or terminal handoff command without leaving the workspace.
- A local operator can see the first-success contract and copy the human or JSON form without leaving the workspace.
- A new user can follow the activation runway and understand the next install, demo, mapping, export, or Codex action without reading code.
- An agent or CI job can parse `pnpm doctor:json` and distinguish required failures from optional wiring warnings.
- A setup helper, issue triage agent, or Codex session can parse `pnpm first-success:json` and understand the install-to-Codex loop before choosing tools.
- A user can confirm from the first viewport exactly what happens to YouTube, any video, image, web, PDF, text, and note inputs before mapping them.
- A contributor or Codex session can parse `pnpm adoption:report:json` and understand install, release, proof, visual, GitHub, and Codex state before choosing the next workflow.
- A user can map a YouTube/manual transcript source and run `Ask Canvas` with citations in under 2 minutes after launch.
- A user can click a citation from an answer or run log and land back on the cited source/chunk.
- A user can select any source and run `Ask selected` or copy its source context without exporting the whole canvas.
- A user can identify what `Map` will create before clicking it, then immediately edit the created node.
- A user can identify what `Map` created after clicking it, inspect the latest mapped cluster, and copy a context/Codex handoff scoped to that intake.
- A user can paste a mixed media research blob containing a YouTube URL, generic video URL, image URL, and nearby transcript/notes/OCR labels, then get typed media nodes with attached context and no duplicate stray note node.
- A user can start from `Video`, `Image`, `Web`, `Note`, or `Ask` without knowing hidden shortcuts.
- A user can see which workflow stage is complete and trigger the next one from the first viewport.
- A user can launch a workflow template and understand the ordered stages from the Workflow Map without reading docs.
- A user can add a non-YouTube `source_video` reference plus notes and preserve the video artifact/provenance in JSON/context export.
- A user can add an image URL or uploaded screenshot, see a thumbnail in the graph/inspector, and preserve the image artifact/provenance in JSON/context export.
- An MCP client can ingest a text source, run an action, export Markdown/JSON/context/Codex handoff for the whole canvas or selected node ids, and import portable JSON through smoke tests.
- An MCP client can mirror the human paste-anything flow with one `ingest_anything` call that detects YouTube, generic video, image, URL, and text context, keeps nearby media notes/transcripts/OCR attached, and optionally runs an action on only the newly mapped nodes.
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
- Richer retrieval controls and citation filtering.
- Hosted preview path with explicit auth/storage model.

## Risks

- Large local files can outgrow JSON storage. Mitigation: cap input sizes now and plan SQLite/history later.
- Live URL/video ingestion is inherently unreliable. Mitigation: graceful fallback nodes, first-class video references, and manual transcript support.
- MCP tools can create messy canvases if too broad. Mitigation: safe, typed tools and no destructive actions in v0.1.
- OSS users may expect hosted collaboration. Mitigation: position clearly as local-first v0.1.
