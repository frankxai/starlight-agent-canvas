# Q-Town

Private Starlight world for the second brain.

This is a **local, inspectable graph**, not a public site and not a live swarm.

## What exists

| Artifact | Role |
|---|---|
| `docs/q-town/domain-agents.v1.json` | Sanitized estate registry: lanes, repos, second-brain districts |
| `q_town_second_brain` canvas template | Compact guided world in the app |
| `pnpm seed:q-town` | Imports the full graph into `AGENT_CANVAS_HOME` |
| `docs/q-town/index.html` | Static graph of the registered world |
| `docs/q-town/q-town.world.json` | Node/edge snapshot without vault notes |

## Invariants

- Private vault is air-gapped: no MCP node, no live mount.
- One registered steward per estate lane and one registered agent per repo.
- `deployment: registry-only`. No process spawn.
- No private notes, transcripts, secrets, or third-party PII in Git.

## Commands

```powershell
pnpm --filter @starlight-agent-canvas/core test
pnpm seed:q-town -- --home="$env:USERPROFILE\.starlight\agent-canvas"
```

Open `docs/q-town/index.html` locally. Do not publish it as a production route.
