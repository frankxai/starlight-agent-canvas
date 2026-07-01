# Starlight Agent Canvas

OSS-first, MCP-native research and workflow canvas for Codex, Claude, Gemini, creators, and Starlight systems.

This is not a Poppy or Nodeflow clone. It is a local-first agent context layer: sources, prompts, MCP tools, agent runs, and outputs become typed nodes on a portable canvas.

## What v0.1 Does

- Create local canvases and portable JSON/Markdown exports.
- Add notes, URLs, PDFs, YouTube transcript notes, prompts, MCP tool nodes, agent-run notes, and outputs.
- Run local actions: summarize, extract claims, compare sources, make a decision matrix, and generate an implementation brief.
- Expose safe stdio MCP tools so coding agents can read and write canvas state.
- Keep runtime data outside the repo by default.

## Quick Start

```powershell
cd C:\Users\frank\starlight\repos\starlight-agent-canvas
pnpm install
pnpm dev
```

The web app starts at `http://localhost:3000` unless Next.js chooses another port.
API routes are localhost-only unless `AGENT_CANVAS_ALLOW_REMOTE=1` is set intentionally.

Optional local data path:

```powershell
$env:AGENT_CANVAS_HOME="C:\Users\frank\.starlight\agent-canvas"
```

## MCP

```powershell
pnpm mcp:build
pnpm mcp:start
```

Example MCP client entry:

```json
{
  "mcpServers": {
    "starlight-agent-canvas": {
        "command": "node",
        "args": [
          "C:/Users/frank/starlight/repos/starlight-agent-canvas/packages/mcp/dist/cli.js"
        ],
      "env": {
        "AGENT_CANVAS_HOME": "C:/Users/frank/.starlight/agent-canvas"
      }
    }
  }
}
```

## Verify

```powershell
pnpm verify
pnpm test:e2e
```

`pnpm verify` runs typecheck, unit/MCP tests, and production build. `pnpm test:e2e` runs the desktop/mobile Playwright workflow.

## Repo Layout

- `apps/web`: Next.js workspace UI.
- `packages/core`: schemas, file store, ingestion, actions, import/export.
- `packages/mcp`: safe stdio MCP server.
- `docs`: product brief, architecture, scene brief, evidence.
- `examples`: portable sample canvases.

## Safety

No v0.1 tool posts externally, scrapes social platforms, spends money, modifies external accounts, or deletes canvases. Runtime state lives in local files and can be inspected directly.

URL/PDF ingestion is bounded: private and localhost URLs are rejected, remote fetches have timeout/size limits, PDFs are capped, and Firecrawl is used only when both `FIRECRAWL_API_KEY` exists and a request explicitly opts in.
