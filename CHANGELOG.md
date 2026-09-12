# Changelog

All notable changes to Starlight Agent Canvas are documented here.

## Unreleased

### Added

- **Q-Town** — private Starlight second-brain world.
  - New canvas template `q_town_second_brain`.
  - Estate domain-agent registry at `docs/q-town/domain-agents.v1.json` (118 repos, 8 lanes).
  - `pnpm seed:q-town` registers one steward per domain and one agent per repo without launching processes.
  - Local graph at `docs/q-town/index.html`.
- Blessing remains a separate Witness gate. Q-Town itself is not blessed until soak and a clean merged target exist.

### Changed

- MCP `create_canvas` accepts `q_town_second_brain`.

## 0.1.0

- Initial OSS local-first MCP canvas.
