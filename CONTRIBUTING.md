# Contributing

Starlight Agent Canvas is an OSS-first, local-first, MCP-native product. Contributions should make the shared human/agent canvas more useful without weakening the safety boundary.

## Start Here

```powershell
pnpm install
pnpm doctor
pnpm seed:starlight
pnpm dev
```

Read:

- `docs/prd.md`
- `docs/user-flows.md`
- `docs/system-design.md`
- `docs/mcp-setup.md`
- `docs/github-readiness.md`

## Rules Of The Road

- Keep runtime data out of Git.
- Keep MCP tools safe, explicit, and non-destructive.
- Preserve the first-screen product workspace.
- Add tests for schemas, store behavior, action handlers, MCP tool handlers, and browser workflows when behavior changes.
- Update docs when install, MCP, source ingestion, exports, or user flows change.
- Do not introduce hosted auth, billing, collaboration, social posting, payments, broad credentials, or destructive actions without a new product decision.

## Local Gates

Run the strongest relevant set before opening a PR:

```powershell
pnpm doctor
pnpm verify
pnpm mcp:smoke
pnpm test:e2e
```

For UI changes, update visual evidence in `docs/visual-qa` and `docs/design-loop-evidence.json`.

## PR Checklist

- Explain the user or agent workflow improved.
- List files or packages changed.
- Include verification commands and outcomes.
- Confirm no secrets, private transcripts, runtime data, or local canvas exports are committed.
- Confirm no destructive MCP tools or external-posting flows were added.

Before adding dependencies or running builds in a newly cloned environment, run the Starlight repo security scan described in `AGENTS.md`.
