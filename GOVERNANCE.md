# Governance

Starlight Agent Canvas is currently maintained as a benevolent-maintainer OSS project.

## Decision Model

Maintainers prioritize:

1. Local-first user control.
2. Safe MCP boundaries.
3. Human-inspectable workflows.
4. Portable context exports.
5. First-run install clarity.
6. Evidence-backed product quality.

## Scope Control

v0.1 is single-user and local-first. Auth, hosted collaboration, billing, marketplace, destructive MCP tools, external posting, social scraping, and account/payment mutation require a new product decision before implementation.

## Contribution Review

PRs should be reviewed for:

- user or agent workflow improvement
- schema and store compatibility
- MCP safety posture
- install and docs impact
- deterministic tests
- visual QA when UI changes
- no committed secrets or runtime data

## Release Authority

Maintainers decide when a tag or public release is ready. The release gate is:

```powershell
pnpm doctor
pnpm doctor:json
pnpm release:audit
pnpm verify
pnpm canvas:smoke
pnpm mcp:smoke
pnpm test:e2e
```

Hosted deployment remains a separate decision because it changes the data, auth, and storage boundary.

