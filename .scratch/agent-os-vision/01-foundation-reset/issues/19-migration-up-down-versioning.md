---
Status: ready-for-agent
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 03-schema-migrations
PRD: .scratch/agent-os-vision/prds/01-foundation-reset.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 1 section)
Decisions: [A3, C2, A2]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Schema for future SaaS without rewrite)
Docs: []
---

# Migration up/down + schema-version tracking

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md` (Migration architecture subsection)

## What to build
End-to-end migration framework: every migration ships `up_NNNN_<slug>.sql` + `down_NNNN_<slug>.sql` paired files. `schema_migrations` tracking table + checksum validation + `fulcrum db migrate --target-version <N>` CLI/Web/TUI/API. Doctor refuses startup if running binary's known max version < DB's current version (would require downgrade).

## Acceptance criteria
- [ ] Schema migration: add `schema_migrations(version int PRIMARY KEY, name text, applied_at timestamptz, checksum text, direction text CHECK in 'up'|'down')`.
- [ ] Server-action / tRPC procedure: `db.migrate(targetVersion?)`, `db.status()`, `db.history()`.
- [ ] Web surface: `/settings/database/migrations` showing history + target-version picker.
- [ ] CLI command: `fulcrum db migrate [--target-version <N>] [--force]`, `fulcrum db status`, `fulcrum db history`.
- [ ] TUI screen: Settings → Database → Migrations.
- [ ] Tests: unit test the up/down round-trip on every migration; integration test downgrade-with-data refuses without --force.
- [ ] Doctor: adds `db.migrationVersion` + `db.canRunOnCurrentBinary` checks.

## Blocked by
03-schema-migrations

## Notes
A3 lock requires lossless up/down where possible. Where lossy (column drop with data), down refuses without --force and emits warning into events.
