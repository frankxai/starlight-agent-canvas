#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createAgentCanvasMcpServer } from './index.js';

async function main() {
  const server = createAgentCanvasMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error('Starlight Agent Canvas MCP failed:', error);
  process.exit(1);
});
