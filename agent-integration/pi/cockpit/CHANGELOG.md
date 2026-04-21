# Changelog — @fulcrum-agent-os/pi-cockpit

All notable changes to this package follow [Semantic Versioning](https://semver.org/).

---

## [0.0.6] — 2026-04-21

CI release retry.

### Fixed

- Narrowed publish tarball secret scan so code references like `process.env`
  do not block publishing as false positives.

## [0.0.5] — 2026-04-21

CI release retry.

### Fixed

- Retagged package release after pinning `pnpm/action-setup` to the repository
  pnpm version used by GitHub Actions.

## [0.0.4] — 2026-04-21

Alignment release.

### Fixed

- Added Fulcrum-first bias nudge through `before_agent_start`.
- Kept `before_provider_request` observational instead of mutating
  provider-specific payloads.
- Accepted current monitor response envelopes for task/workspace reads and
  create-task responses.

## [0.0.3] — 2026-04-21

First public release.

### Added

- 14 PI event handlers: `session_start`, `session_shutdown`, `resources_discover`, `tool_call`, `before_agent_start`, `agent_end`, `tool_result`, `context`, `before_provider_request`, `turn_start`, `turn_end`, `session_before_compact`, `user_bash`, `input`
- `/fulcrum:role <slug>` slash command — switches active agent role mid-session
- 24 canonical role MDs (linked via `cockpit/skills → ../../skills` symlink)
- Fulcrum-first rule text in `AGENTS.md` marker block (PI walks AGENTS.md up from cwd)
- MCP server registration via `fulcrum serve mcp`
- Fulcrum-first bias nudge via `before_agent_start`; `before_provider_request`
  is bound as an observational provider-payload hook, not a cross-provider
  mutation path
- npm publish scaffolding as `@fulcrum-agent-os/pi-cockpit` with provenance attestation
- `probePiCockpitOnNpm()` — 2-second bounded npm probe in installer
- scoped npm package published as `@fulcrum-agent-os/pi-cockpit@0.0.3`
