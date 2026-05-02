---
Status: ready-for-agent
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: [06-trpc-audit-procedures.md]
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [A4, Q35]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Audit log row)
Docs: []
---

# Audit log retention cron: daily prune of events past retain_days, per-org policy, audit of prune action

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Always-on: Audit log surface; A4 retention requirement)

## What to build
Daily graphile-worker cron task `audit.prune-events`: for each org with `EventRetentionPolicy.retainDays > 0`, loads expired events through `eventRepo.findExpiredForRetention(org, retainDays)` and deletes them in batches. Audit the prune action itself by creating a summary `Event` before deleting expired entries. `retain_days = 0` means keep forever. Doctor integration: reports oldest event timestamp per org and current retention setting.

## Acceptance criteria
- [ ] Schema migration: reads `EventRetentionPolicy` (from migration class `Migration<timestamp>`); deletes through `EventRepository` (Pillar 1 entity).
- [ ] tRPC procedure / module: `audit.prune` manual trigger procedure; `registerAuditPruneCron(worker)` in worker bootstrap.
- [ ] Web surface: `/settings/notifications` retention policy setting controls `retain_days`; shows "Events older than N days will be deleted" message.
- [ ] CLI command: `fulcrum audit query --since 2025-01-01 --json` returns no events older than `retain_days`; doctor reports retention setting.
- [ ] TUI screen: Audit panel shows oldest event date; settings shows retention setting.
- [ ] Tests: `retain_days=30`; cron deletes events older than 30 days; `retain_days=0` → nothing deleted; prune action itself logged (audit trail not lost); doctor reports correct oldest-event-date and retention setting; RED→GREEN.

## Blocked by
- `06-trpc-audit-procedures.md` — `audit.retentionPolicy.*` procedures.
- Pillar 1 (Foundation) — graphile-worker cron + `Event` entity.

## Notes / Tech-stack hints
- A4: default 1 year (`retain_days=365`) per org; configurable per org via `event_retention_policy`.
- Audit the prune: before deleting, write one summary event `verb='audit.pruned'` with payload `{count, oldest_deleted_at}` — this survives the prune (it's the most recent event).
- Safety: if single prune would delete >10k rows, split into batches of 1000 with 100ms delay.
- Prune `user_notifications` and `notification_deliveries` on the same schedule using same `retain_days` (they reference events which are being deleted via CASCADE anyway, but explicit prune for orphaned rows).
