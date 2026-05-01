---
Status: ready-for-agent
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 01-schema-auth-migration
---

# Events org_id backfill migration (0005) — NOT NULL + default-org backfill

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Write and apply migration `0005_org_id_backfill.sql` that adds `org_id` and `user_id` to the existing `events` table, backfills every existing row with the well-known local org UUID `00000000-0000-0000-0000-000000000001`, promotes `org_id` to NOT NULL, drops the old partial index on `subject`, and creates the two new composite indexes `idx_events_org_created` and `idx_events_subject` covering `(org_id, …)`.

Cuts through: schema migration → migration runner → index verification via EXPLAIN → integration test.

## Acceptance criteria
- [ ] Schema: `events.org_id uuid NOT NULL REFERENCES orgs(id)` and `events.user_id uuid REFERENCES users(id)` present after migration. Old `idx_events_subject` dropped; new `idx_events_org_created` on `(org_id, created_at DESC)` and `idx_events_subject` on `(org_id, subject_kind, subject_id, created_at DESC)` created.
- [ ] Server action / migration runner: migration runs idempotently on PGlite + Postgres. Backfill touches only rows where `org_id IS NULL`.
- [ ] Web surface: N/A — pure schema.
- [ ] CLI command: N/A — pure schema.
- [ ] TUI screen: N/A — pure schema.
- [ ] Tests: `tests/db/migrations/0005_backfill.test.ts` — insert events rows without `org_id`, run migration, assert zero rows have `org_id IS NULL`, assert `EXPLAIN SELECT * FROM events WHERE org_id=$1 ORDER BY created_at DESC LIMIT 50` plan uses the new index (no seq scan). RED → GREEN.

## Blocked by
- `01-schema-auth-migration` (needs `orgs` table + well-known org UUID present before backfill can reference FK).

## Notes
Well-known local org UUID `00000000-0000-0000-0000-000000000001` must be seeded in the `orgs` table before this migration runs; ensure seed order in `src/db/seed.ts` is: orgs → users → sessions → then this backfill.
