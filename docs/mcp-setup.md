# MCP Setup

Starlight Agent Canvas exposes one local stdio MCP server. It gives agents a typed memory surface without destructive tools or external posting.

## Build First

```powershell
cd C:\Users\frank\starlight\repos\starlight-agent-canvas
pnpm mcp:build
pnpm mcp:smoke
```

The smoke command starts the server over stdio, lists tools, creates a throwaway canvas in `.agent-canvas/mcp-smoke`, ingests a text source, updates node position, runs an action, and exports Markdown.

## Codex

Frank's local Codex config can use this block:

```toml
[mcp_servers.starlight-agent-canvas]
command = 'C:\Program Files\nodejs\node.exe'
args = ["C:/Users/frank/starlight/repos/starlight-agent-canvas/packages/mcp/dist/cli.js"]
startup_timeout_sec = 60

[mcp_servers.starlight-agent-canvas.env]
AGENT_CANVAS_HOME = "C:/Users/frank/.starlight/agent-canvas"
```

This keeps canvas data under `C:\Users\frank\.starlight\agent-canvas`.

## Claude Desktop / MCP-Compatible Clients

The repo includes `.mcp.json` with the same local server entry:

```json
{
  "mcpServers": {
    "starlight-agent-canvas": {
      "command": "C:/Program Files/nodejs/node.exe",
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

For Claude Desktop, merge the `mcpServers.starlight-agent-canvas` entry into `C:\Users\frank\AppData\Roaming\Claude\claude_desktop_config.json`, then restart Claude.

## Gemini / Other Agent Hosts

Use the same stdio shape when the host supports MCP servers:

- command: `C:/Program Files/nodejs/node.exe`
- args: `C:/Users/frank/starlight/repos/starlight-agent-canvas/packages/mcp/dist/cli.js`
- env: `AGENT_CANVAS_HOME=C:/Users/frank/.starlight/agent-canvas`

## Tools

- `list_canvases`
- `get_canvas`
- `create_canvas`
- `add_node`
- `update_node`
- `ingest_text_source`
- `ingest_url`
- `ingest_youtube`
- `connect_nodes`
- `run_node_action`
- `search_artifacts`
- `export_canvas`

## Resources And Prompt

The server also exposes local guide resources:

- `starlight-agent-canvas://docs/mcp-setup`
- `starlight-agent-canvas://docs/technology-stack`
- `starlight-agent-canvas://docs/production-readiness`

Prompt:

- `starlight_canvas_operator`

## Boundary

The server is local-only and non-destructive in v0.1. It does not delete canvases, post externally, scrape social platforms, spend money, alter external accounts, or require provider keys. `ingest_url` and `ingest_youtube` are read-only network source intake tools that create local artifacts and nodes.
