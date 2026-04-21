# Changelog — @fulcrum-agent-os/pi-cockpit

All notable changes to this package follow [Semantic Versioning](https://semver.org/).

---

## [1.0.0] — 2026-04-21

First public release.

### Added

- 14 PI event handlers: `session_start`, `session_shutdown`, `resources_discover`, `tool_call`, `before_agent_start`, `agent_end`, `tool_result`, `context`, `before_provider_request`, `turn_start`, `turn_end`, `session_before_compact`, `user_bash`, `input`
- `/fulcrum:role <slug>` slash command — switches active agent role mid-session
- 24 canonical role MDs (linked via `cockpit/skills → ../../skills` symlink)
- Fulcrum-first rule text in `AGENTS.md` marker block (PI walks AGENTS.md up from cwd)
- MCP server registration via `fulcrum serve mcp`
- Bias-nudge hook on `before_provider_request` / `before_agent_start`
- npm publish scaffolding as `@fulcrum-agent-os/pi-cockpit` with provenance attestation
- `probePiCockpitOnNpm()` — 2-second bounded npm probe in installer
