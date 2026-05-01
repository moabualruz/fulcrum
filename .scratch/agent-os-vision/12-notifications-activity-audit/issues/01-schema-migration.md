---
Status: ready-for-agent
Triage: AFK
Pillar: notifications-activity-audit
Blocked-by: []
PRD: .scratch/agent-os-vision/prds/12-notifications-activity-audit.md
Requirements: .scratch/agent-os-vision/REQUIREMENTS.md (Pillar 12 section)
Decisions: [Q26, A4, Q22]
Vision: .scratch/agent-os-vision/VISION-GAPS.md (Notifications / activity feed row; Audit log row)
Docs: []
---

# Schema migration: notification_rules, user_notifications, notification_deliveries, notification_mutes, notification_quiet_hours, audit_retention_policies, webhook_rule_configs, push_subscriptions

## Parent
PRD: `.scratch/agent-os-vision/prds/12-notifications-activity-audit.md` (Schema changes section; issues T12-01)

## What to build
Write migration `0012_notifications` creating all 8 tables with all composite `(org_id, …)` indexes (Q22), UNIQUE constraints, FK cascades, and CHECK constraints as specified in the PRD schema block. Also creates `event_retention_policy(org_id, retain_days)` table per A4 (default 1 year per org, configurable). All migrations idempotent.

## Acceptance criteria
- [ ] Schema migration: `0012_notifications` applies clean twice on PGlite + PostgreSQL; all 9 tables (8 notification + 1 retention policy) present; UNIQUE constraints enforced; FK cascades tested (delete org → cascade to all notification tables); GIN index on `notification_rules.event_pattern`.
- [ ] tRPC procedure / module: migration runs as part of `fulcrum db migrate`; no procedure in this slice.
- [ ] Web surface: N/A.
- [ ] CLI command: `fulcrum doctor --json` reports all notification tables present and `notification_rules` count.
- [ ] TUI screen: N/A.
- [ ] Tests: migration unit test asserts all tables + indexes; UNIQUE `(user_id, endpoint)` on `push_subscriptions` enforced; `status CHECK` on `notification_deliveries` enforced; `event_retention_policy` default row created for local org with `retain_days=365`; RED→GREEN.

## Blocked by
- Pillar 1 (Foundation) — `orgs`, `users`, `projects`, `events` tables must exist; graphile-worker bootstrap.

## Notes / Tech-stack hints
- `notification_rules.channels text[]` — GIN index for `channels @>` queries (`@>` operator: "includes channel").
- `audit_retention_policies` vs `event_retention_policy` (A4): use `event_retention_policy` name per A4; single UNIQUE `(org_id, project_id NULL)` row per scope.
- `push_subscriptions`: `p256dh` and `auth` are base64url-encoded — store as text; `endpoint` may be long URL.
- Default retention: on local org seed, insert `event_retention_policy(org_id='00000000-0000-0000-0000-000000000001', retain_days=365)` per A4 default.
