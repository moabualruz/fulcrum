# Changelog — @fulcrum-agent-os/opencode-plugin

All notable changes to this package follow [Semantic Versioning](https://semver.org/).

---

## [0.0.1] — 2026-04-21

First pre-release. Not yet published to npm (pending npm org registration — PR 14.3 operator step).

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
