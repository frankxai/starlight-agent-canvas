# Gemini MCP Client Shape

Use the same local stdio server entry in any Gemini-compatible host that supports MCP:

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

Keep provider keys outside this MCP server entry. The v0.1 server only needs `AGENT_CANVAS_HOME`.
