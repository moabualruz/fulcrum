# Implementation Changelog

## [Unreleased] — 2026-04-12

### Added
- Spec ingestion complete (pi_local_first_agent_os_spec.md v0.1)
- CURRENT_STATE.md
- GAP_ANALYSIS.md
- SPEC_TRACEABILITY.md
- IMPLEMENTATION_PLAN.md
- TASKS.md
- DECISIONS.log
- ASSUMPTIONS.md
- BLOCKERS.md
- VERIFY.md
- CHANGELOG_IMPL.md
- pyproject.toml (Python 3.12+, uv, all dependencies)
- src/pi_agent_os/ package skeleton
- src/pi_agent_os/ids.py — typed prefixed ULID ID system
- src/pi_agent_os/models/ — Pydantic v2 models for all spec objects
- src/pi_agent_os/db/ — SQLite schema, migrations, connection management
- src/pi_agent_os/events/ — Event schema and emitter
- src/pi_agent_os/adapters/ — Read/write adapter interfaces and implementations
- src/pi_agent_os/agent_home.py — Agent-home directory initialization
- src/pi_agent_os/policy/ — Policy engine skeleton
- tests/ — Test skeleton with Phase 0 coverage
- workflows/ — Coded workflow definitions (grill-me, write-a-prd, prd-to-plan, prd-to-issues)
- agent-home-template/ — Reference agent-home directory structure
- scripts/bootstrap.sh — Environment bootstrap script
