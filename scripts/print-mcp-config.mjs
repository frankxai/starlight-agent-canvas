import { codexBlock } from './codex-config.mjs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'packages', 'mcp', 'dist', 'cli.js');
const home = process.env.AGENT_CANVAS_HOME || path.join(os.homedir(), '.starlight', 'agent-canvas');
const command = process.execPath;
const client = process.argv.includes('--client')
  ? process.argv[process.argv.indexOf('--client') + 1]
  : 'json';

function slash(value) {
  return value.replace(/\\/g, '/');
}


function jsonConfig() {
  return JSON.stringify({
    mcpServers: {
      'starlight-agent-canvas': {
        command: slash(command),
        args: [slash(cliPath)],
        env: {
          AGENT_CANVAS_HOME: slash(home),
        },
      },
    },
  }, null, 2);
}

function codexConfig() {
  return codexBlock({ command, cliPath, home });
}

if (client === 'codex' || client === 'toml') {
  console.log(codexConfig());
} else if (client === 'json' || client === 'claude') {
  console.log(jsonConfig());
} else {
  console.error('Usage: node scripts/print-mcp-config.mjs [--client json|claude|codex]');
  process.exit(1);
}
