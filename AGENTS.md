# Starlight Agent Canvas Agent Instructions

This repo is an OSS-first, local-first, MCP-native research/workflow canvas.

## Product Boundary

- The first screen is the usable canvas workspace. Do not replace it with a marketing landing page.
- v0.1 is single-user and local-first. Auth, teams, billing, marketplace, and hosted sync are out of scope.
- Store runtime data outside Git by default. Use `AGENT_CANVAS_HOME`; default to the user's home `.starlight/agent-canvas`.
- Do not add social scraping, posting, outreach, payments, destructive MCP tools, or autonomous external mutations.
- Firecrawl and model provider keys are optional. The product must run without API keys.

## Engineering

- Use the existing pnpm monorepo structure: `apps/web`, `packages/core`, `packages/mcp`.
- Keep `packages/core` free of React and Next.js dependencies.
- MCP tools must be safe, explicit, and non-destructive.
- Prefer deterministic local behavior for tests. Do not require live model calls in CI.
- Before dependency installs or builds in this repo, run the root estate security intake or scan.

## Design And QA

- Apply the Starlight Premium Web OS and L99 design loop for UI work.
- Use exact design tokens from `docs/design-loop-evidence.json` and root Starlight standards.
- No decorative 3D, no heavy scroll choreography, no generic AI SaaS copy.
- The app must pass desktop, mobile, and reduced-motion visual checks before handoff.

## Health Commands

- `pnpm build`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e` when Playwright browsers are available
