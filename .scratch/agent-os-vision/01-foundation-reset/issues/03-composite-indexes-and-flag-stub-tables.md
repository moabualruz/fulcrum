---
Status: ready-for-agent
Triage: AFK
Pillar: 01-foundation-reset
Blocked-by: 02-events-org-id-backfill
---

# Composite (org_id, …) indexes + flag-stub tables (migrations 0006 + 0007)

## Parent
PRD: `.scratch/agent-os-vision/prds/01-foundation-reset.md`

## What to build
Two migrations applied together:

`0006_composite_indexes.sql` — adds `(org_id, …)` covering indexes on all tenant-scoped tables: `tasks`, `documents`, `memories`, `agent_runs`, `artifacts`, `repos`, `jobs`, `search_documents`.

`0007_flag_stubs.sql` — creates `casbin_rule`, `webhook_subscriptions`, and `notification_rules` tables. All three are inert by default; they are activated only when their respective feature flags (`casbin-policies`, `outbound-webhooks`, `notify-email`/`notify-webhook`/`notify-slack`) are enabled by a later pillar or at runtime.

Cuts through: schema migration files → migration runner → EXPLAIN tests → table-existence tests.

## Acceptance criteria
- [ ] Schema: all nine composite indexes from `0006` created with `IF NOT EXISTS`. `casbin_rule`, `webhook_subscriptions`, `notification_rules` tables from `0007` created with correct columns, FKs, and indexes.
- [ ] Server action / migration runner: both migrations run idempotently. Tables from `0007` exist but contain zero rows on fresh install.
- [ ] Web surface: N/A — pure schema.
- [ ] CLI command: N/A — pure schema.
- [ ] TUI screen: N/A — pure schema.
- [ ] Tests: `tests/db/migrations/0006_indexes.test.ts` — for each new composite index run an EXPLAIN query on the target table with `org_id` predicate; assert plan is index scan, not seq scan. `tests/db/migrations/0007_stubs.test.ts` — assert all three stub tables exist with correct column count and that they are empty post-seed. RED → GREEN.

## Blocked by
- `02-events-org-id-backfill` (all earlier tables must exist before adding indexes to them).

## Notes
`casbin_rule` is consumed by Pillar 5 (Permissions). `webhook_subscriptions` + `notification_rules` are consumed by Pillar 10 (Notifications/Webhooks). Stub tables here so those pillars never need a schema migration of their own for the base table.
