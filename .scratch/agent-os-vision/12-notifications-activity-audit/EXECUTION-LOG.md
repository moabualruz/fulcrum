# Pillar 12 — Execution Log

## P12#10 — Web inbox + activity feed
- **Date:** 2026-05-03
- **Agent:** claude (Opus 4.6)
- **Status:** implemented
- **Commit:** (see git log)
- **Files:**
  - `src/product-kernel/db/migrations/0004_notifications.sql` — user_notifications table
  - `src/product-kernel/store/repositories.ts` — notification CRUD + filtered event queries
  - `src/product-kernel/events.ts` — barrel exports
  - `src/web/src/routes/inbox/+page.server.ts` — inbox load (notifications + my-activity tabs)
  - `src/web/src/routes/inbox/+page.svelte` — inbox UI
  - `src/web/src/routes/projects/[id]/activity/+page.server.ts` — project activity load with filters
  - `src/web/src/routes/projects/[id]/activity/+page.svelte` — project activity UI
  - `src/web/src/routes/inbox/page.server.test.ts` — 6 repository-level tests
  - `src/web/src/routes/inbox/page.load.test.ts` — 2 load-function tests
  - `src/web/src/routes/projects/[id]/activity/page.server.test.ts` — 4 repository-level tests
  - `src/web/src/routes/projects/[id]/activity/page.load.test.ts` — 2 load-function tests
  - `src/web/src/routes/+layout.svelte` — added inbox to command palette
- **Tests:** 14 pass, 0 fail
- **TDD:** RED (4 load tests fail — no route files) → GREEN (route files created, all 14 pass)
