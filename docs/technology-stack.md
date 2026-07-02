# Technology Stack

Last reviewed: 2026-07-01.

## Product Runtime

- Monorepo: pnpm workspaces.
- Web app: Next.js App Router, React, TypeScript.
- Canvas: `@xyflow/react` for typed workflow nodes and edges.
- UI system: Tailwind CSS, lucide-react, Starlight Premium Web OS tokens.
- AI surface: Vercel AI SDK dependency is present for provider adapters; v0.1 actions are deterministic and keyless.
- Core package: Zod schemas, typed records, source artifacts, local file store, action runner, ingestion adapters, JSON import/export, Markdown export, and agent context packet export.
- Source intake: SSRF-hardened URL fetch, optional Firecrawl, PDF extraction, YouTube oEmbed and best-effort public captions, manual text/transcript ingestion.
- MCP package: `@modelcontextprotocol/sdk` stdio server with positioned source ingest/update/action/import/export tools, including PDF ingest and agent context export.
- QA: Vitest, Playwright desktop/mobile, security scan, visual QA screenshots.
- Storage: local JSON files under `AGENT_CANVAS_HOME`, defaulting to `C:\Users\frank\.starlight\agent-canvas`.
- Write safety: per-canvas in-process queues plus atomic file locks under `AGENT_CANVAS_HOME\.locks`.

## Why This Stack

`@xyflow/react` is the right v0.1 engine because the product promise is typed workflow context, not freeform sketching. It gives stable nodes, edges, selection, minimap, and mobile-friendly graph controls while keeping the model simple enough for MCP tools to mutate safely.

Next.js keeps the first release easy to run locally and later deploy to Vercel. The core package is independent from React and Next so Codex, Claude, Gemini, or a future CLI can share the same schemas, store, actions, and exports.

MCP stdio keeps the agent integration low-trust and local. Clients can read and write canvases, ingest source material, update node positions/bodies, and run deterministic actions without giving the server external credentials or destructive powers.

## Deferred Options

- tldraw sketch mode: good for v0.2 freeform boards after typed workflow nodes are stable.
- SQLite/LibSQL: useful when search, history, and larger local datasets outgrow JSON files.
- Yjs/collaboration: v0.2+ after single-user local workflows are proven.
- Hosted storage/auth: Vercel preview or production path once the repo has a remote and product data boundaries are explicit.
- Provider-backed AI actions: optional adapters for OpenAI, Anthropic, Gemini, or Vercel AI Gateway after deterministic local actions define the contract.
- OCR and richer media ingestion: add once PDF/URL/YouTube transcript paths have chunk-level evidence tracking.

## Enterprise Readiness Principles

- Local-first by default.
- Portable JSON import/export, Markdown exports, and agent context packet exports.
- Safe MCP annotations and no destructive tools.
- Secrets live in environment variables only.
- API routes stay localhost-only unless `AGENT_CANVAS_ALLOW_REMOTE=1`.
- URL ingestion revalidates redirect hops before reading redirected content.
- Tests use fake/deterministic providers, not live model keys.
- Visual QA proves desktop, mobile, and reduced-motion states.
