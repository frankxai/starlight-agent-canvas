# Release Audit

`pnpm release:audit` is the local GitHub/release readiness gate. It does not install dependencies, start servers, call provider APIs, or mutate local canvas state.

## What It Checks

- OSS surface files: README, license, security policy, contribution guide, code of conduct, support guide, governance, maintainers, agent instructions, env example, MCP config, workspace files.
- GitHub surface: CI workflow, Dependabot, CODEOWNERS, issue templates, and pull request template.
- Product docs: install, activation runway, adoption report, CLI, PRD, user flows, Codex integration, operator loop, MCP setup, readiness evidence, production readiness, GitHub readiness, system design, technology stack, product brief, scene brief, demo walkthrough, and design evidence.
- Examples: demo canvas and MCP client examples for Codex, Claude Desktop, and Gemini.
- Package scripts and CI gates for doctor, doctor JSON, adoption report JSON, first-run check, typecheck, tests, build, CLI smoke, MCP smoke, and Playwright.
- Doctor JSON contract: executes `scripts/doctor.mjs --json` and verifies the required machine-readable shape.
- Demo canvas proof: nodes, artifacts, runs, chunked sources, citations, and source/output node kinds.
- Visual QA proof: 26/30+ score, inspected evidence artifacts, and critical desktop/mobile screenshots.
- Safety posture: `.env.example` contains key names only, `.gitignore` protects runtime/private/build paths, and Git is not tracking or staging runtime data.
- Tracking posture: required public files must be tracked or staged, so release audit cannot pass with README links to untracked docs.

## Run It

```powershell
pnpm release:audit
```

Machine-readable output:

```powershell
pnpm release:audit -- --json
```

## Warnings Versus Failures

Warnings do not fail the command. Today, a missing Git remote is a warning because the repo can be locally ready before the public GitHub remote is attached.

Failures mean a required public, install, demo, CI, visual evidence, or safety artifact is missing or malformed. Fix failures before tagging, announcing, or opening a release PR.
