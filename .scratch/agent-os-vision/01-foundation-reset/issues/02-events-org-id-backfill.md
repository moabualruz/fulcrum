---
Status: needs-review
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 01-schema-auth-migration
Owner: claude-orchestrator
ClaimedAt: 2026-05-01T05:00:00Z
CompletedAt: 2026-05-01T13:00:00Z
ReviewVerdict: ROUND-3 FIX APPLIED — Blocker 1 resolved via single-ORM Phase 1-4 architecture; migration uses CREATE TABLE IF NOT EXISTS to allow Phase 2 pre-seeding; ormB removed; C6 sweep clean; transactional:false scoped to test config only; explain-probe-test.test.ts confirmed not present (not orphan). CI 11/11 green.
---

# Events org_id backfill migration class — NOT NULL + default-org backfill

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Add `@ManyToOne(() => Org, { fieldName: 'org_id' })` and `@ManyToOne(() => User, { fieldName: 'user_id', nullable: true })` to the existing `Event` entity, then run `mikro-orm migration:create` to emit `Migration<timestamp>_events_org_id_backfill.ts`. Hand-extend the auto-generated `up()` body with one sanctioned `em.nativeUpdate('Event', { org: null }, { org: '00000000-0000-0000-0000-000000000001' })` between the column-add and the NOT NULL flip — the only C6 carve-out (data backfill inside a migration class). Replace the old single-column index on `subject` with two new composite `@Index` decorators on `Event` (`idx_events_org_created` over `(org, createdAt desc)` and `idx_events_subject` over `(org, subjectKind, subjectId, createdAt desc)`) so the next snapshot is clean.

Cuts through: `Event` entity decorator update → `mikro-orm migration:create` emits class → manual backfill `addSql`/`em.nativeUpdate` insertion → migrator run → `em.getMetadata()` + `eventRepo` round-trip + EXPLAIN integration test.

## Acceptance criteria
- [ ] Entity: `Event.org!: Org` (`@ManyToOne` non-nullable post-backfill) + `Event.user?: User` (`@ManyToOne` nullable) declared. New `@Index` decorators on `Event` for `(org, createdAt desc)` and `(org, subjectKind, subjectId, createdAt desc)` reflected in `em.getMetadata().get(Event).indexes`.
- [ ] Migration class: `Migration<timestamp>_events_org_id_backfill.ts` runs idempotently on PGlite + Postgres. `up()` body: column-add (auto) → backfill (manual `em.nativeUpdate`) → NOT NULL flip + FK + new indexes + drop old `idx_events_subject` (auto). Backfill touches only rows where `org IS NULL`.
- [ ] Server action / migration runner: `MikroORM.getMigrator().up({ to: 'Migration<timestamp>_events_org_id_backfill' })` succeeds.
- [ ] Web surface: N/A — pure schema.
- [ ] CLI command: N/A — pure schema.
- [ ] TUI screen: N/A — pure schema.
- [ ] Tests: `tests/db/migrations/events-backfill.test.ts` — pre-migration: `em.create(Event, {...})` (without `org`) + flush; run migrator; assert `await eventRepo.count({ org: null }) === 0`. EXPLAIN test: build the QueryBuilder for `eventRepo.find({ org }, { orderBy: { createdAt: 'desc' }, limit: 50 })`, run `em.getConnection().execute('explain ' + qb.getQuery())`, assert plan uses Index Scan (no seq scan). RED → GREEN.

## Blocked by
- `01-schema-auth-migration` (needs `Org` entity + well-known org row to satisfy FK; seed runs after `01`).

## Notes
Well-known local org UUID `00000000-0000-0000-0000-000000000001` must be seeded in `Org` table before this migration runs; ensure seed order in `src/db/seed.ts` is: `em.upsert(Org, ...)` → `em.upsert(User, ...)` → `em.create(Session, ...)` → then this backfill class. The `addSql`/`em.nativeUpdate` carve-out for the backfill body is permitted under C6 only because it's inside a migration class; never in service or repository code.
