---
Status: ready-for-agent
Triage: AFK
Pillar: 17-cross-cutting-platform
Blocked-by: [01-foundation-reset/issues/01-schema-auth-migration.md]
PRD: .scratch/agent-os-vision/prds/17-cross-cutting-platform.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Cross-Cutting Requirements section)
Decisions: [Q-cross-cut, Q22, D5]
Vision: .scratch/agent-os-vision/EXTRA-GAPS.md (B7, B8, B9, B10)
Docs: https://pglite.dev/docs
---

# Schema migration — credentials, telemetry_events, error_logs, experiment_assignment + feature_flags addendum

## What to build

Write and apply migration(s) for the five schema additions owned by Pillar 17. (1) `credentials` table with UNIQUE `(org_id, user_id, name)`, composite indexes `(org_id, user_id, last_used_at DESC)` and `(org_id, archived)`. (2) `telemetry_events` table with indexes `(org_id, occurred_at DESC)` and `(org_id, user_id, kind)`. (3) `error_logs` table with index `(org_id, occurred_at DESC)`. (4) `experiment_assignment` table with UNIQUE `(org_id, user_id, experiment_id)` and index `(org_id, experiment_id)`. (5) `feature_flags` addendum: `ADD COLUMN IF NOT EXISTS rollout_percent`, `cohort_rules`, `updated_by`, `updated_at` — idempotent. All tables: `org_id NOT NULL` + FK cascade + composite indexes mandatory per Q22.

Cuts through: migration SQL → migration runner (PGlite + Postgres) → schema-shape unit test → idempotent re-run.

## Acceptance criteria

- [ ] All 4 new tables created with correct columns, types, NOT NULL flags, FK targets, UNIQUE constraints, CHECK constraints, composite indexes.
- [ ] `feature_flags` addendum: `ADD COLUMN IF NOT EXISTS` runs clean on both fresh DB (no existing columns) and existing DB (columns already present).
- [ ] Migration idempotent: running twice → no error, no duplicate rows/indexes.
- [ ] Runs clean on PGlite WASM in-process AND standard Postgres (pg driver).
- [ ] Unit test: `tests/db/migrations/0017_platform.test.ts` — asserts every table/column/index via `information_schema`; RED → GREEN.
- [ ] `org_id` NOT NULL on every table; FK to `orgs(id) ON DELETE CASCADE` verified.

## Blocked by

- Pillar 1 issue 01 (schema auth migration) — `orgs`, `users` tables must exist for FKs.
