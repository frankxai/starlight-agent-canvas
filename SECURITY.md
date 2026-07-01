# Security Policy

## Local-First Data

By default, canvas data is stored outside the repository under:

```text
C:\Users\frank\.starlight\agent-canvas
```

Override with `AGENT_CANVAS_HOME`.

The web API is localhost-only by default. Set `AGENT_CANVAS_ALLOW_REMOTE=1` only for an intentionally protected hosted or LAN deployment.

## Secrets

Never commit `.env`, API keys, transcripts containing private material, browser cookies, or MCP credentials. `.env.example` lists key names only.

## MCP Posture

v0.1 MCP tools are non-destructive and local-only:

- list/read/create canvases
- add/connect nodes
- run local actions
- search artifacts
- export canvases

No external posting, social scraping, payments, credential mutation, or deletion tools belong in v0.1.

## Ingestion Boundaries

URL ingestion rejects private, localhost, link-local, and credentialed URLs; applies fetch timeout and byte limits; and uses Firecrawl only on explicit per-request opt-in. PDF ingestion rejects non-PDF uploads and oversized files before parsing.

## Reporting

Open an issue or private note with reproduction steps, affected tool/action, expected behavior, and observed behavior. Redact secrets and private content.
