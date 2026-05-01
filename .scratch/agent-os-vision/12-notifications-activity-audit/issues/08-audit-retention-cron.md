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
Daily graphile-worker cron task `audit.prune-events`: for each org with `event_retention_policy.retain_days > 0`, deletes `events WHERE created_at < now() - interval '{N} days' AND org_id=$1`. Audit the prune action itself (write an `events` row for the deletion to org's audit trail before deleting — or write to a separate `audit_prune_log` table). `retain_days = 0` means keep forever. Doctor integration: reports oldest event timestamp per org and current retention setting.

## Acceptance criteria
- [ ] Schema migration: reads `event_retention_policy` (from `0012_notifications`); deletes from `events` (Pillar 1 DDL).
- [ ] tRPC procedure / module: `audit.prune` manual trigger procedure; `registerAuditPruneCron(worker)` in worker bootstrap.
- [ ] Web surface: `/settings/notifications` retention policy setting controls `retain_days`; shows "Events older than N days will be deleted" message.
- [ ] CLI command: `fulcrum audit query --since 2025-01-01 --json` returns no events older than `retain_days`; doctor reports retention setting.
- [ ] TUI screen: Audit panel shows oldest event date; settings shows retention setting.
- [ ] Tests: `retain_days=30`; cron deletes events older than 30 days; `retain_days=0` → nothing deleted; prune action itself logged (audit trail not lost); doctor reports correct oldest-event-date and retention setting; RED→GREEN.

## Blocked by
- `06-trpc-audit-procedures.md` — `audit.retentionPolicy.*` procedures.
- Pillar 1 (Foundation) — graphile-worker cron + `events` table DDL.

## Notes / Tech-stack hints
- A4: default 1 year (`retain_days=365`) per org; configurable per org via `event_retention_policy`.
- Audit the prune: before deleting, write one summary event `verb='audit.pruned'` with payload `{count, oldest_deleted_at}` — this survives the prune (it's the most recent event).
- Safety: if single prune would delete >10k rows, split into batches of 1000 with 100ms delay.
- Prune `user_notifications` and `notification_deliveries` on the same schedule using same `retain_days` (they reference events which are being deleted via CASCADE anyway, but explicit prune for orphaned rows).
