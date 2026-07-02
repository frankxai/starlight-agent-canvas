# Scene Brief

## Surface

App workspace, first screen.

## Brand World

Starlight: nocturnal intelligence lab, precise operational trust, luminous graph, command observatory.

## One Visual Idea

An active research graph where every source, action, and agent output becomes inspectable context.

## Layout

- Left rail: always-visible "Add To Canvas" intake with detected-source preview chips, templates, canvases, and direct source controls.
- Center: React Flow typed graph with first-viewport composer, fresh blank-canvas action, clipboard paste with manual fallback, detected-source preview chips, responsive empty-input primary actions, interactive empty-state actions, paste-anywhere intake, drop-to-position mapping, toolbar note creation, double-click note creation, drag persistence, direct node connections, context copy, explicit import preview/cancel/confirm, and import/export controls.
- Right rail: selected-context tray, live Workflow Map, handoff readiness lane, source-grounded ask box, action drawer, editable selected node inspector with context receipt, clickable citation-to-source cards, selected-source commands immediately after the action drawer, setup/MCP status, local search, run log with clickable citation chips.
- Top bar: product identity, local data path, export route, MCP status.

## Motion

Track A only. Hover/focus transitions and stable node selection. Respect `prefers-reduced-motion`.

## Acceptance

- First viewport is the product, not a landing page.
- A user can create a fresh blank canvas from the first viewport when the latest local canvas is already populated.
- User can paste a YouTube link, image URL, URL, transcript, or raw note directly into the canvas composer.
- If browser clipboard access is blocked or empty, `Paste & Map` focuses the right composer, shows the manual paste fallback, and keeps drop-to-canvas available.
- Empty `Map`/`Ask` clicks focus the correct composer and update status, not silently fail.
- User can see inferred `Video source`, `Image source`, `Web source`, `Source notes`, `Text source`, or file affordances before mapping.
- Template cards show ordered stages and expected outcome before creating a workflow canvas.
- Workflow Map stage buttons refocus matching template nodes.
- Empty canvas state has direct `Map`, `Note`, and `Upload` actions.
- User can double-click blank canvas space for a note, select any node, edit title/body, and save.
- Newly created source/action nodes become visible context immediately.
- Newly created source/action nodes are selected and opened in the inspector.
- Handoff readiness makes evidence, synthesis, selected scope, and Codex/MCP status visible before export.
- Selected sources show ingest method, artifact kind, chunks, source URL/file path, chars, and source-scoped actions.
- Citation cards and run-log citation chips refocus the cited source node and highlighted chunk.
- Markdown context copy and JSON import/export are available from the canvas toolbar.
- JSON imports show reviewable counts, node kinds, sample nodes, and duplicate-id copy behavior before local canvas state changes.
- Confirmed imports select source evidence immediately so the first post-import view includes a receipt rather than an inert graph.
- Dense but readable desktop composition.
- Mobile stacks into source rail, graph, inspector.
- No fake claims or external screenshots.
