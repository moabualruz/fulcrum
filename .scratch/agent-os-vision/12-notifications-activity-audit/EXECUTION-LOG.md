# Pillar 12 — Execution Log

## P12#11 — Web notification settings
- **Date:** 2026-05-03
- **Agent:** codex
- **Status:** implemented
- **Commit:** unavailable — sandbox denied git index lock under parent repo worktree metadata
- **Files:**
  - `src/trpc/schemas/notifications.ts` — channel enum includes discord + push
  - `src/trpc/routers/notifications.ts` — channel list parity + `notify.mutes.list`
  - `src/web/src/routes/settings/notifications/+page.server.ts` — settings load/actions for rules, quiet-hours, mutes
  - `src/web/src/routes/settings/notifications/+page.svelte` — settings UI
  - `src/web/src/routes/settings/notifications/channels/+page.server.ts` — channel config actions
  - `src/web/src/routes/settings/notifications/channels/+page.svelte` — channel config UI
  - `src/web/src/routes/settings/notifications/page.server.test.ts` — RED/GREEN route tests
  - `src/web/src/routes/settings/notifications/channels/page.server.test.ts` — RED/GREEN channel action test
- **Tests:** `bun test --conditions=svelte src/routes/settings/notifications/page.server.test.ts src/routes/settings/notifications/channels/page.server.test.ts` — 3 pass, 0 fail
- **CI:** `bun run ci` blocked at install: restricted network/cache misses for registry tarballs
- **TDD:** RED (3 tests fail — route modules missing) → GREEN (route modules + router gap added, 3 pass)

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
