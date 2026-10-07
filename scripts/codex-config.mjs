import { isDeepStrictEqual } from 'node:util';
import { parse } from 'smol-toml';

const serverId = 'starlight-agent-canvas';
const serverTable = `mcp_servers.${serverId}`;
const parseOptions = { integersAsBigInt: true, unsafeKeyBehaviour: 'throw' };
export const configLimit = 1024 * 1024;

export class ConfigHold extends Error {}

export function parseCodexConfig(raw) {
  if (Buffer.byteLength(raw, 'utf8') > configLimit) throw new ConfigHold('Config exceeds the 1 MiB edit limit.');
  try { return parse(raw, parseOptions); }
  catch { throw new ConfigHold('Config is invalid or unsupported TOML; no values have been logged.'); }
}

function table(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function codexBlock({ command, cliPath, home }) {
  const result = [
    `[${serverTable}]`,
    `command = ${JSON.stringify(command)}`,
    `args = [${JSON.stringify(cliPath)}]`,
    'enabled = false',
    'startup_timeout_sec = 60',
    '',
    `[${serverTable}.env]`,
    `AGENT_CANVAS_HOME = ${JSON.stringify(home)}`,
  ].join('\n');
  parseCodexConfig(result);
  return result;
}

export function planCodexConfig(raw, options) {
  const expected = parseCodexConfig(raw);
  if (expected.mcp_servers !== undefined && !table(expected.mcp_servers)) throw new ConfigHold('mcp_servers must be a table.');
  const current = expected.mcp_servers?.[serverId];
  if (current !== undefined && !table(current)) throw new ConfigHold('Canvas MCP entry must be a table.');
  if (current?.url !== undefined) throw new ConfigHold('Canvas entry uses HTTP; the stdio installer cannot replace it.');
  if (current?.enabled !== undefined && typeof current.enabled !== 'boolean') throw new ConfigHold('Canvas enabled must be boolean.');
  if (current?.env !== undefined && (!table(current.env) || Object.values(current.env).some(value => typeof value !== 'string'))) {
    throw new ConfigHold('Canvas env must contain string values.');
  }
  if (current?.args !== undefined && (!Array.isArray(current.args) || current.args.length !== 1 || typeof current.args[0] !== 'string')) {
    throw new ConfigHold('Custom Canvas launcher arguments need a manual edit; they will not be discarded.');
  }
  const lineEnding = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);

  function sectionBounds(name) {
    const headers = [];
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^\s*\[([^\]\r\n]+)\]\s*(?:#.*)?$/);
      if (match) headers.push({ start: i, name: match[1].trim() });
    }
    const found = headers.filter(header => header.name === name);
    if (found.length !== 1) throw new ConfigHold('Canvas needs one explicit unquoted server/env table; ambiguous formats require a manual edit.');
    const start = found[0].start;
    return { start, end: headers.find(header => header.start > start)?.start ?? lines.length };
  }

  function update(name, key, value, existed) {
    const { start, end } = sectionBounds(name);
    const matches = [];
    for (let i = start + 1; i < end; i++) {
      if (new RegExp(`^\\s*${key}\\s*=`).test(lines[i])) matches.push(i);
    }
    if (existed && matches.length !== 1) throw new ConfigHold('Managed Canvas keys need explicit single-line assignments; quoted/dotted formats require a manual edit.');
    if (!existed && matches.length) throw new ConfigHold('Ambiguous managed Canvas assignment.');
    if (existed) {
      const index = matches[0];
      parseCodexConfig(`value = ${lines[index].slice(lines[index].indexOf('=') + 1)}`);
      const indent = lines[index].match(/^\s*/)[0];
      lines[index] = `${indent}${key} = ${value}`;
    } else {
      lines.splice(start + 1, 0, `${key} = ${value}`);
    }
  }

  expected.mcp_servers ??= {};
  const server = expected.mcp_servers[serverId] ??= {};
  const existed = current !== undefined;
  if (!existed) {
    lines.push('', codexBlock(options).replaceAll('\n', lineEnding));
  } else {
    update(serverTable, 'command', JSON.stringify(options.command), Object.hasOwn(server, 'command'));
    update(serverTable, 'args', `[${JSON.stringify(options.cliPath)}]`, Object.hasOwn(server, 'args'));
    if (!Object.hasOwn(server, 'enabled')) update(serverTable, 'enabled', 'false', false);
    if (!Object.hasOwn(server, 'startup_timeout_sec') && !Object.hasOwn(server, 'startup_timeout_ms')) {
      update(serverTable, 'startup_timeout_sec', '60', false);
    }
    if (server.env === undefined) {
      lines.push('', `[${serverTable}.env]`, `AGENT_CANVAS_HOME = ${JSON.stringify(options.home)}`);
    } else if (!Object.hasOwn(server.env, 'AGENT_CANVAS_HOME')) {
      update(`${serverTable}.env`, 'AGENT_CANVAS_HOME', JSON.stringify(options.home), false);
    }
  }
  server.command = options.command;
  server.args = [options.cliPath];
  server.enabled ??= false;
  if (server.startup_timeout_sec === undefined && server.startup_timeout_ms === undefined) server.startup_timeout_sec = 60n;
  server.env ??= {};
  server.env.AGENT_CANVAS_HOME ??= options.home;
  const next = lines.join(lineEnding);
  // A real parser catches table-like text in multiline strings, aliases and misplaced edits.
  if (!isDeepStrictEqual(parseCodexConfig(next), expected)) throw new ConfigHold('Proposed edit changes unexpected configuration; use a manual edit.');
  return { next, enabled: server.enabled, home: server.env.AGENT_CANVAS_HOME };
}
