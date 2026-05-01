---
Status: ready-for-agent
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: None
---

# Auth schema migration (0004) — users, sessions, invitations, org_members, feature_flags

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Write and apply migration `0004_auth.sql` that creates the five core auth tables with all columns, constraints, and indexes exactly as specified in the PRD schema section. Covers the full vertical path from raw SQL through Drizzle/PGlite execution to a verified table layout — no web or CLI surface yet, but the schema must be reachable by all later slices.

Cuts through: schema migration file → migration runner → PGlite + Postgres adapters → seed file → schema-shape tests.

## Acceptance criteria
- [ ] Schema: `users`, `sessions`, `invitations`, `org_members`, `feature_flags` tables created with exact columns, FK constraints, CHECK constraints, UNIQUE constraints, and `idx_*` indexes from PRD.
- [ ] Server action / migration runner: `bun run db:migrate` applies `0004_auth.sql` idempotently on both PGlite (WASM, in-process) and Postgres (via `pg` driver). Second run is a no-op, not an error.
- [ ] Web surface: N/A — pure schema; later slices consume it.
- [ ] CLI command: N/A — pure schema.
- [ ] TUI screen: N/A — pure schema.
- [ ] Tests: unit test in `tests/db/migrations/0004_auth.test.ts` — assert every table exists with correct column names, types, NOT NULL flags, FK targets, and index names via `information_schema` / `pragma table_info`. RED (table absent) → GREEN (migration applied).

## Blocked by
- None — can start immediately.

## Notes
Migration runner must handle both PGlite WASM dialect and standard Postgres. If migration runner fails on PGlite WASM, fall back to raw `db.exec()` array (failure gate from PRD). Pin PGlite version in `package.json` at the same time.
