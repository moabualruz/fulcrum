---
Status: needs-review
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 01-schema-auth-migration
Owner: claude-orchestrator
ClaimedAt: 2026-05-01T08:00:00Z
CompletedAt: 2026-05-01T15:00:00Z
ReviewVerdict: ROUND-4 FIX APPLIED — IF NOT EXISTS reverted (strict CREATE TABLE in both 20537 + 20538); single-migration split into two production classes (20537: CREATE TABLE orgs+events nullable; 20538: backfill+NOT NULL+FK+indexes); test redesigned as option (d): Phase 1 runs auth+20537, Phase 2 raw INSERTs only (no DDL), Phase 3 runs 20538 for live backfill; per-call C6 citations on all 2 raw INSERTs + EXPLAIN; 6 C6 citations total; CI 116/116 migration tests pass (1 pre-existing flaky failure in uninstall.test.ts under full-suite concurrency, unrelated to this change); per .scratch/agent-os-vision/research/p1-02-round3-review.md
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
