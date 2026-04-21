# Changelog — @fulcrum-agent-os/opencode-plugin

All notable changes to this package follow [Semantic Versioning](https://semver.org/).

---

## [0.0.5] — 2026-04-21

CI release retry.

### Fixed

- Retagged package release after pinning `pnpm/action-setup` to the repository
  pnpm version used by GitHub Actions.

## [0.0.4] — 2026-04-21

Alignment release.

### Fixed

- Scoped `todo.updated` mirroring to Fulcrum workspace/project context.
- Verified opencode event wrapper payload shape against the runtime plugin test.

## [0.0.3] — 2026-04-21

Published pre-release.

### Added

- `experimental.chat.system.transform` — injects the Fulcrum-first canonical rider on every LLM turn
- `experimental.chat.messages.transform` — belt-and-suspenders fallback when `system.transform` hasn't fired yet
- `tool.execute.before` + `tool.execute.after` — Fulcrum hook integration for bias nudge + post-tool emit
- `session.idle` telemetry — fires `opencode_rider_never_injected` signal when primary injection never ran
- `session.compacted` handler — triggers memory emit + graph reducer on context compaction
- SHA-256 `.ridersum` integrity chain — verifies rider content on every session start
- 33 skill MDs in `.opencode/agents/fulcrum-skill-<name>.md`
- 24 canonical role MDs in `.opencode/agents/<role>.md`
- npm publish scaffolding as `@fulcrum-agent-os/opencode-plugin` with provenance attestation
- scoped npm package published as `@fulcrum-agent-os/opencode-plugin@0.0.3`
