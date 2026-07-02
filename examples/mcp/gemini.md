# Gemini MCP Client Shape

Use the same local stdio server entry in any Gemini-compatible host that supports MCP.

Generate a machine-specific JSON block first:

```powershell
pnpm mcp:build
pnpm mcp:config -- --client json
```

Template shape:

```json
{
  "mcpServers": {
    "starlight-agent-canvas": {
      "command": "/absolute/path/to/node",
      "args": [
        "/absolute/path/to/starlight-agent-canvas/packages/mcp/dist/cli.js"
      ],
      "env": {
        "AGENT_CANVAS_HOME": "/absolute/path/to/.starlight/agent-canvas"
      }
    }
  }
}
```

Keep provider keys outside this MCP server entry. The v0.1 server only needs `AGENT_CANVAS_HOME`.

After wiring the host, ask it to:

```text
List canvases, inspect the active canvas, ingest a short text source, run summarize, and export the canvas as context.
```
