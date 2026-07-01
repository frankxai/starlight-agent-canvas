# Contributing

Starlight Agent Canvas is currently a v0.1 local-first product scaffold.

## Rules Of The Road

- Keep runtime data out of Git.
- Keep MCP tools safe and explicit.
- Add tests for schemas, store behavior, action handlers, and MCP tool handlers.
- Do not introduce hosted auth, billing, collaboration, social posting, or destructive actions without a new product decision.
- Preserve the first-screen product workspace.

## Development

```powershell
pnpm install
pnpm build
pnpm test
pnpm dev
```

Before adding dependencies or running builds in a newly cloned environment, run the Starlight repo security scan described in `AGENTS.md`.
